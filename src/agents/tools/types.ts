
import { z } from 'zod';

// Base tool execution context
export interface ToolExecutionContext {
  userId: string;
  sessionId?: string;
  agentName?: string;
  timestamp?: Date;
  timeout?: number;
  userProfile?: {
    id: string;
    name?: string;
    email?: string;
  };
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
    deadline: string;
  }>;
  riskTolerance?: 'low' | 'medium' | 'high';
}

// Tool execution result
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  timestamp: Date;
  duration: number;
}

// Tool definition interface
export interface Tool {
  name: string;
  description: string;
  category: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresAuth: boolean;
  estimatedDuration: number;
  schema?: any;
  execute: (parameters: any, context: ToolExecutionContext) => Promise<any>;
}

// Tool metrics
export interface ToolMetrics {
  executionCount: number;
  averageExecutionTime: number;
  successRate: number;
  totalErrors: number;
  lastExecution?: Date;
}

// Validation schemas
export const FinancialContextSchema = z.object({
  userId: z.string().min(1),
  totalIncome: z.number().nonnegative().optional(),
  totalExpenses: z.number().nonnegative().optional(),
  envelopes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    balance: z.number(),
    target: z.number().optional(),
    category: z.string().optional(),
  })).optional(),
  riskTolerance: z.enum(['low', 'medium', 'high']).optional(),
});

export const AgentResponseSchema = z.object({
  response: z.string().min(1),
  confidence: z.number().min(0).max(100),
  suggestedActions: z.array(z.object({
    type: z.enum(['create_envelope', 'transfer_funds', 'analyze_spending', 'set_goal']),
    description: z.string(),
    parameters: z.record(z.any()).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  })).optional(),
  handoffTarget: z.string().optional(),
  followUpQuestions: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});
