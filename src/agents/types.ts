` tag. Include all necessary functions and modifications based on the intention," and the fact that the edited snippet is not a complete replacement, I will reconstruct the file by including the parts from the original that are not present in the edited snippet, and incorporating the changes from the edited snippet.

This approach ensures that all the necessary agent types and configurations are preserved while incorporating the new definitions from the edited snippet.

<replit_final_file>
import { z } from "zod";
import { Agent, RunContext, ToolFunction } from "@openai/agents";

// Core agent configuration schema
export const AgentConfigSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  role: z.enum([
    "financial_coach",
    "budget_analyzer",
    "envelope_manager",
    "transaction_processor",
    "insight_generator",
    "triage"
  ]),
  instructions: z.string().min(1, "Agent instructions are required"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  max_tokens: z.number().positive().optional(), // SDK uses max_tokens
  tools: z.array(z.string()).optional(),
  handoffs: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(10).default(5),
  specializations: z.array(z.string()).optional(),
  contextWindow: z.number().positive().optional(),
});

// Agent execution context
export const AgentContextSchema = z.object({
  userId: z.string(),
  sessionId: z.string().optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
    timestamp: z.string().datetime(),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
  userProfile: z.object({
    name: z.string().optional(),
    isNewUser: z.boolean(),
    preferences: z.record(z.unknown()).optional(),
    financialGoals: z.array(z.string()).optional(),
  }).optional(),
  financialContext: z.object({
    totalBalance: z.number(),
    envelopes: z.array(z.object({
      id: z.string(),
      name: z.string(),
      balance: z.number(),
      budget: z.number(),
      category: z.string().optional(),
    })),
    recentTransactions: z.array(z.object({
      id: z.string(),
      amount: z.number(),
      description: z.string(),
      envelopeId: z.string().optional(),
      timestamp: z.string().datetime(),
    })).optional(),
    monthlyIncome: z.number().optional(),
    monthlyExpenses: z.number().optional(),
  }).optional(),
});

// Agent response schema
export const AgentResponseSchema = z.object({
  response: z.string(),
  confidence: z.number().min(0).max(100),
  suggestedActions: z.array(z.object({
    type: z.enum([
      "create_envelope",
      "transfer_funds",
      "analyze_spending",
      "set_budget",
      "review_goals",
      "gather_info"
    ]),
    description: z.string(),
    parameters: z.record(z.unknown()).optional(),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  })).optional(),
  handoffTarget: z.string().optional(),
  followUpQuestions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Agent performance metrics
export const AgentMetricsSchema = z.object({
  agentName: z.string(),
  totalInteractions: z.number().int().min(0),
  successfulInteractions: z.number().int().min(0),
  averageResponseTime: z.number().positive(),
  averageConfidence: z.number().min(0).max(100),
  lastUsed: z.string().datetime(),
  errorCount: z.number().int().min(0),
  handoffCount: z.number().int().min(0),
});

// Type exports
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type AgentContext = z.infer<typeof AgentContextSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type AgentMetrics = z.infer<typeof AgentMetricsSchema>;

// Agent role definitions
export const AGENT_ROLES = {
  FINANCIAL_COACH: "financial_coach",
  BUDGET_ANALYZER: "budget_analyzer",
  ENVELOPE_MANAGER: "envelope_manager",
  TRANSACTION_PROCESSOR: "transaction_processor",
  INSIGHT_GENERATOR: "insight_generator",
  TRIAGE: "triage"
} as const;

// Agent capabilities mapping
export const AGENT_CAPABILITIES = {
  [AGENT_ROLES.FINANCIAL_COACH]: [
    "conversation",
    "goal_setting",
    "financial_advice",
    "motivation",
    "education"
  ],
  [AGENT_ROLES.BUDGET_ANALYZER]: [
    "budget_analysis",
    "spending_patterns",
    "variance_analysis",
    "forecasting"
  ],
  [AGENT_ROLES.ENVELOPE_MANAGER]: [
    "envelope_creation",
    "fund_allocation",
    "balance_management",
    "category_optimization"
  ],
  [AGENT_ROLES.TRANSACTION_PROCESSOR]: [
    "transaction_categorization",
    "automatic_allocation",
    "pattern_recognition",
    "anomaly_detection"
  ],
  [AGENT_ROLES.INSIGHT_GENERATOR]: [
    "trend_analysis",
    "insights_generation",
    "recommendations",
    "predictive_analysis"
  ],
  [AGENT_ROLES.TRIAGE]: [
    "intent_classification",
    "agent_routing",
    "priority_assessment",
    "context_switching"
  ]
} as const;

// Agent instance type for runtime
export interface AgentInstance {
  config: AgentConfig;
  agent: Agent;
  isInitialized: boolean;
  lastUsed: Date;
  metrics: AgentMetrics;
}

// Agent registry type
export interface AgentRegistry {
  [agentName: string]: AgentInstance;
}

// Financial context for agents (consolidated)
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

// Agent interaction history
export const AgentInteractionSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string(),
  agentName: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AgentInteraction = z.infer<typeof AgentInteractionSchema>;

// Extended run context for financial agents
export interface FinancialRunContext extends RunContext<FinancialContext> {
  sessionId: string;
  timestamp: Date;
  previousInteractions: AgentInteraction[];
}

// Agent execution result
export interface AgentExecutionResult {
  success: boolean;
  response: string;
  agentName: string;
  sessionId: string;
  timestamp: Date;
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Agent capabilities
export interface AgentCapability {
  name: string;
  description: string;
  category: string;
  complexity: 'low' | 'medium' | 'high';
}

// Agent metrics
export interface AgentMetrics {
  totalInteractions: number;
  successfulInteractions: number;
  averageResponseTime: number;
  lastInteraction?: Date;
  errorRate: number;
}