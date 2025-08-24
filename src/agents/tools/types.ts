
import { z } from "zod";
import { ToolFunction } from "@openai/agents";

// Financial tool categories
export const TOOL_CATEGORIES = {
  BUDGET: "budget",
  ENVELOPE: "envelope", 
  TRANSACTION: "transaction",
  ANALYSIS: "analysis",
  INSIGHT: "insight",
  HANDOFF: "handoff"
} as const;

// Tool execution context
export const ToolContextSchema = z.object({
  userId: z.string(),
  sessionId: z.string().optional(),
  agentName: z.string(),
  timestamp: z.date().default(() => new Date()),
  userProfile: z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
    preferences: z.record(z.unknown()).optional(),
  }).optional(),
});

// Tool result schema
export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.date().default(() => new Date()),
});

// Budget analysis parameters
export const BudgetAnalysisParamsSchema = z.object({
  userId: z.string(),
  timeRange: z.enum(['current_month', 'last_month', 'last_3_months', 'last_6_months', 'custom']).default('current_month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  envelopeIds: z.array(z.string()).optional(),
  includeProjections: z.boolean().default(false),
});

// Envelope management parameters
export const EnvelopeActionParamsSchema = z.object({
  userId: z.string(),
  action: z.enum(['create', 'update', 'delete', 'transfer', 'analyze']),
  envelopeId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  targetAmount: z.number().positive().optional(),
  category: z.string().optional(),
  fromEnvelopeId: z.string().optional(),
  toEnvelopeId: z.string().optional(),
  amount: z.number().positive().optional(),
});

// Transaction processing parameters
export const TransactionParamsSchema = z.object({
  userId: z.string(),
  action: z.enum(['categorize', 'allocate', 'analyze', 'detect_anomalies']),
  transactionId: z.string().optional(),
  transactions: z.array(z.object({
    id: z.string(),
    amount: z.number(),
    description: z.string(),
    date: z.string(),
    merchant: z.string().optional(),
  })).optional(),
  suggestedEnvelopeId: z.string().optional(),
  forceAllocation: z.boolean().default(false),
});

// Analysis parameters
export const AnalysisParamsSchema = z.object({
  userId: z.string(),
  analysisType: z.enum(['spending_patterns', 'budget_variance', 'trend_analysis', 'goal_progress']),
  timeRange: z.enum(['current_month', 'last_month', 'last_3_months', 'last_6_months', 'custom']).default('current_month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  categories: z.array(z.string()).optional(),
  includeForecasting: z.boolean().default(false),
});

// Insight generation parameters
export const InsightParamsSchema = z.object({
  userId: z.string(),
  insightType: z.enum(['recommendations', 'opportunities', 'warnings', 'achievements']),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  includeActionItems: z.boolean().default(true),
  contextData: z.record(z.unknown()).optional(),
});

// Agent handoff parameters
export const HandoffParamsSchema = z.object({
  fromAgent: z.string(),
  toAgent: z.string(),
  reason: z.string(),
  context: z.record(z.unknown()),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  userMessage: z.string(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.string(),
  })).optional(),
});

// Type exports
export type ToolContext = z.infer<typeof ToolContextSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type BudgetAnalysisParams = z.infer<typeof BudgetAnalysisParamsSchema>;
export type EnvelopeActionParams = z.infer<typeof EnvelopeActionParamsSchema>;
export type TransactionParams = z.infer<typeof TransactionParamsSchema>;
export type AnalysisParams = z.infer<typeof AnalysisParamsSchema>;
export type InsightParams = z.infer<typeof InsightParamsSchema>;
export type HandoffParams = z.infer<typeof HandoffParamsSchema>;

// Tool definition interface
export interface FinancialTool {
  name: string;
  description: string;
  category: typeof TOOL_CATEGORIES[keyof typeof TOOL_CATEGORIES];
  parameters: z.ZodSchema<any>;
  execute: ToolFunction;
  requiresAuth: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  estimatedDuration: number; // in milliseconds
}

// Tool execution result
export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  duration: number;
  result?: any;
  error?: string;
  timestamp: Date;
}
