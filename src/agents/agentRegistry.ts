import { Agent } from '@openai/agents';
import { logger } from '../lib/logger.ts';
import { toolRegistry } from './tools/registry.ts';
import type { FinancialContext } from './tools/types.ts';
import { AGENT_CONFIG } from './config.ts';

class AgentRegistry {
  private agents = new Map<string, Agent>();
  private initialized = false;

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents(): void {
    try {
      logger.info('Initializing agents...');

      // Ensure agents array is initialized
      if (!this.agents || !Array.isArray(this.agents)) {
        this.agents = new Map<string, Agent>(); // Correctly initialize as a Map
        logger.warn('Agents map was not properly initialized, creating empty map');
      }

      const agentConfigs = Object.entries(AGENT_CONFIG);

      for (const [agentName, config] of agentConfigs) {
        const agentTools = config.tools.map(toolName => {
          const tool = toolRegistry.getTool(toolName);
          if (!tool) {
            logger.warn(`Tool ${toolName} not found for agent ${agentName}`);
            return null;
          }
          return tool;
        }).filter(Boolean);

        const agent = new Agent({
          name: agentName,
          instructions: `You are a ${config.name}. ${config.description}`,
          model: 'gpt-4o',
          tools: agentTools,
        });

        this.agents.set(agentName, agent);
      }

      this.initialized = true;
      logger.info(`Initialized ${this.agents.size} agents`);
    } catch (error) {
      logger.error({ error }, 'Failed to initialize agents');
      throw error;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getAgent(agentName: string): Agent | undefined {
    return this.agents.get(agentName);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgentNames(): string[] {
    return Array.from(this.agents.keys());
  }

  routeToAgent(message: string): Agent | undefined {
    const lowerMessage = message.toLowerCase();

    // Simple routing logic based on keywords
    if (lowerMessage.includes('budget') || lowerMessage.includes('envelope')) {
      return this.getAgent('budget_coach');
    }

    if (lowerMessage.includes('transaction') || lowerMessage.includes('categorize') || lowerMessage.includes('spending')) {
      return this.getAgent('transaction_analyst');
    }

    if (lowerMessage.includes('trend') || lowerMessage.includes('insight') || lowerMessage.includes('pattern')) {
      return this.getAgent('insight_generator');
    }

    // Default to financial advisor
    return this.getAgent('financial_advisor');
  }

  async runAgent(
    agentName: string,
    message: string,
    context: FinancialContext
  ): Promise<string> {
    const agent = this.getAgent(agentName);
    if (!agent) {
      throw new Error(`Agent '${agentName}' not found`);
    }

    try {
      // Mock implementation for testing
      if (process.env.NODE_ENV === 'test') {
        return `Mocked response from ${agentName}: ${message}`;
      }

      // In production, use actual agent execution
      const { run } = await import('@openai/agents');
      const result = await run(agent, message, { context });
      return result;
    } catch (error) {
      logger.error({ error, agentName }, 'Agent execution failed');
      throw new Error(`Failed to process request with ${agentName} agent`);
    }
  }

  getAgentCapabilities(agentName: string): string[] {
    const config = AGENT_CONFIG[agentName as keyof typeof AGENT_CONFIG];
    return config?.specialties || [];
  }

  getAgentMetrics() {
    const metrics: Record<string, any> = {};

    for (const [name, agent] of this.agents) {
      const config = AGENT_CONFIG[name as keyof typeof AGENT_CONFIG];
      metrics[name] = {
        name: config?.name || name,
        isAvailable: true,
        capabilities: config?.specialties || [],
        toolCount: agent.tools?.length || 0,
      };
    }

    return metrics;
  }
}

export const agentRegistry = new AgentRegistry();