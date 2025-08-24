
import { logger } from '../lib/logger.js';
import { agentRegistry } from './agentRegistry.js';
import { toolRegistry } from './tools/registry.js';
import type { FinancialContext, AgentExecutionResult, AgentInteraction } from './types.js';

export class AgentManager {
  private initialized = false;
  private readonly initializationPromise: Promise<boolean>;

  constructor() {
    this.initializationPromise = this.initialize();
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      logger.info('Initializing Agent Management System...');

      // Initialize tools first
      await this.initializeTools();

      // Initialize agent registry
      await agentRegistry.initialize();

      // Verify system integrity
      if (!this.validateSystem()) {
        throw new Error('Agent system validation failed');
      }

      this.initialized = true;
      logger.info('Agent Management System initialized successfully');

      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Agent Management System');
      this.initialized = false;
      return false;
    }
  }

  private async initializeTools(): Promise<boolean> {
    try {
      // The tool registry initializes itself in its constructor
      const toolCount = toolRegistry.getToolCount();
      
      if (toolCount === 0) {
        throw new Error('No tools were initialized');
      }

      logger.info({ toolCount }, 'Financial tools initialized');
      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize tools');
      return false;
    }
  }

  private validateSystem(): boolean {
    try {
      // Check agent registry
      const agents = agentRegistry.getAllAgents();
      if (agents.length === 0) {
        logger.error('No agents available in registry');
        return false;
      }

      // Check tool registry
      const toolCount = toolRegistry.getToolCount();
      if (toolCount === 0) {
        logger.error('No tools available in registry');
        return false;
      }

      // Verify core agents exist
      const requiredAgents = ['financial_advisor', 'budget_coach', 'transaction_analyst', 'insight_generator'];
      for (const agentName of requiredAgents) {
        const agent = agentRegistry.getAgent(agentName);
        if (!agent) {
          logger.error({ agentName }, 'Required agent not found');
          return false;
        }
      }

      logger.info({
        agentCount: agents.length,
        toolCount,
        requiredAgents: requiredAgents.length
      }, 'Agent system validation passed');

      return true;
    } catch (error) {
      logger.error({ error }, 'System validation failed');
      return false;
    }
  }

  async processUserMessage(
    userId: string,
    message: string,
    options: {
      agentName?: string;
      sessionId?: string;
      context?: Partial<FinancialContext>;
      previousInteractions?: AgentInteraction[];
    } = {}
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    try {
      // Ensure system is initialized
      await this.initializationPromise;
      if (!this.initialized) {
        throw new Error('Agent system not properly initialized');
      }

      const sessionId = options.sessionId || `session_${Date.now()}`;
      
      logger.info({ 
        userId, 
        sessionId,
        agentName: options.agentName,
        messageLength: message.length 
      }, 'Processing user message');

      // Determine which agent to use
      const targetAgentName = options.agentName || this.routeMessage(message);
      const agent = agentRegistry.getAgent(targetAgentName);

      if (!agent) {
        throw new Error(`Agent '${targetAgentName}' not available`);
      }

      // Build complete context
      const context: FinancialContext = {
        userId,
        ...options.context,
      };

      // Execute the agent
      const response = await agentRegistry.runAgent(targetAgentName, message, {
        ...context,
        sessionId,
        timestamp: new Date(),
        previousInteractions: options.previousInteractions || [],
      });

      const duration = Date.now() - startTime;

      const result: AgentExecutionResult = {
        success: true,
        response,
        agentName: targetAgentName,
        sessionId,
        timestamp: new Date(),
        duration,
      };

      logger.info({ 
        userId, 
        agentName: targetAgentName,
        duration,
        responseLength: response.length 
      }, 'Message processed successfully');

      return result;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      logger.error({ 
        error, 
        userId, 
        duration,
        agentName: options.agentName 
      }, 'Failed to process user message');

      return {
        success: false,
        response: 'I apologize, but I encountered an error processing your request. Please try again.',
        agentName: options.agentName || 'unknown',
        sessionId: options.sessionId || `error_${Date.now()}`,
        timestamp: new Date(),
        duration,
        error: error.message,
      };
    }
  }

  private routeMessage(message: string): string {
    // Use the agent registry's routing logic
    const agent = agentRegistry.routeToAgent(message);
    return agent.name || 'financial_advisor';
  }

  async executeDirectTool(
    userId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    context: Partial<FinancialContext> = {}
  ): Promise<any> {
    try {
      await this.initializationPromise;
      if (!this.initialized) {
        throw new Error('Agent system not properly initialized');
      }

      logger.info({ userId, toolName }, 'Executing tool directly');

      const executionContext = {
        userId,
        sessionId: `direct_${Date.now()}`,
        agentName: 'direct_execution',
        timestamp: new Date(),
      };

      const result = await toolRegistry.executeTool(
        toolName,
        { ...parameters, userId },
        { ...context, ...executionContext }
      );

      return result;
    } catch (error) {
      logger.error({ error, userId, toolName }, 'Direct tool execution failed');
      throw error;
    }
  }

  getSystemStatus(): Record<string, any> {
    return {
      initialized: this.initialized,
      agents: {
        count: agentRegistry.getAllAgents().length,
        available: Array.from(agentRegistry.getAgentNames()),
        metrics: agentRegistry.getAgentMetrics(),
      },
      tools: {
        count: toolRegistry.getToolCount(),
        metrics: toolRegistry.getToolMetrics(),
        recentExecutions: toolRegistry.getExecutionHistory(5),
      },
      timestamp: new Date().toISOString(),
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isRegistryReady(): boolean {
    return this.initialized && 
           agentRegistry.isInitialized() && 
           toolRegistry.getToolCount() > 0;
  }

  async reinitialize(): Promise<boolean> {
    logger.info('Reinitializing agent management system');
    this.initialized = false;
    return await this.initialize();
  }
}

// Create singleton instance
export const agentManager = new AgentManager();

// Helper function for route validation
export function ensureRegistryReady(): boolean {
  if (!agentManager.isRegistryReady()) {
    logger.error('Agent registry not ready');
    return false;
  }
  return true;
}

// Export for backwards compatibility
export { agentRegistry, toolRegistry };
