
import { z } from 'zod';

// Base tool execution context
export interface ToolExecutionContext {
  userId: string;
  sessionId?: string;
  agentName?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

// Tool execution result
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
  timestamp: Date;
  toolName: string;
  metadata?: Record<string, any>;
}

// Financial context for tools
export interface FinancialContext {
  userId: string;
  totalIncome?: number;
  totalExpenses?: number;
  envelopes?: Array<{
    id: string;
    name: string;
    balance: number;
    target?: number;
    category?: string;
  }>;
  transactions?: Array<{
    id: string;
    amount: number;
    description: string;
    category?: string;
    date: string;
  }>;
  goals?: Array<{
    id: string;
    description: string;
    targetAmount: number;
    currentAmount: number;
    deadline?: string;
  }>;
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
  timeHorizon?: 'short' | 'medium' | 'long';
}

// Tool parameter schemas
export const BudgetAnalysisParamsSchema = z.object({
  userId: z.string().min(1),
  timeframe: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  includeProjections: z.boolean().optional(),
});

export const CreateEnvelopeParamsSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(100),
  targetAmount: z.number().positive().optional(),
  category: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

export const TransferFundsParamsSchema = z.object({
  userId: z.string().min(1),
  fromEnvelopeId: z.string().min(1),
  toEnvelopeId: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().optional(),
});

export const AnalyzeSpendingParamsSchema = z.object({
  userId: z.string().min(1),
  timeframe: z.enum(['weekly', 'monthly', 'quarterly']).optional(),
  category: z.string().optional(),
});

export const AgentHandoffParamsSchema = z.object({
  fromAgent: z.string().min(1),
  toAgent: z.string().min(1),
  reason: z.string().min(1),
  context: z.record(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

// Tool definitions
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema<any>;
  category: string;
  execute: (params: any, context: ToolExecutionContext) => Promise<any>;
}

export type ToolCategory = 'budget' | 'transaction' | 'transfer' | 'goal' | 'insight' | 'memory' | 'handoff' | 'analysis';
