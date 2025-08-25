
import { logger } from '../../lib/logger.js';
import { toolRegistry } from '../core/ToolRegistry.js';
import { registerTransactionTools } from './transaction-tools.js';

// Import other registration functions when they're ready
// import { registerAnalysisTools } from './analysis-tools.js';
// import { registerBudgetTools } from './budget-tools.js';
// import { registerEnvelopeTools } from './envelope-tools.js';
// import { registerInsightTools } from './insight-tools.js';
// import { registerHandoffTools } from './handoff-tools.js';

export function registerAllTools(): void {
  try {
    registerTransactionTools(toolRegistry);
    
    // Register other tools when their modules are updated:
    // registerAnalysisTools(toolRegistry);
    // registerBudgetTools(toolRegistry);
    // registerEnvelopeTools(toolRegistry);
    // registerInsightTools(toolRegistry);
    // registerHandoffTools(toolRegistry);

    const toolCount = toolRegistry.getToolCount();
    logger.info({ toolCount }, 'All financial tools registered successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to register tools');
    throw error;
  }
}

// Export the registry and types for external use
export { toolRegistry, ToolRegistry } from '../core/ToolRegistry.js';
export * from './transaction-tools.js';

// Export individual tool modules (for direct access if needed)
// export * from './analysis-tools.js';
// export * from './budget-tools.js';
// export * from './envelope-tools.js';
// export * from './insight-tools.js';
// export * from './handoff-tools.js';
