// Main exports for the agents system
export * from './types.js';
export * from './config.js';
export * from './registry.js';
export * from './tools/index.js';

// Re-export commonly used OpenAI Agents SDK types and functions
export { Agent, run, tool, Runner } from '@openai/agents';
export type { Tool, RunContext } from '@openai/agents';

import { agentManager } from './registry.js';
import { agentRegistry } from './agentRegistry.js';
import { toolRegistry } from './tools/registry.js';
import type { FinancialContext } from './tools/types.js';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// Initialize the agent system
export const initializeAgentSystem = async (): Promise<boolean> => {
  try {
    logger.info('Initializing multi-agent financial coaching system...');

    // Initialize the agent manager (tools are auto-initialized)
    if (!agentManager.isReady()) {
      throw new Error('Agent manager not ready');
    }

    // Get system health check
    const healthStatus = agentManager.getAgentMetrics();
    const unhealthyAgents = Object.entries(healthStatus)
      .filter(([_, health]) => !health.isAvailable)
      .map(([role, _]) => role);

    if (unhealthyAgents.length > 0) {
      logger.warn({ unhealthyAgents }, 'Some agents failed health check');
    }

    // Log system statistics
    const totalAgents = Object.keys(agentManager.getAllAgents()).length;
    const readyAgents = agentManager.getAgentNames().filter(name => {
      const agent = agentManager.getAgent(name);
      return agent && agent.isReady();
    }).length;

    logger.info({
      readyAgents,
      totalAgents,
      roles: agentManager.getAgentNames()
    }, 'Agent system initialized successfully');

    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to initialize agent system');
    return false;
  }
};

export async function runFinancialAgent(
  agentName: string,
  userMessage: string,
  userId: number,
  userPreferences?: FinancialContext['userPreferences']
): Promise<string> {
  const agent = agentRegistry.getAgent(agentName);
  if (!agent) {
    throw new Error(`Agent '${agentName}' not found`);
  }

  const context: FinancialContext = {
    userId,
    userPreferences,
    db, // Include database access
  };

  try {
    logger.info({ agentName, userId }, 'Running financial agent');
    const result = await run(agent, userMessage, { context });

    // Handle different result types from the OpenAI Agents SDK
    let output: string;
    if (typeof result === 'string') {
      output = result;
    } else if (result && typeof result === 'object' && 'output' in result) {
      output = result.output || 'I apologize, but I was unable to process your request.';
    } else {
      output = 'I apologize, but I was unable to process your request.';
    }

    logger.info({ agentName, userId, outputLength: output.length }, 'Agent completed successfully');
    return output;
  } catch (error) {
    logger.error({ error, agentName, userId }, 'Agent execution error');
    throw new Error('Failed to process request with financial agent');
  }
}

export async function routeToAppropriateAgent(
  userMessage: string,
  userId: number,
  userPreferences?: FinancialContext['userPreferences']
): Promise<string> {
  try {
    // Use the agent registry's routing logic
    const agent = agentRegistry.routeToAgent(userMessage);
    const agentName = Array.from(agentRegistry.getAgentNames()).find(name =>
      agentRegistry.getAgent(name) === agent
    ) || 'financial_advisor';

    logger.info({ userMessage: userMessage.substring(0, 100), agentName, userId }, 'Routing to agent');

    return await runFinancialAgent(agentName, userMessage, userId, userPreferences);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to route to appropriate agent');
    // Fallback to default agent
    return await runFinancialAgent('financial_advisor', userMessage, userId, userPreferences);
  }
}

// Helper function to get available agents
export function getAvailableAgents(): Array<{ name: string; description: string }> {
  return [
    {
      name: 'budget_coach',
      description: 'Helps with budget creation, envelope management, and budgeting advice'
    },
    {
      name: 'transaction_analyst',
      description: 'Analyzes spending patterns and provides transaction insights'
    },
    {
      name: 'financial_advisor',
      description: 'Provides comprehensive financial guidance and coordinates with specialists'
    },
    {
      name: 'insight_generator',
      description: 'Generates personalized financial insights and recommendations'
    }
  ];
}

// Helper function to check if agents are properly configured
export function validateAgentConfiguration(): boolean {
  try {
    const agents = agentRegistry.getAllAgents();
    const tools = toolRegistry.getAllTools();

    logger.info({
      agentCount: agents.length,
      toolCount: tools.length
    }, 'Agent configuration validation');

    return agents.length > 0 && tools.length > 0;
  } catch (error) {
    logger.error({ error }, 'Agent configuration validation failed');
    return false;
  }
}

// Export the singleton manager for direct access
export { agentManager };
// Main entry point for the Multi-Agent Financial Coaching System
// This file provides barrel exports for all agent components

// ========================================
// CORE AGENT INFRASTRUCTURE
// ========================================

// Core Management System
export { AgentManager, agentManager } from './core/AgentManager.js';
export { agentRegistry } from './agentRegistry.js';

// Core Agent Infrastructure Components
export { AgentValidator, agentValidator } from './core/AgentValidator.js';
export { AgentContextManager, agentContextManager } from './core/AgentContextManager.js';
export { MemoryManager, memoryManager } from './core/MemoryManager.js';
export { GoalTracker, goalTracker } from './core/GoalTracker.js';
export { HandoffManager, handoffManager } from './core/HandoffManager.js';
export { ToolRegistry, toolRegistry } from './core/ToolRegistry.js';

// ========================================
// SPECIALIZED FINANCIAL AGENTS
// ========================================

// Multi-Agent Financial System
export {
  FinancialAdvisorAgent,
  BudgetCoachAgent,
  TransactionAnalystAgent,
  InsightGeneratorAgent,
} from './multi_agents/index.js';

// Core Specialized Agents
export { FinancialCoachAgent } from './core/FinancialCoachAgent.js';
export { OnboardingAgent } from './core/OnboardingAgent.js';
export { VoiceKYCAgent } from './core/VoiceKYCAgent.js';
export { ContentCreatorAgent } from './core/ContentCreatorAgent.js';
export { PersonalAI } from './core/PersonalAI.js';

// ========================================
// TOOLS AND UTILITIES
// ========================================

// Tool System
export {
  toolRegistry,
  budgetAnalysisTool,
  createEnvelopeTool,
  updateEnvelopeTool,
  categorizeTransactionTool,
  spendingPatternsTool,
  transferFundsTool,
  trackAchievementsTool,
  identifyOpportunitiesTool,
  generateInsightTool,
  memoryStoreTool,
  memoryRetrieveTool,
  agentHandoffTool,
  agentCapabilityCheckTool,
  analyzeSpendingTool,
  generateReportTool,
} from './tools/index.js';

// ========================================
// CONFIGURATION AND SETUP
// ========================================

// Agent Configuration and Lifecycle
export {
  agentLifecycleManager,
  DEFAULT_AGENT_CONFIG,
  AGENT_MODELS,
  HANDOFF_TRIGGERS,
} from './config.js';

// Health and Monitoring
export { agentHealth } from './health.js';

// Middleware and Response Formatting
export { agentMiddleware } from './middleware.js';
export { AgentResponseFormatter } from './responseFormatter.js';

// Bootstrap and Initialization
export { initializeAgentSystem } from './bootstrap.js';

// API Integration Layer
export { AgentAPIIntegration } from './apiIntegration.js';

// ========================================
// TYPES AND SCHEMAS
// ========================================

// Core Types
export type {
  AgentRole,
  FinancialContext,
  AgentConfig,
  AgentResponse,
  AgentInput,
  AgentOutput,
  AgentContext,
  ToolExecutionContext,
  ToolExecutionResult,
} from './types.js';

// Tool Types
export type {
  ToolDefinition,
  ToolCategory,
} from './tools/types.js';

// Schemas for Validation
export {
  FinancialContextSchema,
  AgentConfigSchema,
  AgentResponseSchema,
  AgentInputSchema,
  AgentOutputSchema,
  AgentContextSchema,
} from './types.js';

// ========================================
// CONSTANTS AND DEFAULTS
// ========================================

// Default configurations for production use
export const DEFAULT_FINANCIAL_CONTEXT = {
  userId: '',
  totalIncome: 0,
  totalExpenses: 0,
  envelopes: [],
  transactions: [],
  goals: [],
  riskTolerance: 'moderate' as const,
  timeHorizon: 'medium' as const,
};

export const AGENT_CAPABILITIES = {
  financial_advisor: [
    'financial_planning',
    'investment_advice',
    'debt_management',
    'retirement_planning',
    'goal_setting',
  ],
  budget_coach: [
    'envelope_management',
    'budget_optimization',
    'expense_tracking',
    'allocation_strategies',
    'financial_discipline',
  ],
  transaction_analyst: [
    'spending_analysis',
    'pattern_recognition',
    'categorization',
    'fraud_detection',
    'expense_optimization',
  ],
  insight_generator: [
    'trend_analysis',
    'predictive_modeling',
    'report_generation',
    'opportunity_identification',
    'behavioral_insights',
  ],
} as const;

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Get all available agent names
 */
export function getAvailableAgents(): AgentRole[] {
  return [
    'financial_advisor',
    'budget_coach',
    'transaction_analyst',
    'insight_generator',
    'onboarding_specialist',
    'voice_kyc',
    'content_creator',
    'personal_ai',
  ];
}

/**
 * Check if an agent is available
 */
export function isAgentAvailable(agentRole: AgentRole): boolean {
  return getAvailableAgents().includes(agentRole);
}

/**
 * Get agent capabilities
 */
export function getAgentCapabilities(agentRole: AgentRole): readonly string[] {
  return AGENT_CAPABILITIES[agentRole as keyof typeof AGENT_CAPABILITIES] || [];
}

/**
 * Initialize the complete multi-agent system
 */
export async function initializeMultiAgentSystem(): Promise<void> {
  try {
    // Initialize the agent system
    await initializeAgentSystem();

    // Verify all agents are ready
    if (!agentManager.isReady()) {
      throw new Error('Agent system failed to initialize properly');
    }

    console.log('✅ Multi-Agent Financial Coaching System initialized successfully');
    console.log(`📊 Available agents: ${agentManager.getAgentNames().join(', ')}`);
  } catch (error) {
    console.error('❌ Failed to initialize Multi-Agent System:', error);
    throw error;
  }
}

// ========================================
// DEFAULT EXPORT (Agent Manager Instance)
// ========================================

// Export the singleton AgentManager as default for convenience
export default agentManager;
