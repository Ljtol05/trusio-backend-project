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
export { budgetAnalysisTool, createEnvelopeTool, updateEnvelopeTool } from './budget.js';
export { envelopeTransferTool, getEnvelopeBalanceTool } from './envelope.js';
export {
  categorizeTransactionTool,
  automaticAllocationTool,
  patternDetectionTool,
  detectAnomaliesTool,
  spendingPatternsTool
} from './transaction-tools.js';
export { agentHandoffTool, agentCapabilityCheckTool } from './handoff.js';
export { memoryStoreTool, memoryRetrieveTool } from './memory.js';
export {
  analyzeSpendingTool,
  generateReportTool,
  varianceAnalysisTool,
  riskAssessmentTool
} from './analysis.js';
export { transferFundsTool } from './transfer_funds.js';
export { trackAchievementsTool } from './track_achievements.js';
export { identifyOpportunitiesTool } from './identify_opportunities.js';
export { generateInsightTool } from './insight.js';

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