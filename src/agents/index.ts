
// Main exports for the agents system
export * from './types.js';
export * from './config.js';
export * from './registry.js';

// Re-export commonly used OpenAI Agents SDK types
export { Agent, run, tool, Runner } from '@openai/agents';
export type { Tool, ToolFunction, RunContext } from '@openai/agents';

import { agentRegistry, ensureRegistryReady } from './registry.js';
import { logger } from '../lib/logger.js';

// Initialize the agent system
export const initializeAgentSystem = async (): Promise<boolean> => {
  try {
    logger.info('Initializing multi-agent financial coaching system...');
    
    // Ensure registry is properly initialized
    if (!ensureRegistryReady()) {
      throw new Error('Agent registry initialization failed');
    }
    
    // Perform health check on all agents
    const healthStatus = await agentRegistry.healthCheck();
    const unhealthyAgents = Object.entries(healthStatus)
      .filter(([_, healthy]) => !healthy)
      .map(([role, _]) => role);
    
    if (unhealthyAgents.length > 0) {
      logger.warn({ unhealthyAgents }, 'Some agents failed health check');
    }
    
    // Log system statistics
    const stats = agentRegistry.getStats();
    logger.info({ stats }, 'Agent system initialized successfully');
    
    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to initialize agent system');
    return false;
  }
};

// Export the singleton registry for direct access
export { agentRegistry };
