
import { logger } from '../lib/logger.js';
import { registerAllTools } from './tools/index.js';

export async function initializeAgentSystem(): Promise<boolean> {
  try {
    logger.info('Initializing Agent System...');

    // Register all tools once at startup
    registerAllTools();

    logger.info('Agent System initialized successfully');
    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Agent System');
    return false;
  }
}
