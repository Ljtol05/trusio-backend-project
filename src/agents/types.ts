import { z } from 'zod';

// Agent roles
export type AgentRole = 
  | 'financial_advisor' 
  | 'budget_coach' 
  | 'transaction_analyst' 
  | 'insight_generator' 
  | 'onboarding_specialist'
  | 'voice_kyc'
  | 'content_creator'
  | 'personal_ai';

// Financial context schema - Updated to match tool types
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

export type FinancialContext = z.infer<typeof FinancialContextSchema>;

// Agent configuration schema
export const AgentConfigSchema = z.object({
  name: z.string().min(1),
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
  instructions: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().positive().default(1000),
  tools: z.array(z.string()).default([]),
  handoffs: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  priority: z.number().min(1).max(10).default(5),
  specializations: z.array(z.string()).default([]),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

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

export type AgentContext = z.infer<typeof AgentContextSchema>;

// Agent response schema
export const AgentResponseSchema = z.object({
  response: z.string().min(1),
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

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// Agent input schema
export const AgentInputSchema = z.object({
  message: z.string().min(1),
  agentName: z.string().optional(),
  sessionId: z.string().optional(),
  context: z.record(z.any()).optional(),
  userId: z.string().min(1),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

// Agent output schema
export const AgentOutputSchema = z.object({
  response: z.string(),
  agentName: z.string(),
  sessionId: z.string().optional(),
  timestamp: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// Tool execution context
export interface ToolExecutionContext extends FinancialContext {
  sessionId: string;
  agentName: string;
  timestamp: Date;
}

// Tool execution result
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
  timestamp: Date;
  toolName: string;
}