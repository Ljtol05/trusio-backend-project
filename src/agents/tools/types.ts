
// Re-export types from core for convenience
export type {
  ToolMetrics,
  Tool,
  ToolExecutionResult,
  ToolExecutionContext,
} from '../core/ToolRegistry.js';

// Financial-specific context extensions
export interface FinancialContext extends Record<string, any> {
  userId: string;
  sessionId?: string;
  totalIncome?: number;
  totalExpenses?: number;
  envelopes?: Array<{
    id: string;
    name: string;
    balance: number;
    target: number;
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
    name: string;
    target: number;
    current: number;
    deadline?: string;
  }>;
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
