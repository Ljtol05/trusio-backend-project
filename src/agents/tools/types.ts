// Re-export types from core for convenience
export type {
  ToolMetrics,
  Tool,
  ToolExecutionResult,
  ToolExecutionContext,
} from '../core/ToolRegistry.js';

// Financial tool types and interfaces
export interface FinancialContext {
  userId: string;
  currentBalance?: number;
  monthlyIncome?: number;
  financialGoals?: string[];
  riskTolerance?: 'low' | 'medium' | 'high';
}

export interface BudgetAnalysisParams {
  period: 'monthly' | 'quarterly' | 'yearly';
  categories?: string[];
}

export interface TransactionCategorizationParams {
  amount: number;
  description: string;
  merchant?: string;
  date?: string;
}

export interface EnvelopeParams {
  name: string;
  budgetAmount: number;
  category: string;
}

export interface TransferParams {
  fromEnvelope: string;
  toEnvelope: string;
  amount: number;
}

export interface RecommendationParams {
  analysisType: 'spending' | 'saving' | 'investment';
  timeframe?: string;
}

export interface AgentHandoffParams {
  targetAgent: 'budget_coach' | 'transaction_analyst' | 'insight_generator';
  context: string;
  priority?: 'low' | 'normal' | 'high';
}

// Tool execution result types
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  recommendations?: string[];
}

// Budget analysis result
export interface BudgetAnalysisResult extends ToolResult {
  data?: {
    totalBudget: number;
    totalSpent: number;
    remaining: number;
    categoryBreakdown: Record<string, {
      budgeted: number;
      spent: number;
      remaining: number;
    }>;
    alerts?: string[];
  };
}

// Transaction categorization result
export interface TransactionResult extends ToolResult {
  data?: {
    category: string;
    confidence: number;
    suggestedEnvelope?: string;
    reasoning: string;
  };
}

// Envelope management result
export interface EnvelopeResult extends ToolResult {
  data?: {
    envelopeId: string;
    name: string;
    balance: number;
    budgetAmount: number;
    category: string;
  };
}

// Recommendation result
export interface RecommendationResult extends ToolResult {
  data?: {
    recommendations: Array<{
      type: string;
      priority: 'low' | 'medium' | 'high';
      description: string;
      estimatedImpact: string;
      actionRequired: string;
    }>;
    insights: string[];
  };
}

// Agent handoff result
export interface HandoffResult extends ToolResult {
  data?: {
    targetAgent: string;
    handoffReason: string;
    contextPassed: string;
    nextSteps: string[];
  };
}

// Financial insights and patterns
export interface SpendingPattern {
  category: string;
  averageMonthly: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  seasonality?: string;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  priority: 'low' | 'medium' | 'high';
}

export interface BudgetVariance {
  category: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePercentage: number;
}

// Agent execution types
export interface AgentExecutionResult {
  success: boolean;
  response: string;
  agentName: string;
  sessionId: string;
  timestamp: Date;
  duration: number;
  error?: string;
}

export interface AgentInteraction {
  id: string;
  sessionId: string;
  agentName: string;
  userMessage: string;
  agentResponse: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}