
import { Agent } from "@openai/agents";
import { AgentRole, AgentRegistry, FinancialRunContext } from "./types.js";
import { AGENT_CONFIGS, buildContextualInstructions } from "./config.js";
import { logger } from "../lib/logger.js";

export class FinancialAgentRegistry implements AgentRegistry {
  private agents: Map<AgentRole, Agent> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents(): void {
    try {
      // Initialize all agents with their base configurations
      Object.entries(AGENT_CONFIGS).forEach(([role, config]) => {
        const agentRole = role as AgentRole;
        
        const agent = new Agent({
          name: config.name,
          instructions: config.instructions,
          model: config.model,
          modelSettings: {
            temperature: config.temperature,
            max_tokens: config.maxTokens,
          },
          tools: config.tools || [],
        });

        // Add event listeners for debugging and monitoring
        agent.on('agent_start', (ctx, agentInstance) => {
          logger.info({
            agentName: agentInstance.name,
            sessionId: (ctx as FinancialRunContext).sessionId,
          }, 'Agent started');
        });

        agent.on('agent_end', (ctx, output) => {
          logger.info({
            agentName: config.name,
            sessionId: (ctx as FinancialRunContext).sessionId,
            outputLength: output?.length || 0,
          }, 'Agent completed');
        });

        agent.on('tool_call', (ctx, toolCall) => {
          logger.info({
            agentName: config.name,
            toolName: toolCall.function?.name,
            sessionId: (ctx as FinancialRunContext).sessionId,
          }, 'Tool called');
        });

        this.agents.set(agentRole, agent);
        logger.info(`Initialized agent: ${config.name} (${agentRole})`);
      });

      this.initialized = true;
      logger.info(`Agent registry initialized with ${this.agents.size} agents`);
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize agent registry');
      throw new Error(`Agent registry initialization failed: ${error.message}`);
    }
  }

  getAgent(role: AgentRole): Agent | undefined {
    if (!this.initialized) {
      logger.warn('Attempting to get agent from uninitialized registry');
      return undefined;
    }
    
    const agent = this.agents.get(role);
    if (!agent) {
      logger.warn({ role }, 'Agent not found in registry');
    }
    
    return agent;
  }

  registerAgent(role: AgentRole, agent: Agent): void {
    this.agents.set(role, agent);
    logger.info({ role, agentName: agent.name }, 'Agent registered');
  }

  getAvailableAgents(): AgentRole[] {
    return Array.from(this.agents.keys());
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // Get agent with contextual instructions
  getContextualAgent(role: AgentRole, context: FinancialRunContext): Agent | undefined {
    const baseAgent = this.getAgent(role);
    if (!baseAgent) return undefined;

    const baseConfig = AGENT_CONFIGS[role];
    const contextualInstructions = buildContextualInstructions(baseConfig, context.context);

    // Create a new agent instance with contextual instructions
    // Note: In production, you might want to cache these or use a more efficient approach
    const contextualAgent = new Agent({
      name: baseConfig.name,
      instructions: contextualInstructions,
      model: baseConfig.model,
      modelSettings: {
        temperature: baseConfig.temperature,
        max_tokens: baseConfig.maxTokens,
      },
      tools: baseConfig.tools || [],
    });

    return contextualAgent;
  }

  // Health check for all agents
  async healthCheck(): Promise<Record<AgentRole, boolean>> {
    const health: Record<AgentRole, boolean> = {} as Record<AgentRole, boolean>;
    
    for (const [role, agent] of this.agents) {
      try {
        // Simple health check - ensure agent exists and has basic properties
        health[role] = !!(agent.name && typeof agent.instructions === 'string');
      } catch (error) {
        logger.error({ role, error: error.message }, 'Agent health check failed');
        health[role] = false;
      }
    }
    
    return health;
  }

  // Get agent statistics
  getStats(): Record<string, any> {
    return {
      totalAgents: this.agents.size,
      availableRoles: this.getAvailableAgents(),
      initialized: this.initialized,
      agentNames: Array.from(this.agents.entries()).map(([role, agent]) => ({
        role,
        name: agent.name,
      })),
    };
  }
}

// Singleton instance
export const agentRegistry = new FinancialAgentRegistry();

// Helper functions for common operations
export const getCoordinatorAgent = () => agentRegistry.getAgent(AgentRole.COORDINATOR);
export const getBudgetingAgent = () => agentRegistry.getAgent(AgentRole.BUDGETING_SPECIALIST);
export const getInvestmentAgent = () => agentRegistry.getAgent(AgentRole.INVESTMENT_ADVISOR);
export const getDebtAgent = () => agentRegistry.getAgent(AgentRole.DEBT_MANAGER);
export const getGoalAgent = () => agentRegistry.getAgent(AgentRole.GOAL_PLANNER);
export const getRiskAgent = () => agentRegistry.getAgent(AgentRole.RISK_ASSESSOR);

// Validate registry is ready
export const ensureRegistryReady = (): boolean => {
  if (!agentRegistry.isInitialized()) {
    logger.error('Agent registry not initialized');
    return false;
  }
  
  const availableAgents = agentRegistry.getAvailableAgents();
  const requiredAgents = Object.values(AgentRole);
  
  const missingAgents = requiredAgents.filter(role => !availableAgents.includes(role));
  
  if (missingAgents.length > 0) {
    logger.error({ missingAgents }, 'Required agents missing from registry');
    return false;
  }
  
  return true;
};
