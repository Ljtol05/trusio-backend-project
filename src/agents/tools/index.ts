// Export all tool types and interfaces
export type {
  FinancialContext,
  ToolExecutionContext,
  ToolExecutionResult,
  AgentConfig,
  AgentResponse,
  ToolDefinition,
} from './types.ts';

// Import and export all tool implementations
export { budgetAnalysisTool, createEnvelopeTool, budgetCreationTool } from './budget.ts';
export { envelopeTransferTool, getEnvelopeBalanceTool } from './envelope.ts';
export {
  categorizeTransactionTool,
  automaticAllocationTool,
  patternDetectionTool,
  detectAnomaliesTool
} from './transaction-tools.ts';
export { agentHandoffTool } from './handoff.ts';
export { memoryStoreTool, memoryRetrieveTool } from './memory.ts';
export {
  spendingPatternsTool,
  varianceAnalysisTool,
  riskAssessmentTool
} from './analysis.ts';

// Import all tool modules to ensure registration
import './budget.js';
import './envelope.js';
import './transaction-tools.js';
import './analysis.js';
import './insight.js';
import './handoff.js';
import './transfer_funds.js';
import './identify_opportunities.js';
import './track_achievements.js';
import './memory.js';

// Re-export registry and types
export * from './registry.js';
export * from './types.js';