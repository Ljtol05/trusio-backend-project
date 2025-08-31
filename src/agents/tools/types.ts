
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

// Financial context for tools - Updated schema
export const FinancialContextSchema = z.object({
  userId: z.string().min(1),
  totalIncome: z.number().nonnegative().optional(),
  totalExpenses: z.number().nonnegative().optional(),
  envelopes: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    balance: z.number(),
    target: z.number().optional(),
    category: z.string().optional(),
  })).optional(),
  transactions: z.array(z.object({
    id: z.string().min(1),
    amount: z.number(),
    description: z.string().min(1),
    category: z.string().optional(),
    date: z.string(),
  })).optional(),
  goals: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    targetAmount: z.number().positive(),
    currentAmount: z.number().nonnegative(),
    deadline: z.string().optional(),
  })).optional(),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  timeHorizon: z.enum(['short', 'medium', 'long']).optional(),
  userType: z.enum(['consumer', 'business', 'premium']).optional(),
});

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
  userType?: 'consumer' | 'business' | 'premium';
}

// Tool parameter schemas with proper validation
export const BudgetAnalysisParamsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  timeframe: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  includeProjections: z.boolean().default(false),
  categories: z.array(z.string()).optional(),
});

export const CreateEnvelopeParamsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  name: z.string().min(1, "Envelope name is required").max(100, "Name too long"),
  targetAmount: z.number().positive().optional(),
  category: z.string().optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color format").optional(),
  icon: z.string().min(1).optional(),
});

export const TransferFundsParamsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  fromEnvelopeId: z.string().min(1, "Source envelope ID is required"),
  toEnvelopeId: z.string().min(1, "Destination envelope ID is required"),
  amount: z.number().positive("Amount must be positive"),
  note: z.string().max(500, "Note too long").optional(),
});

export const AnalyzeSpendingParamsSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  timeframe: z.enum(['weekly', 'monthly', 'quarterly']).default('monthly'),
  category: z.string().optional(),
  includeProjections: z.boolean().default(false),
});

export const AgentHandoffParamsSchema = z.object({
  fromAgent: z.string().min(1, "Source agent is required"),
  toAgent: z.string().min(1, "Target agent is required"),
  reason: z.string().min(1, "Handoff reason is required"),
  context: z.record(z.any()).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  userId: z.string().min(1, "User ID is required"),
});

// Agent configuration schema
export const AgentConfigSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  role: z.enum([
    'financial_advisor',
    'budget_coach', 
    'transaction_analyst',
    'insight_generator',
    'onboarding_specialist',
    'voice_kyc',
    'content_creator',
    'personal_ai'
  ]),
  instructions: z.string().min(1, "Instructions are required"),
  model: z.string().min(1, "Model is required"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(1000),
  tools: z.array(z.string()).default([]),
  handoffs: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  priority: z.number().min(1).max(10).default(5),
  specializations: z.array(z.string()).default([]),
});

// Agent context schema
export const AgentContextSchema = z.object({
  userId: z.string().min(1),
  sessionId: z.string().optional(),
  agentName: z.string().min(1),
  conversation: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.date().optional(),
  })).default([]),
  financialContext: FinancialContextSchema.optional(),
  metadata: z.record(z.any()).optional(),
});

// Agent response schema
export const AgentResponseSchema = z.object({
  response: z.string().min(1, "Response content is required"),
  confidence: z.number().min(0).max(100).default(50),
  suggestedActions: z.array(z.object({
    type: z.enum([
      'create_envelope',
      'transfer_funds',
      'budget_analysis',
      'spending_analysis',
      'agent_handoff',
      'set_goal',
      'update_preferences'
    ]),
    description: z.string().min(1),
    parameters: z.record(z.any()),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
  })).default([]),
  handoffTarget: z.string().optional(),
  followUpQuestions: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional(),
});

// Agent output schema for validation
export const AgentOutputSchema = z.object({
  agentName: z.string().min(1),
  response: z.string().min(1),
  timestamp: z.date().default(() => new Date()),
  confidence: z.number().min(0).max(100).optional(),
  metadata: z.record(z.any()).optional(),
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

// Validation helpers
export function validateToolParams<T>(schema: z.ZodSchema<T>, params: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const result = schema.parse(params);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ['Invalid parameters'] };
  }
}

export function validateFinancialContext(context: unknown): { success: true; data: FinancialContext } | { success: false; errors: string[] } {
  return validateToolParams(FinancialContextSchema, context);
}

export function validateAgentResponse(response: unknown): { success: true; data: z.infer<typeof AgentResponseSchema> } | { success: false; errors: string[] } {
  return validateToolParams(AgentResponseSchema, response);
}
