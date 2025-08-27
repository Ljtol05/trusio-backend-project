
import { Agent } from '@openai/agents';
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { AGENT_CONFIG, AGENT_PROMPTS, createAgentConfig } from '../config.js';
import { agentValidator } from '../core/AgentValidator.js';
import { agentLifecycleManager } from '../config.js';
import type { FinancialContext, AgentExecutionResult } from '../types.js';

export class InsightGeneratorAgent {
  private agent: Agent;
  private isInitialized = false;

  constructor() {
    const config = createAgentConfig('Insight Generator', 'insight_generator', {
      handoffs: ['financial_advisor', 'budget_coach', 'transaction_analyst'],
      specializations: ['trend_analysis', 'goal_tracking', 'personalized_recommendations', 'predictive_insights'],
    });

    this.agent = new Agent({
      name: config.name,
      instructions: AGENT_PROMPTS.insightGenerator,
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      tools: config.tools || [],
    });

    logger.info({ agentName: config.name }, 'Insight Generator Agent initialized');
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
    const agentName = 'insight_generator';

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
      }, 'Insight Generator processing request');

      // Generate comprehensive insights
      const insights = this.generateInsights(context);
      const enhancedPrompt = this.buildInsightPrompt(message, context, insights);

      const response = await createAgentResponse(
        AGENT_PROMPTS.insightGenerator,
        enhancedPrompt,
        context.previousInteractions || [],
        {
          temperature: 0.6, // Balanced creativity for insights
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
      }, 'Insight Generator execution failed');

      return {
        success: false,
        response: 'I apologize, but I encountered an issue generating insights from your financial data. Please ensure you have sufficient data and try again.',
        agentName,
        sessionId: context.sessionId,
        timestamp: new Date(),
        duration,
        error: error.message,
      };
    }
  }

  private generateInsights(context: FinancialContext) {
    const insights: any = {
      financialHealth: this.assessFinancialHealth(context),
      goalProgress: this.analyzeGoalProgress(context),
      recommendations: this.generateRecommendations(context),
      opportunities: this.identifyOpportunities(context),
      trends: this.analyzeTrends(context),
      warnings: this.identifyWarnings(context),
    };

    return insights;
  }

  private assessFinancialHealth(context: FinancialContext) {
    const health: any = {
      score: 0,
      factors: [],
      strengths: [],
      concerns: [],
    };

    let scoreComponents = 0;
    let totalScore = 0;

    // Income vs Expenses ratio
    if (context.totalIncome !== undefined && context.totalExpenses !== undefined) {
      const savingsRate = context.totalIncome > 0 ? 
        ((context.totalIncome - context.totalExpenses) / context.totalIncome) * 100 : 0;
      
      scoreComponents++;
      if (savingsRate >= 20) {
        totalScore += 30;
        health.strengths.push(`Excellent savings rate: ${savingsRate.toFixed(1)}%`);
      } else if (savingsRate >= 10) {
        totalScore += 20;
        health.strengths.push(`Good savings rate: ${savingsRate.toFixed(1)}%`);
      } else if (savingsRate >= 0) {
        totalScore += 10;
        health.concerns.push(`Low savings rate: ${savingsRate.toFixed(1)}%`);
      } else {
        health.concerns.push(`Negative savings rate: ${savingsRate.toFixed(1)}%`);
      }
    }

    // Envelope allocation health
    if (context.envelopes && context.envelopes.length > 0) {
      scoreComponents++;
      const totalBalance = context.envelopes.reduce((sum, env) => sum + env.balance, 0);
      const totalTargets = context.envelopes.reduce((sum, env) => sum + env.target, 0);
      
      const allocationRatio = totalTargets > 0 ? (totalBalance / totalTargets) : 0;
      
      if (allocationRatio >= 0.8 && allocationRatio <= 1.2) {
        totalScore += 25;
        health.strengths.push('Well-balanced envelope allocation');
      } else if (allocationRatio >= 0.6) {
        totalScore += 15;
        health.factors.push('Reasonable envelope allocation');
      } else {
        health.concerns.push('Envelope allocation needs attention');
      }

      // Diversification
      const categoryCount = new Set(context.envelopes.map(env => env.category)).size;
      if (categoryCount >= 5) {
        totalScore += 15;
        health.strengths.push('Good budget diversification');
      } else if (categoryCount >= 3) {
        totalScore += 10;
        health.factors.push('Moderate budget diversification');
      } else {
        health.concerns.push('Limited budget categories');
      }
    }

    // Goal progress
    if (context.goals && context.goals.length > 0) {
      scoreComponents++;
      const goalsOnTrack = context.goals.filter(goal => {
        const progress = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
        return progress >= 0.5; // At least 50% progress
      }).length;

      const goalSuccessRate = (goalsOnTrack / context.goals.length) * 100;
      
      if (goalSuccessRate >= 75) {
        totalScore += 30;
        health.strengths.push(`Excellent goal progress: ${goalSuccessRate.toFixed(0)}% of goals on track`);
      } else if (goalSuccessRate >= 50) {
        totalScore += 20;
        health.factors.push(`Good goal progress: ${goalSuccessRate.toFixed(0)}% of goals on track`);
      } else {
        health.concerns.push(`Goal progress needs improvement: ${goalSuccessRate.toFixed(0)}% of goals on track`);
      }
    }

    health.score = scoreComponents > 0 ? Math.round(totalScore / scoreComponents) : 0;
    return health;
  }

  private analyzeGoalProgress(context: FinancialContext) {
    const progress: any = {
      onTrack: [],
      needsAttention: [],
      overdue: [],
      recommendations: [],
    };

    if (!context.goals || context.goals.length === 0) {
      progress.recommendations.push('Consider setting financial goals to track your progress');
      return progress;
    }

    const now = new Date();

    context.goals.forEach(goal => {
      const progressRatio = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
      const progressPercentage = (progressRatio * 100).toFixed(1);
      
      const remaining = goal.targetAmount - goal.currentAmount;
      const goalInfo = {
        ...goal,
        progressPercentage,
        remaining,
        progressRatio,
      };

      if (goal.deadline) {
        const deadline = new Date(goal.deadline);
        const timeRemaining = deadline.getTime() - now.getTime();
        const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
          progress.overdue.push({ ...goalInfo, daysOverdue: Math.abs(daysRemaining) });
        } else if (progressRatio >= 0.8 || daysRemaining > 90) {
          progress.onTrack.push({ ...goalInfo, daysRemaining });
        } else {
          progress.needsAttention.push({ ...goalInfo, daysRemaining });
        }
      } else {
        if (progressRatio >= 0.5) {
          progress.onTrack.push(goalInfo);
        } else {
          progress.needsAttention.push(goalInfo);
        }
      }
    });

    return progress;
  }

  private generateRecommendations(context: FinancialContext): string[] {
    const recommendations: string[] = [];

    // Budget recommendations
    if (context.envelopes && context.envelopes.length > 0) {
      const emptyEnvelopes = context.envelopes.filter(env => env.balance === 0);
      if (emptyEnvelopes.length > 0) {
        recommendations.push(`Fund ${emptyEnvelopes.length} empty envelope(s) to maintain balanced budgeting`);
      }

      const overallocated = context.envelopes.filter(env => env.target > 0 && env.balance > env.target * 1.2);
      if (overallocated.length > 0) {
        recommendations.push(`Redistribute excess funds from over-allocated envelopes to boost other categories`);
      }
    }

    // Savings recommendations
    if (context.totalIncome !== undefined && context.totalExpenses !== undefined) {
      const savingsRate = context.totalIncome > 0 ? 
        ((context.totalIncome - context.totalExpenses) / context.totalIncome) * 100 : 0;
      
      if (savingsRate < 10) {
        recommendations.push('Aim to save at least 10% of your income for a healthier financial foundation');
      }
      
      if (savingsRate < 0) {
        recommendations.push('Focus on reducing expenses to stop spending more than you earn');
      }
    }

    // Goal recommendations
    if (!context.goals || context.goals.length === 0) {
      recommendations.push('Set specific financial goals to give direction to your budgeting efforts');
    }

    return recommendations;
  }

  private identifyOpportunities(context: FinancialContext): string[] {
    const opportunities: string[] = [];

    // Analyze spending patterns for optimization
    if (context.transactions && context.transactions.length > 0) {
      const categorySpending: Record<string, number> = {};
      
      context.transactions
        .filter(t => t.amount < 0)
        .forEach(transaction => {
          const category = transaction.category || 'uncategorized';
          categorySpending[category] = (categorySpending[category] || 0) + Math.abs(transaction.amount);
        });

      // Find highest spending categories
      const sortedCategories = Object.entries(categorySpending)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      sortedCategories.forEach(([category, amount]) => {
        if (amount > 500) { // If significant spending
          opportunities.push(`Review ${category} spending ($${amount.toFixed(2)}) for potential optimization`);
        }
      });
    }

    // Envelope optimization opportunities
    if (context.envelopes && context.envelopes.length > 0) {
      const wellFundedEnvelopes = context.envelopes.filter(env => 
        env.target > 0 && env.balance > env.target * 1.5
      );

      if (wellFundedEnvelopes.length > 0) {
        opportunities.push('Consider creating new savings goals with excess funds from well-funded envelopes');
      }
    }

    return opportunities;
  }

  private analyzeTrends(context: FinancialContext) {
    const trends: any = {
      spending: 'insufficient_data',
      saving: 'insufficient_data',
      categories: {},
    };

    // This would be enhanced with historical data
    // For now, provide basic analysis based on available data
    
    if (context.transactions && context.transactions.length >= 10) {
      const recentTransactions = context.transactions.slice(0, Math.floor(context.transactions.length / 2));
      const olderTransactions = context.transactions.slice(Math.floor(context.transactions.length / 2));

      const recentExpenses = recentTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const olderExpenses = olderTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      if (recentExpenses > olderExpenses * 1.1) {
        trends.spending = 'increasing';
      } else if (recentExpenses < olderExpenses * 0.9) {
        trends.spending = 'decreasing';
      } else {
        trends.spending = 'stable';
      }
    }

    return trends;
  }

  private identifyWarnings(context: FinancialContext): string[] {
    const warnings: string[] = [];

    // Budget warnings
    if (context.totalIncome !== undefined && context.totalExpenses !== undefined) {
      if (context.totalExpenses > context.totalIncome) {
        warnings.push('⚠️ Spending exceeds income - immediate budget review needed');
      }
    }

    // Envelope warnings
    if (context.envelopes && context.envelopes.length > 0) {
      const emptyCount = context.envelopes.filter(env => env.balance === 0).length;
      const totalCount = context.envelopes.length;
      
      if (emptyCount > totalCount * 0.5) {
        warnings.push(`⚠️ More than half of your envelopes (${emptyCount}/${totalCount}) are empty`);
      }
    }

    // Goal warnings
    if (context.goals && context.goals.length > 0) {
      const now = new Date();
      const overdueGoals = context.goals.filter(goal => {
        if (!goal.deadline) return false;
        return new Date(goal.deadline) < now && goal.currentAmount < goal.targetAmount;
      });

      if (overdueGoals.length > 0) {
        warnings.push(`⚠️ ${overdueGoals.length} financial goal(s) are overdue`);
      }
    }

    return warnings;
  }

  private buildInsightPrompt(message: string, context: FinancialContext, insights: any): string {
    const promptParts: string[] = [message];

    // Financial Health Summary
    promptParts.push('\n**Financial Health Assessment:**');
    promptParts.push(`- Overall Score: ${insights.financialHealth.score}/100`);
    
    if (insights.financialHealth.strengths.length > 0) {
      promptParts.push('\n**Strengths:**');
      insights.financialHealth.strengths.forEach((strength: string) => {
        promptParts.push(`✅ ${strength}`);
      });
    }

    if (insights.financialHealth.concerns.length > 0) {
      promptParts.push('\n**Areas for Improvement:**');
      insights.financialHealth.concerns.forEach((concern: string) => {
        promptParts.push(`📈 ${concern}`);
      });
    }

    // Recommendations
    if (insights.recommendations.length > 0) {
      promptParts.push('\n**Personalized Recommendations:**');
      insights.recommendations.forEach((rec: string) => {
        promptParts.push(`💡 ${rec}`);
      });
    }

    // Opportunities
    if (insights.opportunities.length > 0) {
      promptParts.push('\n**Optimization Opportunities:**');
      insights.opportunities.forEach((opp: string) => {
        promptParts.push(`🎯 ${opp}`);
      });
    }

    // Warnings
    if (insights.warnings.length > 0) {
      promptParts.push('\n**Warnings:**');
      insights.warnings.forEach((warning: string) => {
        promptParts.push(warning);
      });
    }

    // Goal Progress
    if (insights.goalProgress.onTrack.length > 0 || insights.goalProgress.needsAttention.length > 0) {
      promptParts.push('\n**Goal Progress:**');
      
      insights.goalProgress.onTrack.forEach((goal: any) => {
        promptParts.push(`✅ ${goal.description}: ${goal.progressPercentage}% complete`);
      });
      
      insights.goalProgress.needsAttention.forEach((goal: any) => {
        promptParts.push(`⚠️ ${goal.description}: ${goal.progressPercentage}% complete - needs attention`);
      });
    }

    return promptParts.join('\n');
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getCapabilities(): string[] {
    return [
      'financial_health_assessment',
      'goal_progress_tracking',
      'personalized_recommendations',
      'trend_analysis',
      'opportunity_identification'
    ];
  }
}
