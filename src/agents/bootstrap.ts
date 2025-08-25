import { logger } from '../lib/logger.js';
import { registerAllTools, toolRegistry } from './tools/index.js';
import { agentRegistry } from './agentRegistry.js';
import { healthCheck } from './health.js';

export async function initializeAgentSystem(): Promise<void> {
  try {
    logger.info('Initializing agent system...');

    // Register all financial tools first
    registerAllTools();

    // Verify tools were registered
    const toolCount = toolRegistry.getToolCount();
    logger.info({ toolCount }, 'Tools registered');

    if (toolCount === 0) {
      logger.error('No tools were registered - this indicates a critical initialization failure');
      throw new Error('Tool registration failed - no tools available');
    }

    // Initialize all agents
    await agentRegistry.initializeAllAgents();

    // Verify agents were initialized
    const agentCount = agentRegistry.getAgentCount();
    logger.info({ agentCount }, 'Agents initialized');

    // Verify system health
    const healthStatus = await healthCheck.checkSystemHealth();
    logger.info({ healthStatus }, 'Agent system initialization complete');

    if (healthStatus.status !== 'healthy') {
      logger.warn({ healthStatus }, 'Agent system initialized with warnings');
    } else {
      logger.info('Agent system is healthy and ready');
    }

  } catch (error) {
    logger.error({ error }, 'Failed to initialize agent system');
    throw error;
  }
}