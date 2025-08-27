
import { Agent } from '@openai/agents';
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { AGENT_CONFIG, AGENT_PROMPTS, createAgentConfig } from '../config.js';
import { agentValidator } from '../core/AgentValidator.js';
import { agentLifecycleManager } from '../config.js';
import type { FinancialContext, AgentExecutionResult } from '../types.js';

export class FinancialAdvisorAgent {
  private agent: Agent;
  private isInitialized = false;

  constructor() {
    const config = createAgentConfig('Financial Advisor', 'financial_advisor', {
      handoffs: ['budget_coach', 'transaction_analyst', 'insight_generator', 'crisis_agent', 'onboarding_agent'],
    });

    this.agent = new Agent({
      name: config.name,
      instructions: AGENT_PROMPTS.financialAdvisor,
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      tools: config.tools || [],
    });

    logger.info({ agentName: config.name }, 'Financial Advisor Agent initialized');
    this.isInitialized = true;
  }

  async run(
    message: string,
    context: FinancialContext & {
      sessionId: string;
      timestamp: Date;
      previousInteractions?: any[];
    }
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const agentName = 'financial_advisor';

    try {
      // Validate input
      const inputValidation = agentValidator.validateInput({ message });
      if (!inputValidation.isValid) {
        throw new Error(`Input validation failed: ${inputValidation.errors?.join(', ')}`);
      }

      agentLifecycleManager.startAgent(agentName, context);

      logger.info({ 
        agentName, 
        userId: context.userId, 
        sessionId: context.sessionId 
      }, 'Financial Advisor processing request');

      // Build enhanced context for the agent
      const enhancedPrompt = this.buildContextualPrompt(message, context);

      // Get agent response using our OpenAI helper
      const response = await createAgentResponse(
        AGENT_PROMPTS.financialAdvisor,
        enhancedPrompt,
        context.previousInteractions || [],
        {
          temperature: AGENT_CONFIG.temperature,
          maxTokens: AGENT_CONFIG.maxTokens,
          useAdvancedModel: true,
        }
      );

      // Validate output
      const outputValidation = agentValidator.validateOutput({
        response,
        agentName,
        sessionId: context.sessionId,
        timestamp: new Date().toISOString(),
      });

      if (!outputValidation.isValid) {
        throw new Error(`Output validation failed: ${outputValidation.errors?.join(', ')}`);
      }

      const duration = Date.now() - startTime;
      agentLifecycleManager.endAgent(agentName, true);

      logger.info({ 
        agentName, 
        userId: context.userId, 
        duration,
        responseLength: response.length 
      }, 'Financial Advisor completed successfully');

      return {
        success: true,
        response,
        agentName,
        sessionId: context.sessionId,
        timestamp: new Date(),
        duration,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      agentLifecycleManager.endAgent(agentName, false);

      logger.error({ 
        error: error.message, 
        agentName, 
        userId: context.userId,
        duration 
      }, 'Financial Advisor execution failed');

      return {
        success: false,
        response: 'I apologize, but I encountered an issue processing your request. Please try again or rephrase your question.',
        agentName,
        sessionId: context.sessionId,
        timestamp: new Date(),
        duration,
        error: error.message,
      };
    }
  }

  private buildContextualPrompt(message: string, context: FinancialContext): string {
    const contextParts: string[] = [message];

    // Add financial summary
    if (context.totalIncome !== undefined || context.totalExpenses !== undefined) {
      contextParts.push('\n**Financial Summary:**');
      if (context.totalIncome !== undefined) {
        contextParts.push(`- Total Income: $${context.totalIncome.toFixed(2)}`);
      }
      if (context.totalExpenses !== undefined) {
        contextParts.push(`- Total Expenses: $${context.totalExpenses.toFixed(2)}`);
      }
    }

    // Add envelope information
    if (context.envelopes && context.envelopes.length > 0) {
      contextParts.push('\n**Current Envelopes:**');
      context.envelopes.forEach(envelope => {
        const percentage = envelope.target > 0 ? ((envelope.balance / envelope.target) * 100).toFixed(1) : 'N/A';
        contextParts.push(
          `- ${envelope.name}: $${envelope.balance.toFixed(2)} / $${envelope.target.toFixed(2)} (${percentage}%)`
        );
      });
    }

    // Add recent transactions summary
    if (context.transactions && context.transactions.length > 0) {
      const recentTransactions = context.transactions.slice(0, 5);
      contextParts.push('\n**Recent Transactions:**');
      recentTransactions.forEach(transaction => {
        const amount = transaction.amount >= 0 ? `+$${transaction.amount.toFixed(2)}` : `-$${Math.abs(transaction.amount).toFixed(2)}`;
        contextParts.push(`- ${transaction.description}: ${amount} (${transaction.category})`);
      });
    }

    // Add goals if available
    if (context.goals && context.goals.length > 0) {
      contextParts.push('\n**Financial Goals:**');
      context.goals.forEach(goal => {
        const progress = goal.targetAmount > 0 ? ((goal.currentAmount / goal.targetAmount) * 100).toFixed(1) : '0';
        const deadline = goal.deadline ? new Date(goal.deadline).toLocaleDateString() : 'No deadline';
        contextParts.push(
          `- ${goal.description}: $${goal.currentAmount.toFixed(2)} / $${goal.targetAmount.toFixed(2)} (${progress}%) - Due: ${deadline}`
        );
      });
    }

    return contextParts.join('\n');
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getCapabilities(): string[] {
    return [
      'comprehensive_financial_guidance',
      'agent_coordination',
      'goal_setting',
      'holistic_planning',
      'handoff_management'
    ];
  }
}
