
import { Agent, setDefaultOpenAIKey, setDefaultOpenAIClient } from "@openai/agents";
import { AgentConfig, AgentInstance, AgentRegistry, AgentMetrics, AGENT_ROLES } from "./types.js";
import { agentConfigManager } from "./config.js";
import { openai, MODELS } from "../lib/openai.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export class AgentManager {
  private registry: AgentRegistry = {};
  private initialized = false;

  constructor() {
    // Ensure OpenAI is configured for agents
    if (env.OPENAI_API_KEY && openai) {
      setDefaultOpenAIKey(env.OPENAI_API_KEY);
      setDefaultOpenAIClient(openai);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info("Agent manager already initialized");
      return;
    }

    if (!env.OPENAI_API_KEY || !openai) {
      throw new Error("OpenAI configuration required for agent initialization");
    }

    try {
      const configs = agentConfigManager.getActiveConfigs();
      logger.info({ count: configs.length }, "Initializing agents");

      for (const config of configs) {
        await this.initializeAgent(config);
      }

      // Configure handoffs after all agents are initialized
      await this.configureHandoffs();

      this.initialized = true;
      logger.info({ 
        initialized: Object.keys(this.registry).length,
        roles: Object.keys(this.registry)
      }, "Agent manager initialized successfully");

    } catch (error) {
      logger.error({ error }, "Failed to initialize agent manager");
      throw error;
    }
  }

  private async initializeAgent(config: AgentConfig): Promise<void> {
    try {
      // Create agent instance using OpenAI Agents SDK
      const agent = new Agent({
        name: config.name,
        instructions: config.instructions,
        model: config.model || MODELS.agentic,
        temperature: config.temperature || 0.3,
        max_tokens: config.maxTokens || 1000,
        tools: [], // Tools will be added in next task
        // handoffs will be configured after all agents are initialized
      });

      // Initialize metrics
      const metrics: AgentMetrics = {
        agentName: config.name,
        totalInteractions: 0,
        successfulInteractions: 0,
        averageResponseTime: 0,
        averageConfidence: 0,
        lastUsed: new Date().toISOString(),
        errorCount: 0,
        handoffCount: 0,
      };

      // Create agent instance
      const instance: AgentInstance = {
        config,
        agent,
        isInitialized: true,
        lastUsed: new Date(),
        metrics,
      };

      this.registry[config.role] = instance;
      logger.info({ 
        role: config.role, 
        name: config.name,
        model: config.model || MODELS.agentic
      }, "Agent initialized successfully");

    } catch (error) {
      logger.error({ 
        role: config.role, 
        name: config.name, 
        error 
      }, "Failed to initialize agent");
      throw error;
    }
  }

  getAgent(role: string): AgentInstance | null {
    return this.registry[role] || null;
  }

  getAllAgents(): AgentRegistry {
    return { ...this.registry };
  }

  getActiveAgents(): AgentInstance[] {
    return Object.values(this.registry).filter(
      instance => instance.config.isActive && instance.isInitialized
    );
  }

  async getTriageAgent(): Promise<AgentInstance> {
    const triageAgent = this.getAgent(AGENT_ROLES.TRIAGE);
    if (!triageAgent) {
      throw new Error("Triage agent not initialized");
    }
    return triageAgent;
  }

  async updateAgentMetrics(
    role: string, 
    update: Partial<AgentMetrics>
  ): Promise<void> {
    const instance = this.registry[role];
    if (!instance) {
      logger.warn({ role }, "Attempted to update metrics for non-existent agent");
      return;
    }

    instance.metrics = {
      ...instance.metrics,
      ...update,
      lastUsed: new Date().toISOString(),
    };

    instance.lastUsed = new Date();
    
    logger.debug({ 
      role, 
      metrics: instance.metrics 
    }, "Updated agent metrics");
  }

  async recordInteraction(
    role: string, 
    success: boolean, 
    responseTime: number, 
    confidence?: number
  ): Promise<void> {
    const instance = this.registry[role];
    if (!instance) return;

    const metrics = instance.metrics;
    const newTotal = metrics.totalInteractions + 1;
    const newSuccessful = success ? metrics.successfulInteractions + 1 : metrics.successfulInteractions;
    const newErrorCount = success ? metrics.errorCount : metrics.errorCount + 1;

    // Calculate running averages
    const newAvgResponseTime = (
      (metrics.averageResponseTime * metrics.totalInteractions) + responseTime
    ) / newTotal;

    let newAvgConfidence = metrics.averageConfidence;
    if (confidence !== undefined) {
      newAvgConfidence = (
        (metrics.averageConfidence * metrics.totalInteractions) + confidence
      ) / newTotal;
    }

    await this.updateAgentMetrics(role, {
      totalInteractions: newTotal,
      successfulInteractions: newSuccessful,
      averageResponseTime: Math.round(newAvgResponseTime),
      averageConfidence: Math.round(newAvgConfidence),
      errorCount: newErrorCount,
    });
  }

  async recordHandoff(fromRole: string, toRole: string): Promise<void> {
    await this.updateAgentMetrics(fromRole, {
      handoffCount: (this.registry[fromRole]?.metrics.handoffCount || 0) + 1
    });

    logger.info({ fromRole, toRole }, "Agent handoff recorded");
  }

  getAgentHealth(): Record<string, any> {
    const health: Record<string, any> = {};
    
    Object.entries(this.registry).forEach(([role, instance]) => {
      const metrics = instance.metrics;
      const successRate = metrics.totalInteractions > 0 
        ? (metrics.successfulInteractions / metrics.totalInteractions) * 100 
        : 100;

      health[role] = {
        isActive: instance.config.isActive,
        isInitialized: instance.isInitialized,
        lastUsed: instance.lastUsed,
        totalInteractions: metrics.totalInteractions,
        successRate: Math.round(successRate),
        averageResponseTime: metrics.averageResponseTime,
        averageConfidence: metrics.averageConfidence,
        errorCount: metrics.errorCount,
        handoffCount: metrics.handoffCount,
      };
    });

    return health;
  }

  private async configureHandoffs(): Promise<void> {
    // Configure handoffs between agents based on their config
    const configs = agentConfigManager.getActiveConfigs();
    
    for (const config of configs) {
      const instance = this.registry[config.role];
      if (!instance || !config.handoffs) continue;

      const handoffTargets: Record<string, Agent> = {};
      
      for (const targetRole of config.handoffs) {
        const targetInstance = this.registry[targetRole];
        if (targetInstance) {
          handoffTargets[targetRole] = targetInstance.agent;
        }
      }

      // Set the handoff targets on the agent
      // Note: This will be properly implemented when tools are added in Task 3
      logger.debug({ 
        fromRole: config.role, 
        toRoles: Object.keys(handoffTargets) 
      }, "Configured agent handoffs");
    }
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down agent manager");
    
    // Log final metrics
    Object.entries(this.registry).forEach(([role, instance]) => {
      logger.info({ 
        role, 
        metrics: instance.metrics 
      }, "Final agent metrics");
    });

    this.registry = {};
    this.initialized = false;
    
    logger.info("Agent manager shutdown complete");
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getInitializedCount(): number {
    return Object.values(this.registry).filter(
      instance => instance.isInitialized
    ).length;
  }
}

// Singleton instance
export const agentManager = new AgentManager();

// Helper function to ensure agents are initialized
export async function ensureAgentsInitialized(): Promise<void> {
  if (!agentManager.isInitialized()) {
    await agentManager.initialize();
  }
}

// Helper functions for common operations
export const getTriageAgent = () => agentManager.getAgent(AGENT_ROLES.TRIAGE);
export const getFinancialCoachAgent = () => agentManager.getAgent(AGENT_ROLES.FINANCIAL_COACH);
export const getBudgetAnalyzerAgent = () => agentManager.getAgent(AGENT_ROLES.BUDGET_ANALYZER);
export const getEnvelopeManagerAgent = () => agentManager.getAgent(AGENT_ROLES.ENVELOPE_MANAGER);
export const getTransactionProcessorAgent = () => agentManager.getAgent(AGENT_ROLES.TRANSACTION_PROCESSOR);
export const getInsightGeneratorAgent = () => agentManager.getAgent(AGENT_ROLES.INSIGHT_GENERATOR);

// Validate registry is ready
export const ensureRegistryReady = (): boolean => {
  if (!agentManager.isInitialized()) {
    logger.error('Agent manager not initialized');
    return false;
  }
  
  const activeAgents = agentManager.getActiveAgents();
  const requiredRoles = Object.values(AGENT_ROLES);
  
  const missingAgents = requiredRoles.filter(role => 
    !activeAgents.some(agent => agent.config.role === role)
  );
  
  if (missingAgents.length > 0) {
    logger.error({ missingAgents }, 'Required agents missing from registry');
    return false;
  }
  
  return true;
};
