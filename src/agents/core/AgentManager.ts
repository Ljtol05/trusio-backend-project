
import { logger } from '../../lib/logger.js';
import { agentLifecycleManager } from '../config.js';
import { agentValidator } from './AgentValidator.js';
import { agentContextManager } from './AgentContextManager.js';
import { memoryManager } from './MemoryManager.js';
import { goalTracker } from './GoalTracker.js';
import {
  FinancialAdvisorAgent,
  BudgetCoachAgent,
  TransactionAnalystAgent,
  InsightGeneratorAgent,
} from '../agents/index.js';
import type { FinancialContext, AgentExecutionResult } from '../types.js';

export class AgentManager {
  private agents: Map<string, any> = new Map();
  private isInitialized = false;

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents(): void {
    try {
      // Initialize all core agents
      this.agents.set('financial_advisor', new FinancialAdvisorAgent());
      this.agents.set('budget_coach', new BudgetCoachAgent());
      this.agents.set('transaction_analyst', new TransactionAnalystAgent());
      this.agents.set('insight_generator', new InsightGeneratorAgent());

      logger.info({
        agentCount: this.agents.size,
        agentNames: Array.from(this.agents.keys())
      }, 'Agent Manager initialized with core agents');

      this.isInitialized = true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Agent Manager');
      throw new Error('Agent Manager initialization failed');
    }
  }

  /**
   * Route a message to the most appropriate agent based on content analysis
   */
  async routeToAgent(message: string, context: FinancialContext): Promise<string> {
    try {
      const agentName = this.determineAgentFromMessage(message);
      return await this.runAgent(agentName, message, {
        ...context,
        sessionId: `route_${Date.now()}`,
        timestamp: new Date(),
        previousInteractions: [],
      });
    } catch (error: any) {
      logger.error({ error: error.message, message }, 'Agent routing failed');
      throw new Error('Failed to route message to appropriate agent');
    }
  }

  /**
   * Run a specific agent with a message and context
   */
  async runAgent(
    agentName: string,
    message: string,
    context: FinancialContext & {
      sessionId: string;
      timestamp: Date;
      previousInteractions: any[];
    }
  ): Promise<string> {
    try {
      const agent = this.agents.get(agentName);
      if (!agent) {
        throw new Error(`Agent '${agentName}' not found`);
      }

      if (!agent.isReady()) {
        throw new Error(`Agent '${agentName}' is not ready`);
      }

      logger.info({
        agentName,
        userId: context.userId,
        sessionId: context.sessionId,
        messageLength: message.length
      }, 'Running agent with memory integration');

      // Build enhanced memory context
      const memoryContext = await memoryManager.buildAgentMemoryContext(
        context.userId,
        agentName,
        context.sessionId,
        true // Include history
      );

      // Track goals if available
      let goalTrackingData: any[] = [];
      if (context.goals && context.goals.length > 0) {
        goalTrackingData = await goalTracker.trackGoalProgress(context.userId, context);
      }

      // Enhanced context with memory and goal tracking
      const enhancedContext = {
        ...context,
        memoryContext,
        goalTrackingData,
        personalization: memoryContext.personalizations,
        contextSummary: memoryContext.contextSummary,
      };

      const result: AgentExecutionResult = await agent.run(message, enhancedContext);

      if (!result.success) {
        throw new Error(result.error || 'Agent execution failed');
      }

      // Store the interaction in memory
      await memoryManager.storeInteraction(
        context.userId,
        agentName,
        context.sessionId,
        message,
        result.response,
        context,
        {
          duration: result.duration,
          success: result.success,
          goalTrackingEnabled: goalTrackingData.length > 0,
        }
      );

      return result.response;

    } catch (error: any) {
      logger.error({
        error: error.message,
        agentName,
        userId: context.userId
      }, 'Agent execution failed');
      throw error;
    }
  }

  /**
   * Execute agent handoff from one agent to another
   */
  async executeHandoff(
    fromAgent: string,
    toAgent: string,
    message: string,
    reason: string,
    context: FinancialContext & {
      sessionId: string;
      timestamp: Date;
      previousInteractions: any[];
    }
  ): Promise<string> {
    try {
      logger.info({
        fromAgent,
        toAgent,
        reason,
        userId: context.userId,
        sessionId: context.sessionId
      }, 'Executing agent handoff');

      // Validate both agents exist
      if (!this.agents.has(fromAgent) || !this.agents.has(toAgent)) {
        throw new Error(`Invalid agent handoff: ${fromAgent} -> ${toAgent}`);
      }

      // Add handoff context to the message
      const handoffMessage = `[Handoff from ${fromAgent}: ${reason}]\n\n${message}`;

      // Update context with handoff information
      const handoffContext = {
        ...context,
        previousInteractions: [
          ...context.previousInteractions,
          {
            role: 'system' as const,
            content: `Handoff from ${fromAgent} to ${toAgent}: ${reason}`,
            timestamp: new Date().toISOString(),
            agentName: fromAgent,
          }
        ],
      };

      // Run the target agent
      return await this.runAgent(toAgent, handoffMessage, handoffContext);

    } catch (error: any) {
      logger.error({
        error: error.message,
        fromAgent,
        toAgent,
        userId: context.userId
      }, 'Agent handoff failed');
      throw new Error(`Handoff failed: ${error.message}`);
    }
  }

  /**
   * Determine the most appropriate agent based on message content
   */
  private determineAgentFromMessage(message: string): string {
    const messageLower = message.toLowerCase();

    // Budget-related keywords
    if (this.containsKeywords(messageLower, [
      'budget', 'envelope', 'allocate', 'fund', 'allocation', 'category',
      'distribute', 'balance', 'target', 'budget plan'
    ])) {
      return 'budget_coach';
    }

    // Transaction analysis keywords
    if (this.containsKeywords(messageLower, [
      'transaction', 'spending', 'expense', 'pattern', 'categorize',
      'analyze spending', 'transaction history', 'expense analysis'
    ])) {
      return 'transaction_analyst';
    }

    // Insight and analytics keywords
    if (this.containsKeywords(messageLower, [
      'insight', 'trend', 'analysis', 'progress', 'goal', 'recommendation',
      'report', 'summary', 'forecast', 'predict', 'opportunity'
    ])) {
      return 'insight_generator';
    }

    // Default to financial advisor for general queries
    return 'financial_advisor';
  }

  /**
   * Check if message contains any of the specified keywords
   */
  private containsKeywords(message: string, keywords: string[]): boolean {
    return keywords.some(keyword => message.includes(keyword));
  }

  /**
   * Get agent by name
   */
  getAgent(agentName: string): any {
    return this.agents.get(agentName);
  }

  /**
   * Get all available agent names
   */
  getAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get agent capabilities
   */
  getAgentCapabilities(agentName: string): string[] {
    const agent = this.agents.get(agentName);
    return agent?.getCapabilities() || [];
  }

  /**
   * Get all agents
   */
  getAllAgents(): Record<string, any> {
    return Object.fromEntries(this.agents);
  }

  /**
   * Get agent metrics
   */
  getAgentMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    this.agents.forEach((agent, name) => {
      metrics[name] = {
        isAvailable: agent.isReady(),
        capabilities: agent.getCapabilities(),
        ...agentLifecycleManager.getAgentMetrics(name),
      };
    });

    return metrics;
  }

  /**
   * Check if agent manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized && Array.from(this.agents.values()).every(agent => agent.isReady());
  }

  /**
   * Get initialization status
   */
  getInitializationStatus(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const agentManager = new AgentManager();
