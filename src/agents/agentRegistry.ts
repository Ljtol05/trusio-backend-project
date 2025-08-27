
import { logger } from '../lib/logger.js';
import { agentManager } from './core/AgentManager.js';
import { agentContextManager } from './core/AgentContextManager.js';
import { agentValidator } from './core/AgentValidator.js';
import { AGENT_CAPABILITIES } from './config.js';
import type { FinancialContext, AgentExecutionResult } from './types.js';

export class AgentRegistry {
  private isRegistryInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Agent manager initializes itself in constructor
      if (agentManager.isReady()) {
        this.isRegistryInitialized = true;
        logger.info('Agent Registry initialized successfully');
      } else {
        throw new Error('Agent Manager is not ready');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Agent Registry');
      throw error;
    }
  }

  /**
   * Route a message to the most appropriate agent
   */
  async routeToAgent(message: string, context?: Partial<FinancialContext>): Promise<any> {
    if (!this.isRegistryInitialized) {
      throw new Error('Agent Registry not initialized');
    }

    // Build minimal context if not provided
    const defaultContext: FinancialContext = {
      userId: context?.userId || 'unknown',
      ...context,
    };

    return agentManager.routeToAgent(message, defaultContext);
  }

  /**
   * Run a specific agent
   */
  async runAgent(
    agentName: string,
    message: string,
    context: FinancialContext & {
      sessionId?: string;
      timestamp?: Date;
      previousInteractions?: any[];
    }
  ): Promise<string> {
    if (!this.isRegistryInitialized) {
      throw new Error('Agent Registry not initialized');
    }

    const enhancedContext = {
      ...context,
      sessionId: context.sessionId || `session_${Date.now()}`,
      timestamp: context.timestamp || new Date(),
      previousInteractions: context.previousInteractions || [],
    };

    return agentManager.runAgent(agentName, message, enhancedContext);
  }

  /**
   * Execute agent handoff
   */
  async executeHandoff(
    fromAgent: string,
    toAgent: string,
    message: string,
    reason: string,
    context: FinancialContext & {
      sessionId: string;
      timestamp: Date;
      previousInteractions?: any[];
    }
  ): Promise<string> {
    if (!this.isRegistryInitialized) {
      throw new Error('Agent Registry not initialized');
    }

    const enhancedContext = {
      ...context,
      previousInteractions: context.previousInteractions || [],
    };

    return agentManager.executeHandoff(fromAgent, toAgent, message, reason, enhancedContext);
  }

  /**
   * Get agent by name
   */
  getAgent(agentName: string): any {
    return agentManager.getAgent(agentName);
  }

  /**
   * Get all available agent names
   */
  getAgentNames(): Set<string> {
    return new Set(agentManager.getAgentNames());
  }

  /**
   * Get agent capabilities
   */
  getAgentCapabilities(agentName: string): string[] {
    return agentManager.getAgentCapabilities(agentName);
  }

  /**
   * Get all agents
   */
  getAllAgents(): Record<string, any> {
    return agentManager.getAllAgents();
  }

  /**
   * Get agent metrics
   */
  getAgentMetrics(): Record<string, any> {
    return agentManager.getAgentMetrics();
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.isRegistryInitialized && agentManager.isReady();
  }

  /**
   * Build full agent context for execution
   */
  async buildAgentContext(
    userId: string,
    sessionId: string,
    agentName: string,
    includeHistory = true,
    maxHistory = 20
  ): Promise<any> {
    return agentContextManager.createAgentContext(
      userId,
      sessionId,
      agentName,
      includeHistory,
      maxHistory
    );
  }

  /**
   * Save agent interaction to history
   */
  async saveInteraction(
    userId: string,
    sessionId: string,
    agentName: string,
    userMessage: string,
    agentResponse: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    return agentContextManager.saveInteraction(
      userId,
      sessionId,
      agentName,
      userMessage,
      agentResponse,
      metadata
    );
  }

  /**
   * Validate agent input
   */
  validateInput(input: unknown): { isValid: boolean; data?: any; errors?: string[] } {
    return agentValidator.validateInput(input);
  }

  /**
   * Validate agent output
   */
  validateOutput(output: unknown): { isValid: boolean; data?: any; errors?: string[] } {
    return agentValidator.validateOutput(output);
  }

  /**
   * Health check for all agents
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};
    
    agentManager.getAgentNames().forEach(agentName => {
      const agent = agentManager.getAgent(agentName);
      health[agentName] = agent?.isReady() || false;
    });

    return health;
  }

  /**
   * Get registry statistics
   */
  getStats(): Record<string, any> {
    return {
      isInitialized: this.isRegistryInitialized,
      agentCount: agentManager.getAgentNames().length,
      availableAgents: agentManager.getAgentNames(),
      agentMetrics: agentManager.getAgentMetrics(),
      contextCacheStats: agentContextManager.getCacheStats(),
    };
  }
}

// Export singleton instance
export const agentRegistry = new AgentRegistry();
