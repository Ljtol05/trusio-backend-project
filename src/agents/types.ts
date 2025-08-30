
import { z } from 'zod';

// Agent role types
export type AgentRole = 
  | 'financial_advisor'
  | 'budget_coach'
  | 'transaction_analyst'
  | 'insight_generator'
  | 'voice_kyc'
  | 'onboarding'
  | 'content_creator'
  | 'personal_ai';

// Agent configuration schema
export const AgentConfigSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  role: z.enum(['financial_advisor', 'budget_coach', 'transaction_analyst', 'insight_generator', 'voice_kyc', 'onboarding', 'content_creator', 'personal_ai']),
  instructions: z.string().min(1, 'Instructions are required'),
  model: z.string().default('gpt-4'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(4096).default(1000),
  tools: z.array(z.string()).default([]),
  handoffs: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  priority: z.number().min(1).max(10).default(5),
  specializations: z.array(z.string()).default([]),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Financial context schemas
export const EnvelopeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  balance: z.number(),
  target: z.number().positive(),
  category: z.string(),
});

export const TransactionSchema = z.object({
  id: z.string(),
  amount: z.number(),
  description: z.string().min(1),
  category: z.string(),
  date: z.string().datetime(),
});

export const GoalSchema = z.object({
  id: z.string(),
  description: z.string().min(1),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0),
  deadline: z.string().datetime(),
});

export const FinancialContextSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  totalIncome: z.number().min(0).optional(),
  totalExpenses: z.number().min(0).optional(),
  monthlyIncome: z.number().min(0).optional(),
  emergencyFund: z.number().min(0).optional(),
  envelopes: z.array(EnvelopeSchema).optional(),
  transactions: z.array(TransactionSchema).optional(),
  goals: z.array(GoalSchema).optional(),
  riskTolerance: z.enum(['low', 'moderate', 'high']).optional(),
  timeHorizon: z.enum(['short', 'medium', 'long']).optional(),
});

export type FinancialContext = z.infer<typeof FinancialContextSchema>;

// Agent response schemas
export const SuggestedActionSchema = z.object({
  type: z.enum(['create_envelope', 'transfer_funds', 'set_goal', 'review_budget', 'categorize_transaction']),
  description: z.string().min(1),
  parameters: z.record(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const AgentResponseSchema = z.object({
  response: z.string().min(1, 'Response cannot be empty'),
  confidence: z.number().min(0).max(100),
  suggestedActions: z.array(SuggestedActionSchema).default([]),
  handoffTarget: z.string().optional(),
  followUpQuestions: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// Agent context schema
export const AgentContextSchema = z.object({
  sessionId: z.string().min(1),
  agentName: z.string().min(1),
  userId: z.string().min(1),
  timestamp: z.date().default(() => new Date()),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.date(),
  })).optional(),
  metadata: z.record(z.any()).optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

// Tool execution types
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  timestamp: Date;
  toolName: string;
}

export interface ToolExecutionContext extends FinancialContext {
  sessionId: string;
  agentName: string;
  timestamp: Date;
  userProfile?: {
    id: string;
    name: string;
    email: string;
  };
}

// Export all types
export type {
  AgentRole,
  AgentConfig,
  FinancialContext,
  AgentResponse,
  AgentContext,
  ToolExecutionResult,
  ToolExecutionContext,
};
