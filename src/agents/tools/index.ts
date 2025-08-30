// Export tool registry
export { toolRegistry } from './registry.ts';

// Export individual tools
export { budgetAnalysisTool } from './budget.ts';
export { createEnvelopeTool, updateEnvelopeTool } from './envelope.ts';
export { categorizeTransactionTool, spendingPatternsTool } from './transaction-tools.ts';
export { transferFundsTool } from './transfer_funds.ts';
export { trackAchievementsTool } from './track_achievements.ts';
export { identifyOpportunitiesTool } from './identify_opportunities.ts';
export { generateInsightTool } from './insight.ts';
export { memoryStoreTool, memoryRetrieveTool } from './memory.ts';
export { agentHandoffTool, agentCapabilityCheckTool } from './handoff.ts';
export { analyzeSpendingTool, generateReportTool } from './analysis.ts';

// Export types
export type {
  ToolExecutionContext,
  ToolExecutionResult,
  FinancialContext,
  ToolDefinition,
  ToolCategory,
} from './types.ts';