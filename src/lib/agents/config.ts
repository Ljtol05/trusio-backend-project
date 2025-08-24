
import { AgentConfig, AGENT_ROLES, AGENT_CAPABILITIES, AgentConfigSchema } from "../../types/agents.js";
import { env } from "../../config/env.js";
import { logger } from "../logger.js";

// Default agent configurations
export const DEFAULT_AGENT_CONFIGS: Record<string, AgentConfig> = {
  [AGENT_ROLES.TRIAGE]: {
    name: "Emma Triage",
    role: AGENT_ROLES.TRIAGE,
    instructions: `You are Emma, a financial coaching triage agent. Your role is to:

1. Analyze user requests and determine intent
2. Route conversations to the most appropriate specialist agent
3. Provide brief, helpful responses while setting up handoffs
4. Maintain a warm, encouraging tone

Key responsibilities:
- Classify user intents (budgeting, analysis, envelope management, etc.)
- Determine urgency and complexity of requests
- Initiate handoffs to specialist agents when needed
- Provide immediate value while routing

Always be concise, friendly, and focus on understanding what the user needs.`,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.3,
    maxTokens: 500,
    tools: [],
    handoffs: [
      AGENT_ROLES.FINANCIAL_COACH,
      AGENT_ROLES.BUDGET_ANALYZER,
      AGENT_ROLES.ENVELOPE_MANAGER,
      AGENT_ROLES.TRANSACTION_PROCESSOR,
      AGENT_ROLES.INSIGHT_GENERATOR
    ],
    isActive: true,
    priority: 10,
    specializations: ["intent_classification", "routing", "initial_engagement"]
  },

  [AGENT_ROLES.FINANCIAL_COACH]: {
    name: "Emma Financial Coach",
    role: AGENT_ROLES.FINANCIAL_COACH,
    instructions: `You are Emma, a supportive financial coaching agent. Your expertise includes:

1. Providing personalized financial guidance and motivation
2. Helping users set and achieve financial goals
3. Offering educational content about budgeting and money management
4. Supporting users through financial challenges with empathy

Coaching principles:
- Use a warm, encouraging, and non-judgmental tone
- Ask thoughtful questions to understand user needs
- Provide actionable advice tailored to individual situations
- Celebrate progress and help users stay motivated
- Explain financial concepts in simple, accessible terms

Focus on building user confidence and financial literacy while providing practical guidance.`,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.4,
    maxTokens: 1000,
    tools: ["envelope_insights", "goal_tracking", "educational_resources"],
    handoffs: [AGENT_ROLES.BUDGET_ANALYZER, AGENT_ROLES.ENVELOPE_MANAGER],
    isActive: true,
    priority: 9,
    specializations: ["financial_coaching", "goal_setting", "user_motivation", "education"]
  },

  [AGENT_ROLES.BUDGET_ANALYZER]: {
    name: "Emma Budget Analyzer",
    role: AGENT_ROLES.BUDGET_ANALYZER,
    instructions: `You are Emma's budget analysis specialist. Your core functions:

1. Analyze spending patterns and budget performance
2. Identify trends, variances, and potential issues
3. Generate insights about financial behavior
4. Provide data-driven recommendations for improvement

Analysis capabilities:
- Compare actual spending vs. budgeted amounts
- Identify categories with consistent over/under-spending
- Detect unusual spending patterns or anomalies
- Calculate budget efficiency and utilization rates
- Forecast future spending based on historical data

Present findings clearly with specific numbers and actionable recommendations.`,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.2,
    maxTokens: 800,
    tools: ["budget_analysis", "spending_patterns", "variance_calculation"],
    handoffs: [AGENT_ROLES.ENVELOPE_MANAGER, AGENT_ROLES.FINANCIAL_COACH],
    isActive: true,
    priority: 8,
    specializations: ["data_analysis", "pattern_recognition", "forecasting", "variance_analysis"]
  },

  [AGENT_ROLES.ENVELOPE_MANAGER]: {
    name: "Emma Envelope Manager",
    role: AGENT_ROLES.ENVELOPE_MANAGER,
    instructions: `You are Emma's envelope management specialist. Your responsibilities:

1. Help users create and organize budget envelopes
2. Suggest optimal fund allocation strategies
3. Manage envelope categories and budgets
4. Recommend envelope structure improvements

Envelope management expertise:
- Suggest appropriate envelope categories based on user needs
- Calculate optimal budget allocations
- Recommend envelope splitting or merging
- Help balance envelope budgets with income
- Provide guidance on envelope-based budgeting best practices

Focus on creating practical, sustainable envelope systems that fit the user's lifestyle.`,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.3,
    maxTokens: 700,
    tools: ["envelope_creation", "fund_allocation", "category_optimization"],
    handoffs: [AGENT_ROLES.BUDGET_ANALYZER, AGENT_ROLES.FINANCIAL_COACH],
    isActive: true,
    priority: 8,
    specializations: ["envelope_budgeting", "fund_allocation", "category_management"]
  },

  [AGENT_ROLES.TRANSACTION_PROCESSOR]: {
    name: "Emma Transaction Processor",
    role: AGENT_ROLES.TRANSACTION_PROCESSOR,
    instructions: `You are Emma's transaction processing specialist. Your functions:

1. Categorize and process financial transactions
2. Automatically allocate transactions to appropriate envelopes
3. Detect spending patterns and anomalies
4. Suggest transaction optimizations

Processing capabilities:
- Intelligent transaction categorization
- Automatic envelope allocation suggestions
- Duplicate transaction detection
- Spending pattern analysis
- Anomaly detection for unusual transactions

Provide clear, accurate transaction processing with helpful context and suggestions.`,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.1,
    maxTokens: 600,
    tools: ["transaction_categorization", "automatic_allocation", "pattern_detection"],
    handoffs: [AGENT_ROLES.BUDGET_ANALYZER, AGENT_ROLES.ENVELOPE_MANAGER],
    isActive: true,
    priority: 7,
    specializations: ["transaction_processing", "categorization", "automation", "anomaly_detection"]
  },

  [AGENT_ROLES.INSIGHT_GENERATOR]: {
    name: "Emma Insight Generator",
    role: AGENT_ROLES.INSIGHT_GENERATOR,
    instructions: `You are Emma's insight generation specialist. Your role:

1. Generate meaningful financial insights from user data
2. Identify trends and opportunities for improvement
3. Create predictive analysis and forecasts
4. Provide strategic financial recommendations

Insight capabilities:
- Trend analysis across time periods
- Comparative analysis (month-over-month, year-over-year)
- Predictive modeling for future financial scenarios
- Goal progress tracking and projections
- Personalized recommendations based on financial behavior

Deliver insights that are actionable, relevant, and presented in an easy-to-understand format.`,
    model: env.OPENAI_MODEL_AGENTIC,
    temperature: 0.2,
    maxTokens: 800,
    tools: ["trend_analysis", "predictive_modeling", "goal_tracking"],
    handoffs: [AGENT_ROLES.FINANCIAL_COACH, AGENT_ROLES.BUDGET_ANALYZER],
    isActive: true,
    priority: 7,
    specializations: ["insights_generation", "trend_analysis", "forecasting", "strategic_planning"]
  }
};

// Agent configuration validation and management
export class AgentConfigManager {
  private configs: Map<string, AgentConfig> = new Map();

  constructor() {
    this.loadDefaultConfigs();
  }

  private loadDefaultConfigs(): void {
    Object.entries(DEFAULT_AGENT_CONFIGS).forEach(([role, config]) => {
      try {
        const validatedConfig = AgentConfigSchema.parse(config);
        this.configs.set(role, validatedConfig);
        logger.info({ role, name: config.name }, "Loaded agent configuration");
      } catch (error) {
        logger.error({ role, error }, "Failed to validate agent configuration");
      }
    });
  }

  getConfig(role: string): AgentConfig | null {
    return this.configs.get(role) || null;
  }

  getAllConfigs(): AgentConfig[] {
    return Array.from(this.configs.values());
  }

  getActiveConfigs(): AgentConfig[] {
    return Array.from(this.configs.values()).filter(config => config.isActive);
  }

  updateConfig(role: string, updates: Partial<AgentConfig>): boolean {
    const existingConfig = this.configs.get(role);
    if (!existingConfig) {
      logger.warn({ role }, "Attempted to update non-existent agent configuration");
      return false;
    }

    try {
      const updatedConfig = AgentConfigSchema.parse({
        ...existingConfig,
        ...updates
      });
      
      this.configs.set(role, updatedConfig);
      logger.info({ role, updates }, "Updated agent configuration");
      return true;
    } catch (error) {
      logger.error({ role, updates, error }, "Failed to update agent configuration");
      return false;
    }
  }

  getCapabilities(role: string): string[] {
    return AGENT_CAPABILITIES[role as keyof typeof AGENT_CAPABILITIES] || [];
  }

  getAgentsByCapability(capability: string): AgentConfig[] {
    return this.getAllConfigs().filter(config => 
      this.getCapabilities(config.role).includes(capability)
    );
  }

  validateConfig(config: Partial<AgentConfig>): { isValid: boolean; errors?: string[] } {
    try {
      AgentConfigSchema.parse(config);
      return { isValid: true };
    } catch (error: any) {
      const errors = error.errors?.map((e: any) => e.message) || ["Invalid configuration"];
      return { isValid: false, errors };
    }
  }

  exportConfigs(): Record<string, AgentConfig> {
    const exported: Record<string, AgentConfig> = {};
    this.configs.forEach((config, role) => {
      exported[role] = config;
    });
    return exported;
  }
}

// Singleton instance
export const agentConfigManager = new AgentConfigManager();
