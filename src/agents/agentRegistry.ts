import { Agent, tool, run } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { MODELS } from '../lib/openai.js';
import { AGENT_CONFIG, AGENT_PROMPTS } from './config.js';
import { toolRegistry } from './tools/index.js';
import type { FinancialContext } from './tools/types.js';

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private initialized = false;

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents(): void {
    try {
      // Financial Advisor Agent (Main coordinator)
      const financialAdvisor = new Agent({
        name: 'Financial Advisor',
        instructions: `${AGENT_PROMPTS.systemBase}

${AGENT_PROMPTS.financialAdvisor}

You are the primary financial coaching agent. Your role is to:
- Provide comprehensive financial guidance using envelope budgeting principles
- Coordinate with specialist agents when needed using handoffs
- Help users understand their financial situation holistically
- Encourage healthy financial habits and goal achievement

When you need specialized help:
- Use budget_coach for detailed budgeting assistance
- Use transaction_analyst for spending pattern analysis
- Use insight_generator for data-driven recommendations

Always be supportive, educational, and actionable in your advice.`,
        model: MODELS.agentic,
        tools: this.getToolsForAgent('financial_advisor'),
      });

      // Budget Coach Agent (Budgeting specialist)
      const budgetCoach = new Agent({
        name: 'Budget Coach',
        instructions: `${AGENT_PROMPTS.systemBase}

${AGENT_PROMPTS.budgetCoach}

You are a specialized budget coaching agent. Your expertise includes:
- Creating and optimizing envelope budgets
- Helping users allocate funds effectively across categories
- Teaching envelope budgeting best practices
- Troubleshooting budget issues and imbalances

You have access to budget analysis tools and can create, modify, and optimize envelopes.
Focus on practical, actionable budgeting advice that users can implement immediately.`,
        model: MODELS.agentic,
        tools: this.getToolsForAgent('budget_coach'),
      });

      // Transaction Analyst Agent (Spending analysis specialist)
      const transactionAnalyst = new Agent({
        name: 'Transaction Analyst',
        instructions: `${AGENT_PROMPTS.systemBase}

${AGENT_PROMPTS.transactionAnalyst}

You are a specialized transaction analysis agent. Your expertise includes:
- Analyzing spending patterns and trends
- Categorizing transactions automatically
- Detecting unusual spending or potential issues
- Providing insights into financial behavior

Use your analysis tools to help users understand their spending habits and identify opportunities for improvement.
Present findings in clear, actionable ways that help users make better financial decisions.`,
        model: MODELS.agentic,
        tools: this.getToolsForAgent('transaction_analyst'),
      });

      // Insight Generator Agent (Analytics and recommendations)
      const insightGenerator = new Agent({
        name: 'Insight Generator',
        instructions: `${AGENT_PROMPTS.systemBase}

${AGENT_PROMPTS.insightGenerator}

You are a specialized insight generation agent. Your expertise includes:
- Analyzing financial data to identify trends and patterns
- Generating personalized recommendations
- Tracking progress toward financial goals
- Providing predictive insights and warnings

Use your analytical tools to provide data-driven insights that help users make informed financial decisions.
Focus on actionable recommendations that align with their financial goals and envelope budgeting strategy.`,
        model: MODELS.agentic,
        tools: this.getToolsForAgent('insight_generator'),
      });

      // Register all agents
      this.agents.set('financial_advisor', financialAdvisor);
      this.agents.set('budget_coach', budgetCoach);
      this.agents.set('transaction_analyst', transactionAnalyst);
      this.agents.set('insight_generator', insightGenerator);

      logger.info({
        agentCount: this.agents.size,
        agentNames: Array.from(this.agents.keys())
      }, 'Financial coaching agents initialized successfully');

      this.initialized = true;

    } catch (error) {
      logger.error({ error: error.message }, 'Failed to initialize agent registry');
      throw error;
    }
  }

  private getToolsForAgent(agentType: string): any[] {
    const toolMappings: Record<string, string[]> = {
      'financial_advisor': [
        'generate_recommendations',
        'identify_opportunities',
        'track_achievements',
        'agent_handoff'
      ],
      'budget_coach': [
        'budget_analysis',
        'spending_patterns',
        'variance_calculation',
        'create_envelope',
        'transfer_funds',
        'manage_balance',
        'optimize_categories',
        'agent_handoff'
      ],
      'transaction_analyst': [
        'categorize_transaction',
        'auto_allocate',
        'recognize_patterns',
        'detect_anomalies',
        'analyze_spending_patterns',
        'analyze_budget_variance',
        'agent_handoff'
      ],
      'insight_generator': [
        'analyze_trends',
        'analyze_goal_progress',
        'generate_recommendations',
        'identify_opportunities',
        'detect_warnings',
        'track_achievements',
        'agent_handoff'
      ]
    };

    const toolNames = toolMappings[agentType] || [];
    const agentTools: any[] = [];
    const allTools = toolRegistry.getAllTools();

    for (const toolName of toolNames) {
      const toolInfo = allTools[toolName];
      if (toolInfo && toolInfo.tool) {
        agentTools.push(toolInfo.tool);
      }
    }

    logger.debug({
      agentType,
      assignedTools: toolNames,
      foundTools: agentTools.length
    }, "Retrieved tools for agent");

    return agentTools;
  }

  getAgent(name: string): Agent | null {
    return this.agents.get(name) || null;
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAgentNames(): Set<string> {
    return new Set(this.agents.keys());
  }

  routeToAgent(userMessage: string): Agent {
    // Simple routing logic based on message content
    const message = userMessage.toLowerCase();

    if (message.includes('budget') || message.includes('envelope') || message.includes('allocate')) {
      return this.getAgent('budget_coach') || this.getAgent('financial_advisor')!;
    }

    if (message.includes('spending') || message.includes('transaction') || message.includes('categorize')) {
      return this.getAgent('transaction_analyst') || this.getAgent('financial_advisor')!;
    }

    if (message.includes('insight') || message.includes('trend') || message.includes('analysis')) {
      return this.getAgent('insight_generator') || this.getAgent('financial_advisor')!;
    }

    // Default to financial advisor
    return this.getAgent('financial_advisor')!;
  }

  async runAgent(
    agentName: string,
    userMessage: string,
    context: FinancialContext
  ): Promise<string> {
    const agent = this.getAgent(agentName);
    if (!agent) {
      throw new Error(`Agent '${agentName}' not found`);
    }

    try {
      logger.info({ agentName, userId: context.userId }, 'Running financial agent');

      const result = await run(agent, userMessage, { context });

      // Handle different result types from the OpenAI Agents SDK
      let output: string;
      if (typeof result === 'string') {
        output = result;
      } else if (result && typeof result === 'object' && 'output' in result) {
        output = (result as any).output || 'I apologize, but I was unable to process your request.';
      } else {
        output = 'I apologize, but I was unable to process your request.';
      }

      logger.info({ 
        agentName, 
        userId: context.userId, 
        outputLength: output.length 
      }, 'Agent completed successfully');

      return output;
    } catch (error) {
      logger.error({ error, agentName, userId: context.userId }, 'Agent execution error');
      throw new Error('Failed to process request with financial agent');
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('Agent registry already initialized');
      return;
    }

    // Re-initialize if needed
    this.initializeAgents();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getAgentCapabilities(agentName: string): string[] {
    const capabilities: Record<string, string[]> = {
      'financial_advisor': [
        'comprehensive_financial_guidance',
        'goal_setting',
        'financial_education',
        'agent_coordination',
        'holistic_planning'
      ],
      'budget_coach': [
        'envelope_budgeting',
        'budget_creation',
        'fund_allocation',
        'category_optimization',
        'budget_troubleshooting'
      ],
      'transaction_analyst': [
        'spending_analysis',
        'transaction_categorization',
        'pattern_recognition',
        'anomaly_detection',
        'spending_insights'
      ],
      'insight_generator': [
        'trend_analysis',
        'goal_tracking',
        'personalized_recommendations',
        'predictive_insights',
        'financial_forecasting'
      ]
    };

    return capabilities[agentName] || [];
  }

  getAgentMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};

    this.agents.forEach((agent, name) => {
      metrics[name] = {
        name: agent.name,
        isAvailable: true,
        capabilities: this.getAgentCapabilities(name),
        toolCount: this.getToolsForAgent(name).length
      };
    });

    return metrics;
  }
}

// Create singleton instance
export const agentRegistry = new AgentRegistry();