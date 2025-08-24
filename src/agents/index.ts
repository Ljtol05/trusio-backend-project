
// Main exports for the agents system
export * from './types.js';
export * from './config.js';
export * from './registry.js';

// Re-export commonly used OpenAI Agents SDK types and functions
export { Agent, run, tool, Runner } from '@openai/agents';
export type { Tool, ToolFunction, RunContext } from '@openai/agents';

import { agentManager, ensureRegistryReady } from './registry.js';
import { logger } from '../lib/logger.js';

// Initialize the agent system
export const initializeAgentSystem = async (): Promise<boolean> => {
  try {
    logger.info('Initializing multi-agent financial coaching system...');
    
    // Initialize the agent manager
    await agentManager.initialize();
    
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

// Export the singleton manager for direct access
export { agentManager };
