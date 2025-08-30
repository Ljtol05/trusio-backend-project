
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

// Export the main registry
export { toolRegistry } from './registry.ts';

// Re-export everything from registry for convenience
export * from './registry.ts';
