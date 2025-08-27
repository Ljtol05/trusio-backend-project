
import { Agent } from '@openai/agents';
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { AGENT_CONFIG, AGENT_PROMPTS, createAgentConfig } from '../config.js';
import { agentValidator } from '../core/AgentValidator.js';
import { agentLifecycleManager } from '../config.js';
import type { FinancialContext, AgentExecutionResult } from '../types.js';

export class BudgetCoachAgent {
  private agent: Agent;
  private isInitialized = false;

  constructor() {
    const config = createAgentConfig('Budget Coach', 'budget_coach', {
      handoffs: ['financial_advisor', 'transaction_analyst', 'insight_generator'],
      specializations: ['envelope_budgeting', 'budget_optimization', 'allocation_strategy'],
    });

    this.agent = new Agent({
      name: config.name,
      instructions: AGENT_PROMPTS.budgetCoach,
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      tools: config.tools || [],
    });

    logger.info({ agentName: config.name }, 'Budget Coach Agent initialized');
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
    const agentName = 'budget_coach';

    try {
      const inputValidation = agentValidator.validateInput({ message });
      if (!inputValidation.isValid) {
        throw new Error(`Input validation failed: ${inputValidation.errors?.join(', ')}`);
      }

      agentLifecycleManager.startAgent(agentName, context);

      logger.info({ 
        agentName, 
        userId: context.userId, 
        sessionId: context.sessionId 
      }, 'Budget Coach processing request');

      // Build budget-specific context
      const budgetAnalysis = this.analyzeBudgetSituation(context);
      const enhancedPrompt = this.buildBudgetPrompt(message, context, budgetAnalysis);

      const response = await createAgentResponse(
        AGENT_PROMPTS.budgetCoach,
        enhancedPrompt,
        context.previousInteractions || [],
        {
          temperature: 0.6, // Slightly lower for more consistent budget advice
          maxTokens: AGENT_CONFIG.maxTokens,
          useAdvancedModel: true,
        }
      );

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
      }, 'Budget Coach execution failed');

      return {
        success: false,
        response: 'I apologize, but I encountered an issue analyzing your budget. Please try again with more specific details about your budgeting needs.',
        agentName,
        sessionId: context.sessionId,
        timestamp: new Date(),
        duration,
        error: error.message,
      };
    }
  }

  private analyzeBudgetSituation(context: FinancialContext) {
    const analysis: any = {
      totalAllocated: 0,
      totalTargets: 0,
      overallocatedEnvelopes: [],
      underallocatedEnvelopes: [],
      emptyEnvelopes: [],
      healthyEnvelopes: [],
    };

    if (context.envelopes) {
      context.envelopes.forEach(envelope => {
        analysis.totalAllocated += envelope.balance;
        analysis.totalTargets += envelope.target;

        const allocationRatio = envelope.target > 0 ? envelope.balance / envelope.target : 0;

        if (envelope.balance === 0) {
          analysis.emptyEnvelopes.push(envelope);
        } else if (allocationRatio > 1.1) {
          analysis.overallocatedEnvelopes.push(envelope);
        } else if (allocationRatio < 0.8) {
          analysis.underallocatedEnvelopes.push(envelope);
        } else {
          analysis.healthyEnvelopes.push(envelope);
        }
      });
    }

    analysis.budgetUtilization = analysis.totalTargets > 0 ? 
      ((analysis.totalAllocated / analysis.totalTargets) * 100).toFixed(1) : '0';

    return analysis;
  }

  private buildBudgetPrompt(message: string, context: FinancialContext, analysis: any): string {
    const promptParts: string[] = [message];

    promptParts.push('\n**Budget Analysis:**');
    promptParts.push(`- Total Allocated: $${analysis.totalAllocated.toFixed(2)}`);
    promptParts.push(`- Total Targets: $${analysis.totalTargets.toFixed(2)}`);
    promptParts.push(`- Budget Utilization: ${analysis.budgetUtilization}%`);

    if (analysis.overallocatedEnvelopes.length > 0) {
      promptParts.push('\n**Over-allocated Envelopes:**');
      analysis.overallocatedEnvelopes.forEach((env: any) => {
        promptParts.push(`- ${env.name}: $${env.balance.toFixed(2)} / $${env.target.toFixed(2)}`);
      });
    }

    if (analysis.underallocatedEnvelopes.length > 0) {
      promptParts.push('\n**Under-allocated Envelopes:**');
      analysis.underallocatedEnvelopes.forEach((env: any) => {
        promptParts.push(`- ${env.name}: $${env.balance.toFixed(2)} / $${env.target.toFixed(2)}`);
      });
    }

    if (analysis.emptyEnvelopes.length > 0) {
      promptParts.push('\n**Empty Envelopes:**');
      analysis.emptyEnvelopes.forEach((env: any) => {
        promptParts.push(`- ${env.name}: Target $${env.target.toFixed(2)}`);
      });
    }

    // Add spending patterns if available
    if (context.transactions && context.transactions.length > 0) {
      const expensesByCategory = this.categorizeExpenses(context.transactions);
      promptParts.push('\n**Recent Spending by Category:**');
      Object.entries(expensesByCategory).forEach(([category, amount]) => {
        promptParts.push(`- ${category}: $${(amount as number).toFixed(2)}`);
      });
    }

    return promptParts.join('\n');
  }

  private categorizeExpenses(transactions: any[]): Record<string, number> {
    const categories: Record<string, number> = {};

    transactions
      .filter(t => t.amount < 0) // Only expenses
      .forEach(transaction => {
        const category = transaction.category || 'uncategorized';
        const amount = Math.abs(transaction.amount);
        categories[category] = (categories[category] || 0) + amount;
      });

    return categories;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getCapabilities(): string[] {
    return [
      'budget_analysis',
      'envelope_optimization',
      'allocation_strategy',
      'variance_analysis',
      'budget_planning'
    ];
  }
}
