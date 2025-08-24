
import { z } from "zod";
import { Agent, RunContext, ToolFunction } from "@openai/agents";

// Base agent configuration schema
export const AgentConfigSchema = z.object({
  name: z.string(),
  instructions: z.string(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
  tools: z.array(z.any()).optional(),
  guardrails: z.array(z.any()).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Financial context for agents
export const FinancialContextSchema = z.object({
  userId: z.string(),
  totalIncome: z.number().optional(),
  totalExpenses: z.number().optional(),
  envelopes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    balance: z.number(),
    target: z.number(),
    category: z.string(),
  })).optional(),
  transactions: z.array(z.object({
    id: z.string(),
    amount: z.number(),
    description: z.string(),
    category: z.string(),
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

// Extended run context for financial agents
export interface FinancialRunContext extends RunContext<FinancialContext> {
  sessionId: string;
  timestamp: Date;
  previousInteractions: AgentInteraction[];
}

// Agent interaction tracking
export const AgentInteractionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  agentName: z.string(),
  userMessage: z.string(),
  agentResponse: z.string(),
  timestamp: z.date(),
  confidence: z.number().min(0).max(100).optional(),
  followUpSuggestions: z.array(z.string()).optional(),
  handoffReason: z.string().optional(),
  handoffTarget: z.string().optional(),
});

export type AgentInteraction = z.infer<typeof AgentInteractionSchema>;

// Agent roles in the financial system
export enum AgentRole {
  COORDINATOR = 'coordinator',
  BUDGETING_SPECIALIST = 'budgeting_specialist',
  INVESTMENT_ADVISOR = 'investment_advisor',
  DEBT_MANAGER = 'debt_manager',
  GOAL_PLANNER = 'goal_planner',
  RISK_ASSESSOR = 'risk_assessor',
}

// Agent response with metadata
export const AgentResponseSchema = z.object({
  content: z.string(),
  confidence: z.number().min(0).max(100),
  suggestedActions: z.array(z.string()).optional(),
  requiresHandoff: z.boolean().default(false),
  handoffTarget: z.nativeEnum(AgentRole).optional(),
  handoffReason: z.string().optional(),
  followUpQuestions: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// Financial action types
export enum FinancialActionType {
  CREATE_ENVELOPE = 'create_envelope',
  TRANSFER_FUNDS = 'transfer_funds',
  SET_BUDGET_GOAL = 'set_budget_goal',
  CREATE_INVESTMENT_PLAN = 'create_investment_plan',
  SCHEDULE_PAYMENT = 'schedule_payment',
  UPDATE_RISK_PROFILE = 'update_risk_profile',
}

// Financial action schema
export const FinancialActionSchema = z.object({
  type: z.nativeEnum(FinancialActionType),
  parameters: z.record(z.any()),
  description: z.string(),
  estimatedImpact: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
});

export type FinancialAction = z.infer<typeof FinancialActionSchema>;

// Agent capability definition
export interface AgentCapability {
  name: string;
  description: string;
  parameters: z.ZodSchema<any>;
  execute: ToolFunction;
  requiresApproval?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}

// Multi-agent coordination interfaces
export interface AgentHandoff {
  fromAgent: AgentRole;
  toAgent: AgentRole;
  reason: string;
  context: Record<string, any>;
  priority: 'low' | 'medium' | 'high';
}

export interface AgentRegistry {
  agents: Map<AgentRole, Agent>;
  getAgent(role: AgentRole): Agent | undefined;
  registerAgent(role: AgentRole, agent: Agent): void;
  getAvailableAgents(): AgentRole[];
}
