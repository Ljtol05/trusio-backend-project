import { logger } from '../../lib/logger.js';
import { registerAllTools } from './bootstrap.js';

// Initialize tools using bootstrap
if (process.env.NODE_ENV !== 'test') {
  registerAllTools();
  logger.info('All financial tools registered successfully');
}

// Export registry and types
export { toolRegistry, ToolRegistry } from './registry.js';
export * from './types.js';

// Export individual tool modules (for direct access if needed)
export * from './analysis.js';
export * from './budget.js';
export * from './envelope.js';
export * from './transaction.js';
export * from './insight.js';
export * from './handoff.js';