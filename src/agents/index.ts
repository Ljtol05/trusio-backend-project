// Main exports for the agents system
export * from './types.js';
export * from './config.js';
export * from './registry.js';
export * from './tools/index.js';

// Re-export commonly used OpenAI Agents SDK types and functions
export { Agent, run, tool, Runner } from '@openai/agents';
export type { Tool, ToolFunction, RunContext } from '@openai/agents';

import { agentManager, ensureRegistryReady } from './registry.js';
import { agentRegistry } from './agentRegistry.js';
import { toolRegistry } from './tools/registry.js';
import type { FinancialContext } from './tools/types.js';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// Initialize the agent system
export const initializeAgentSystem = async (): Promise<boolean> => {
  try {
    logger.info('Initializing multi-agent financial coaching system...');

    // Initialize financial tools first
    const { initializeTools } = await import('./tools/index.js');
    const toolsInitialized = await initializeTools();

    if (!toolsInitialized) {
      throw new Error('Failed to initialize financial tools');
    }

    // Initialize the agent manager and its registries
    await agentManager.initialize();
    await agentRegistry.initialize(); // Ensure agent registry is initialized
    await toolRegistry.initialize(); // Ensure tool registry is initialized

    // Ensure registry is properly initialized
    if (!ensureRegistryReady()) {
      throw new Error('Agent registry validation failed');
    }

    // Get system health check
    const healthStatus = agentManager.getAgentHealth();
    const unhealthyAgents = Object.entries(healthStatus)
      .filter(([_, health]) => !health.isActive || !health.isInitialized)
      .map(([role, _]) => role);

    if (unhealthyAgents.length > 0) {
      logger.warn({ unhealthyAgents }, 'Some agents failed health check');
    }

    // Log system statistics
    const initializedCount = agentManager.getInitializedCount();
    logger.info({
      initializedCount,
      totalAgents: Object.keys(agentManager.getAllAgents()).length,
      roles: Object.keys(agentManager.getAllAgents())
    }, 'Agent system initialized successfully');

    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to initialize agent system');
    return false;
  }
};

export async function runFinancialAgent(
  agentName: string,
  userMessage: string,
  userId: number,
  userPreferences?: FinancialContext['userPreferences']
): Promise<string> {
  const agent = agentRegistry.getAgent(agentName);
  if (!agent) {
    throw new Error(`Agent '${agentName}' not found`);
  }

  const context: FinancialContext = {
    userId,
    userPreferences,
    db, // Include database access
  };

  try {
    logger.info({ agentName, userId }, 'Running financial agent');
    const result = await run(agent, userMessage, { context });

    // Handle different result types from the OpenAI Agents SDK
    let output: string;
    if (typeof result === 'string') {
      output = result;
    } else if (result && typeof result === 'object' && 'output' in result) {
      output = result.output || 'I apologize, but I was unable to process your request.';
    } else {
      output = 'I apologize, but I was unable to process your request.';
    }

    logger.info({ agentName, userId, outputLength: output.length }, 'Agent completed successfully');
    return output;
  } catch (error) {
    logger.error({ error, agentName, userId }, 'Agent execution error');
    throw new Error('Failed to process request with financial agent');
  }
}

export async function routeToAppropriateAgent(
  userMessage: string,
  userId: number,
  userPreferences?: FinancialContext['userPreferences']
): Promise<string> {
  try {
    // Use the agent registry's routing logic
    const agent = agentRegistry.routeToAgent(userMessage);
    const agentName = Array.from(agentRegistry.getAgentNames()).find(name =>
      agentRegistry.getAgent(name) === agent
    ) || 'financial_advisor';

    logger.info({ userMessage: userMessage.substring(0, 100), agentName, userId }, 'Routing to agent');

    return await runFinancialAgent(agentName, userMessage, userId, userPreferences);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to route to appropriate agent');
    // Fallback to default agent
    return await runFinancialAgent('financial_advisor', userMessage, userId, userPreferences);
  }
}

// Helper function to get available agents
export function getAvailableAgents(): Array<{ name: string; description: string }> {
  return [
    {
      name: 'budget_coach',
      description: 'Helps with budget creation, envelope management, and budgeting advice'
    },
    {
      name: 'transaction_analyst',
      description: 'Analyzes spending patterns and provides transaction insights'
    },
    {
      name: 'financial_advisor',
      description: 'Provides comprehensive financial guidance and coordinates with specialists'
    },
    {
      name: 'insight_generator',
      description: 'Generates personalized financial insights and recommendations'
    }
  ];
}

// Helper function to check if agents are properly configured
export function validateAgentConfiguration(): boolean {
  try {
    const agents = agentRegistry.getAllAgents();
    const tools = toolRegistry.getAllTools();

    logger.info({
      agentCount: agents.length,
      toolCount: tools.length
    }, 'Agent configuration validation');

    return agents.length > 0 && tools.length > 0;
  } catch (error) {
    logger.error({ error }, 'Agent configuration validation failed');
    return false;
  }
}

// Export the singleton manager for direct access
export { agentManager };