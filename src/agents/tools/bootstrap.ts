
import { toolRegistry } from './registry.js';
import { registerTransactionTools } from './transaction.js';

// Import other registration functions when they're updated
// import { registerAnalysisTools } from './analysis.js';
// import { registerBudgetTools } from './budget.js';
// import { registerEnvelopeTools } from './envelope.js';
// import { registerInsightTools } from './insight.js';
// import { registerHandoffTools } from './handoff.js';

export function registerAllTools(): void {
  registerTransactionTools(toolRegistry);
  
  // Register other tools when their modules are updated:
  // registerAnalysisTools(toolRegistry);
  // registerBudgetTools(toolRegistry);
  // registerEnvelopeTools(toolRegistry);
  // registerInsightTools(toolRegistry);
  // registerHandoffTools(toolRegistry);
}
