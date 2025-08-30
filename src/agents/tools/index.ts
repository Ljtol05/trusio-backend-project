// Export tool registry
export { toolRegistry } from './registry.js';

// Export individual tools
export { budgetAnalysisTool } from './budget.js';
export { createEnvelopeTool, updateEnvelopeTool } from './envelope.js';
export { categorizeTransactionTool, spendingPatternsTool } from './transaction-tools.js';
export { transferFundsTool } from './transfer_funds.js';
export { trackAchievementsTool } from './track_achievements.js';
export { identifyOpportunitiesTool } from './identify_opportunities.js';
export { generateInsightTool } from './insight.js';
export { memoryStoreTool, memoryRetrieveTool } from './memory.js';
export { agentHandoffTool, agentCapabilityCheckTool } from './handoff.js';
export { analyzeSpendingTool, generateReportTool } from './analysis.js';

// Export types
export type {
  ToolExecutionContext,
  ToolExecutionResult,
  FinancialContext,
  ToolDefinition,
  ToolCategory,
} from './types.js';