import { z } from 'zod';
import { logger } from '../lib/logger.ts';
import { env } from '../config/env.ts';
import type { AgentConfig, FinancialContext } from './types.ts';

// Agent configuration schema
export const AgentConfigurationSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  role: z.enum([
    'financial_advisor',
    'budget_coach',
    'transaction_analyst',
    'insight_generator',
    'crisis_agent',
    'onboarding_agent'
  ]),
  instructions: z.string().min(1, 'Agent instructions are required'),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  tools: z.array(z.string()).optional(),
  handoffs: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(10).default(5),
  specializations: z.array(z.string()).optional(),
  contextWindow: z.number().positive().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
  requiresAuth: z.boolean().default(true),
  estimatedDuration: z.number().positive().default(5000), // milliseconds
});

// Base configuration settings
export const AGENT_BASE_CONFIG = {
  // Default model settings
  defaultModel: env.OPENAI_MODEL_AGENTIC,
  fallbackModel: env.OPENAI_MODEL_PRIMARY,

  // Agent behavior settings
  maxTokens: 2000,
  temperature: 0.7,

  // Tool execution settings
  maxToolCalls: 8,
  toolTimeout: 45000, // 45 seconds

  // Routing settings
  routingConfidence: 0.8,
  fallbackToDefault: true,

  // Context management
  maxContextHistory: 20,
  contextExpirationMs: 3600000, // 1 hour

  // Performance settings
  maxConcurrentAgents: 5,
  agentExecutionTimeout: 120000, // 2 minutes

  // Memory settings
  maxMemoryEntries: 1000,
  memoryTtlMs: 86400000, // 24 hours

  // Security settings
  enableInputValidation: true,
  enableOutputValidation: true,
  maxInputLength: 50000,
  maxOutputLength: 100000,

  // Logging settings
  logAgentCalls: env.NODE_ENV === 'development',
  logToolCalls: env.NODE_ENV === 'development',
  logPerformanceMetrics: true,
} as const;

// Agent configurations that match test expectations
export const AGENT_CONFIG = {
  financial_advisor: {
    name: 'Financial Advisor',
    description: 'Primary financial coaching and coordination agent',
    instructions: AGENT_PROMPTS.financialAdvisor,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.7,
    maxTokens: 2000,
    tools: ['generate_recommendations', 'identify_opportunities', 'track_achievements', 'agent_handoff'],
    handoffs: ['budget_coach', 'transaction_analyst', 'insight_generator', 'crisis_agent', 'onboarding_agent'],
    isActive: true,
    priority: 5,
    specialties: ['comprehensive_guidance', 'goal_setting', 'agent_coordination', 'holistic_planning'],
    contextWindow: 20,
    riskLevel: 'low' as const,
    requiresAuth: true,
    estimatedDuration: 5000,
  },
  budget_coach: {
    name: 'Budget Coach',
    description: 'Specialized budget creation and optimization agent',
    instructions: AGENT_PROMPTS.budgetCoach,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.7,
    maxTokens: 2000,
    tools: ['budget_analysis', 'spending_patterns', 'variance_calculation', 'create_envelope', 'transfer_funds', 'manage_balance', 'optimize_categories', 'agent_handoff'],
    handoffs: ['financial_advisor', 'transaction_analyst', 'insight_generator'],
    isActive: true,
    priority: 5,
    specialties: ['envelope_budgeting', 'budget_creation', 'fund_allocation', 'category_optimization'],
    contextWindow: 20,
    riskLevel: 'medium' as const,
    requiresAuth: true,
    estimatedDuration: 7000,
  },
  transaction_analyst: {
    name: 'Transaction Analyst',
    description: 'Specialized spending analysis and categorization agent',
    instructions: AGENT_PROMPTS.transactionAnalyst,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.7,
    maxTokens: 2000,
    tools: ['categorize_transaction', 'auto_allocate', 'recognize_patterns', 'detect_anomalies', 'analyze_spending_patterns', 'analyze_budget_variance', 'agent_handoff'],
    handoffs: ['financial_advisor', 'budget_coach', 'insight_generator'],
    isActive: true,
    priority: 5,
    specialties: ['spending_analysis', 'transaction_categorization', 'pattern_recognition', 'anomaly_detection'],
    contextWindow: 20,
    riskLevel: 'low' as const,
    requiresAuth: true,
    estimatedDuration: 4000,
  },
  insight_generator: {
    name: 'Insight Generator',
    description: 'Specialized analytics and recommendation agent',
    instructions: AGENT_PROMPTS.insightGenerator,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.7,
    maxTokens: 2000,
    tools: ['analyze_trends', 'analyze_goal_progress', 'generate_recommendations', 'identify_opportunities', 'detect_warnings', 'track_achievements', 'agent_handoff'],
    handoffs: ['financial_advisor', 'budget_coach', 'transaction_analyst'],
    isActive: true,
    priority: 5,
    specialties: ['trend_analysis', 'goal_tracking', 'personalized_recommendations', 'predictive_insights'],
    contextWindow: 20,
    riskLevel: 'low' as const,
    requiresAuth: true,
    estimatedDuration: 6000,
  },
  crisis_agent: {
    name: 'Crisis Agent',
    description: 'Specialized emergency financial assistance agent',
    instructions: AGENT_PROMPTS.crisisAgent,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.7,
    maxTokens: 2000,
    tools: ['emergency_analysis', 'crisis_budgeting', 'debt_management', 'emergency_transfers', 'stress_assessment', 'agent_handoff'],
    handoffs: ['financial_advisor', 'budget_coach'],
    isActive: true,
    priority: 5,
    specialties: ['crisis_intervention', 'emergency_planning', 'stress_management', 'immediate_action'],
    contextWindow: 20,
    riskLevel: 'high' as const,
    requiresAuth: true,
    estimatedDuration: 8000,
  },
  onboarding_agent: {
    name: 'Onboarding Agent',
    description: 'Specialized new user setup and education agent',
    instructions: AGENT_PROMPTS.onboardingAgent,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.7,
    maxTokens: 2000,
    tools: ['setup_assessment', 'create_initial_envelopes', 'education_delivery', 'goal_establishment', 'progress_tracking', 'agent_handoff'],
    handoffs: ['financial_advisor', 'budget_coach'],
    isActive: true,
    priority: 5,
    specialties: ['user_onboarding', 'financial_education', 'initial_setup', 'system_introduction'],
    contextWindow: 20,
    riskLevel: 'low' as const,
    requiresAuth: true,
    estimatedDuration: 10000,
  },
} as const;

export const AGENT_PROMPTS = {
  systemBase: `You are a helpful financial assistant specializing in envelope budgeting methodology.
  You have access to various tools to help users manage their finances effectively.
  Always be supportive, encouraging, and provide actionable advice.

  Key principles:
  - Focus on envelope budgeting best practices
  - Encourage sustainable financial habits
  - Provide clear, actionable guidance
  - Be empathetic and non-judgmental
  - Use tools appropriately to gather data and take actions

  When unsure about a user's financial situation, ask clarifying questions.
  When you need specialized help, use agent handoffs to delegate to experts.`,

  financialAdvisor: `You are the primary financial coaching agent and coordinator. Your role includes:

  CORE RESPONSIBILITIES:
  - Provide comprehensive financial guidance using envelope budgeting principles
  - Coordinate with specialist agents when needed using handoffs
  - Help users understand their financial situation holistically
  - Encourage healthy financial habits and goal achievement

  HANDOFF STRATEGY:
  - Use budget_coach for detailed budgeting assistance and envelope setup
  - Use transaction_analyst for spending pattern analysis and categorization
  - Use insight_generator for data-driven recommendations and trend analysis
  - Use crisis_agent for urgent financial assistance or debt management
  - Use onboarding_agent for new user setup and initial guidance

  Always maintain context when handing off and provide clear reasons for the handoff.`,

  budgetCoach: `You are a specialized budget coaching agent with deep expertise in envelope budgeting.

  EXPERTISE AREAS:
  - Creating and optimizing envelope budgets
  - Helping users allocate funds effectively across categories
  - Teaching envelope budgeting best practices
  - Troubleshooting budget issues and imbalances
  - Setting realistic budget targets and goals

  TOOLS AVAILABLE:
  - Budget analysis and variance calculation
  - Envelope creation and management
  - Fund transfer and balance optimization
  - Category optimization and recommendations

  Focus on practical, actionable budgeting advice that users can implement immediately.
  Help users understand the psychology of budgeting and build sustainable habits.`,

  transactionAnalyst: `You are a specialized transaction analysis agent focused on spending insights.

  EXPERTISE AREAS:
  - Analyzing spending patterns and trends
  - Categorizing transactions automatically and accurately
  - Detecting unusual spending or potential issues
  - Providing insights into financial behavior and habits
  - Identifying opportunities for optimization

  ANALYSIS CAPABILITIES:
  - Pattern recognition in spending behavior
  - Anomaly detection for unusual transactions
  - Category-based spending analysis
  - Seasonal and trend analysis
  - Merchant and location-based insights

  Present findings in clear, actionable ways that help users make better financial decisions.
  Focus on helping users understand their spending habits without being judgmental.`,

  insightGenerator: `You are a specialized insight generation agent focused on analytics and recommendations.

  EXPERTISE AREAS:
  - Analyzing financial data to identify trends and patterns
  - Generating personalized recommendations based on user behavior
  - Tracking progress toward financial goals
  - Providing predictive insights and early warnings
  - Creating actionable financial forecasts

  ANALYTICAL TOOLS:
  - Trend analysis and pattern recognition
  - Goal progress tracking and projections
  - Opportunity identification and recommendations
  - Risk assessment and early warning systems
  - Performance benchmarking and comparisons

  Use your analytical tools to provide data-driven insights that help users make informed financial decisions.
  Focus on actionable recommendations that align with their financial goals and envelope budgeting strategy.`,

  crisisAgent: `You are a specialized crisis intervention agent for urgent financial situations.

  CRISIS SITUATIONS:
  - Emergency budget overruns
  - Unexpected large expenses
  - Income loss or reduction
  - Debt management crises
  - Financial stress and anxiety

  INTERVENTION STRATEGIES:
  - Immediate budget triage and adjustment
  - Emergency fund activation
  - Expense prioritization and cutting
  - Crisis communication with creditors
  - Stress management and emotional support

  Provide calm, reassuring guidance while helping users navigate financial emergencies.
  Focus on immediate stabilization and short-term survival strategies.`,

  onboardingAgent: `You are a specialized onboarding agent for new users to the envelope budgeting system.

  ONBOARDING RESPONSIBILITIES:
  - Guide new users through initial setup
  - Explain envelope budgeting concepts clearly
  - Help establish initial budget categories and amounts
  - Set up first envelopes and funding allocations
  - Provide initial financial education and tips

  SETUP PROCESS:
  - Assess current financial situation
  - Identify income sources and frequency
  - Categorize existing expenses
  - Create appropriate envelope structure
  - Set initial budget targets and goals

  Be patient, educational, and encouraging with new users.
  Focus on building confidence and understanding of the envelope budgeting system.`
} as const;

// Agent capability definitions
export const AGENT_CAPABILITIES = {
  financial_advisor: {
    name: 'Financial Advisor',
    description: 'Primary financial coaching and coordination agent',
    tools: ['generate_recommendations', 'identify_opportunities', 'track_achievements', 'agent_handoff'],
    specialties: ['comprehensive_guidance', 'goal_setting', 'agent_coordination', 'holistic_planning'],
    riskLevel: 'low' as const,
    estimatedDuration: 5000,
    requiresAuth: true,
  },
  budget_coach: {
    name: 'Budget Coach',
    description: 'Specialized budget creation and optimization agent',
    tools: [
      'budget_analysis', 'spending_patterns', 'variance_calculation',
      'create_envelope', 'transfer_funds', 'manage_balance', 'optimize_categories', 'agent_handoff'
    ],
    specialties: ['envelope_budgeting', 'budget_creation', 'fund_allocation', 'category_optimization'],
    riskLevel: 'medium' as const,
    estimatedDuration: 7000,
    requiresAuth: true,
  },
  transaction_analyst: {
    name: 'Transaction Analyst',
    description: 'Specialized spending analysis and categorization agent',
    tools: [
      'categorize_transaction', 'auto_allocate', 'recognize_patterns',
      'detect_anomalies', 'analyze_spending_patterns', 'analyze_budget_variance', 'agent_handoff'
    ],
    specialties: ['spending_analysis', 'transaction_categorization', 'pattern_recognition', 'anomaly_detection'],
    riskLevel: 'low' as const,
    estimatedDuration: 4000,
    requiresAuth: true,
  },
  insight_generator: {
    name: 'Insight Generator',
    description: 'Specialized analytics and recommendation agent',
    tools: [
      'analyze_trends', 'analyze_goal_progress', 'generate_recommendations',
      'identify_opportunities', 'detect_warnings', 'track_achievements', 'agent_handoff'
    ],
    specialties: ['trend_analysis', 'goal_tracking', 'personalized_recommendations', 'predictive_insights'],
    riskLevel: 'low' as const,
    estimatedDuration: 6000,
    requiresAuth: true,
  },
  crisis_agent: {
    name: 'Crisis Agent',
    description: 'Specialized emergency financial assistance agent',
    tools: [
      'emergency_analysis', 'crisis_budgeting', 'debt_management',
      'emergency_transfers', 'stress_assessment', 'agent_handoff'
    ],
    specialties: ['crisis_intervention', 'emergency_planning', 'stress_management', 'immediate_action'],
    riskLevel: 'high' as const,
    estimatedDuration: 8000,
    requiresAuth: true,
  },
  onboarding_agent: {
    name: 'Onboarding Agent',
    description: 'Specialized new user setup and education agent',
    tools: [
      'setup_assessment', 'create_initial_envelopes', 'education_delivery',
      'goal_establishment', 'progress_tracking', 'agent_handoff'
    ],
    specialties: ['user_onboarding', 'financial_education', 'initial_setup', 'system_introduction'],
    riskLevel: 'low' as const,
    estimatedDuration: 10000,
    requiresAuth: true,
  },
} as const;

// Agent lifecycle management
export class AgentLifecycleManager {
  private activeAgents: Map<string, { startTime: Date; context: any }> = new Map();
  private agentMetrics: Map<string, { calls: number; errors: number; totalDuration: number }> = new Map();

  startAgent(agentName: string, context: FinancialContext): void {
    this.activeAgents.set(agentName, {
      startTime: new Date(),
      context,
    });

    if (!this.agentMetrics.has(agentName)) {
      this.agentMetrics.set(agentName, { calls: 0, errors: 0, totalDuration: 0 });
    }

    const metrics = this.agentMetrics.get(agentName)!;
    metrics.calls += 1;
    this.agentMetrics.set(agentName, metrics);

    logger.info({ agentName, userId: context.userId }, 'Agent lifecycle started');
  }

  endAgent(agentName: string, success: boolean = true): void {
    const activeAgent = this.activeAgents.get(agentName);
    if (!activeAgent) {
      logger.warn({ agentName }, 'Attempted to end agent that was not started');
      return;
    }

    const duration = Date.now() - activeAgent.startTime.getTime();
    const metrics = this.agentMetrics.get(agentName)!;
    metrics.totalDuration += duration;

    if (!success) {
      metrics.errors += 1;
    }

    this.agentMetrics.set(agentName, metrics);
    this.activeAgents.delete(agentName);

    logger.info({
      agentName,
      duration,
      success,
      userId: activeAgent.context.userId
    }, 'Agent lifecycle ended');
  }

  getActiveAgents(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  getAgentMetrics(agentName?: string) {
    if (agentName) {
      return this.agentMetrics.get(agentName) || { calls: 0, errors: 0, totalDuration: 0 };
    }
    return Object.fromEntries(this.agentMetrics);
  }

  getAverageResponseTime(agentName: string): number {
    const metrics = this.agentMetrics.get(agentName);
    if (!metrics || metrics.calls === 0) return 0;
    return metrics.totalDuration / metrics.calls;
  }

  cleanup(): void {
    // Clean up agents that have been running too long
    const now = Date.now();
    const timeout = AGENT_BASE_CONFIG.agentExecutionTimeout;

    for (const [agentName, data] of this.activeAgents.entries()) {
      if (now - data.startTime.getTime() > timeout) {
        logger.warn({ agentName, timeout }, 'Agent execution timeout, forcing cleanup');
        this.endAgent(agentName, false);
      }
    }
  }
}

// Configuration validation and setup
export function validateAgentConfig(): boolean {
  try {
    const requiredEnvVars = [
      'OPENAI_API_KEY',
      'OPENAI_MODEL_AGENTIC',
      'OPENAI_MODEL_PRIMARY'
    ];

    const missing = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
      logger.error({ missing }, 'Missing required environment variables for agents');
      return false;
    }

    // Validate agent configuration schema
    const testConfig: AgentConfig = {
      name: 'test',
      role: 'financial_advisor',
      instructions: 'test instructions',
      isActive: true,
      priority: 5,
    };

    AgentConfigurationSchema.parse(testConfig);

    logger.info('Agent configuration validated successfully');
    return true;
  } catch (error) {
    logger.error({ error }, 'Agent configuration validation failed');
    return false;
  }
}

// Agent configuration factory
export function createAgentConfig(
  name: string,
  role: keyof typeof AGENT_CAPABILITIES,
  overrides: Partial<AgentConfig> = {}
): AgentConfig {
  const capability = AGENT_CAPABILITIES[role];

  const baseConfig: AgentConfig = {
    name: capability.name,
    role,
    instructions: AGENT_PROMPTS[role] || AGENT_PROMPTS.systemBase,
    model: AGENT_BASE_CONFIG.defaultModel,
    temperature: AGENT_BASE_CONFIG.temperature,
    maxTokens: AGENT_BASE_CONFIG.maxTokens,
    tools: capability.tools,
    handoffs: [], // Will be set based on agent relationships
    isActive: true,
    priority: 5,
    specializations: capability.specialties,
    contextWindow: AGENT_BASE_CONFIG.maxContextHistory,
    riskLevel: capability.riskLevel,
    requiresAuth: capability.requiresAuth,
    estimatedDuration: capability.estimatedDuration,
  };

  return { ...baseConfig, ...overrides };
}

// Export singleton lifecycle manager
export const agentLifecycleManager = new AgentLifecycleManager();

// Cleanup interval
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    agentLifecycleManager.cleanup();
  }, 30000); // Cleanup every 30 seconds
}