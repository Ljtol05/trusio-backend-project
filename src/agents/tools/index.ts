
// Main exports for financial tools
export * from './budget.js';
export * from './envelope.js';
export * from './transaction.js';
export * from './analysis.js';
export * from './insight.js';
export * from './handoff.js';

// Tool registry and management
export * from './registry.js';
export * from './types.js';

import { toolRegistry } from './registry.js';
import { logger } from '../../lib/logger.js';

// Initialize all tools
export const initializeTools = async (): Promise<boolean> => {
  try {
    logger.info('Initializing financial tools...');
    
    const toolCount = toolRegistry.getToolCount();
    const availableTools = toolRegistry.getAllTools();
    
    logger.info({ 
      toolCount,
      tools: Object.keys(availableTools)
    }, 'Financial tools initialized successfully');
    
    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to initialize financial tools');
    return false;
  }
};

// Export the registry for direct access
export { toolRegistry };
