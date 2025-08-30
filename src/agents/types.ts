
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

// Financial context schema
export const FinancialContextSchema = z.object({
  userId: z.string().min(1),
  totalIncome: z.number().optional(),
  totalExpenses: z.number().optional(),
  envelopes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    balance: z.number(),
    target: z.number().optional(),
    category: z.string().optional(),
  })).optional(),
  transactions: z.array(z.object({
    id: z.string(),
    amount: z.number(),
    description: z.string(),
    category: z.string().optional(),
    date: z.string(),
  })).optional(),
  goals: z.array(z.object({
    id: z.string(),
    description: z.string(),
    targetAmount: z.number(),
    currentAmount: z.number(),
    deadline: z.string().optional(),
  })).optional(),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  timeHorizon: z.enum(['short', 'medium', 'long']).optional(),
});

export type FinancialContext = z.infer<typeof FinancialContextSchema>;

// Agent configuration schema
export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  role: z.enum(['financial_advisor', 'budget_coach', 'transaction_analyst', 'insight_generator', 'onboarding_specialist', 'voice_kyc', 'content_creator', 'personal_ai']),
  instructions: z.string().min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  tools: z.array(z.string()).optional(),
  handoffs: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().min(1).max(10).optional(),
  specializations: z.array(z.string()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Agent response schema
export const AgentResponseSchema = z.object({
  response: z.string().min(1),
  confidence: z.number().min(0).max(100).optional(),
  suggestedActions: z.array(z.object({
    type: z.enum(['create_envelope', 'transfer_funds', 'update_budget', 'set_goal', 'analyze_spending']),
    description: z.string(),
    parameters: z.record(z.any()).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  })).optional(),
  handoffTarget: z.string().optional(),
  followUpQuestions: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  agentName: z.string().optional(),
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

// Agent context schema
export const AgentContextSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  agentName: z.string(),
  timestamp: z.date(),
  previousInteractions: z.array(z.any()).optional(),
  financialContext: FinancialContextSchema.optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

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
