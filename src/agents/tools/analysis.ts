
import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from '../core/ToolRegistry.js';

const spendingAnalysisSchema = z.object({
  userId: z.string(),
  timeframe: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
  category: z.string().optional(),
});

const budgetVarianceSchema = z.object({
  userId: z.string(),
  period: z.enum(['current_month', 'last_month', 'quarter']).default('current_month'),
});

export const analyzeSpendingTool = tool({
  name: 'analyze_spending_patterns',
  description: 'Analyze spending patterns and identify trends',
  parameters: spendingAnalysisSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Analyzing spending patterns');

      const daysMap = { week: 7, month: 30, quarter: 90, year: 365 };
      const days = daysMap[params.timeframe];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const transactions = await db.transaction.findMany({
        where: {
          userId: params.userId,
          amount: { lt: 0 }, // Only expenses
          createdAt: { gte: startDate },
          ...(params.category && { category: params.category })
        },
        orderBy: { createdAt: 'desc' }
      });

      if (transactions.length === 0) {
        return JSON.stringify({
          success: true,
          message: 'No spending transactions found for the specified period',
          totalSpent: 0,
          transactionCount: 0
        });
      }

      const totalSpent = Math.abs(transactions.reduce((sum, tx) => sum + tx.amount, 0));
      const averagePerTransaction = totalSpent / transactions.length;
      const dailyAverage = totalSpent / days;

      // Category breakdown
      const categoryBreakdown = transactions.reduce((acc, tx) => {
        const category = tx.category || 'Other';
        acc[category] = (acc[category] || 0) + Math.abs(tx.amount);
        return acc;
      }, {} as Record<string, number>);

      const topCategory = Object.entries(categoryBreakdown)
        .sort(([,a], [,b]) => b - a)[0];

      // Spending trends (weekly comparison)
      const weeklySpending = [];
      for (let i = 0; i < Math.min(4, Math.floor(days / 7)); i++) {
        const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
        
        const weekTransactions = transactions.filter(tx => 
          tx.createdAt >= weekStart && tx.createdAt < weekEnd
        );
        const weekTotal = Math.abs(weekTransactions.reduce((sum, tx) => sum + tx.amount, 0));
        weeklySpending.push(weekTotal);
      }

      const trend = weeklySpending.length > 1 ? 
        (weeklySpending[0] > weeklySpending[1] ? 'increasing' : 'decreasing') : 'stable';

      return JSON.stringify({
        success: true,
        timeframe: params.timeframe,
        totalSpent,
        transactionCount: transactions.length,
        averagePerTransaction: Math.round(averagePerTransaction * 100) / 100,
        dailyAverage: Math.round(dailyAverage * 100) / 100,
        categoryBreakdown,
        topSpendingCategory: topCategory ? {
          name: topCategory[0],
          amount: topCategory[1],
          percentage: Math.round((topCategory[1] / totalSpent) * 100)
        } : null,
        trend,
        weeklySpending: weeklySpending.reverse(),
        insights: [
          `You spent $${totalSpent.toFixed(2)} over the last ${params.timeframe}`,
          `Your top spending category is ${topCategory?.[0]} at $${topCategory?.[1].toFixed(2)}`,
          `Your spending trend is ${trend}`,
          `You average $${dailyAverage.toFixed(2)} per day`
        ]
      });

    } catch (error: any) {
      logger.error({ error, params }, 'Spending analysis failed');
      return JSON.stringify({
        success: false,
        error: 'Failed to analyze spending patterns',
        details: error.message
      });
    }
  }
});

export const budgetVarianceTool = tool({
  name: 'budget_variance_analysis',
  description: 'Compare actual spending against budgeted amounts',
  parameters: budgetVarianceSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Analyzing budget variance');

      const envelopes = await db.envelope.findMany({
        where: { userId: params.userId },
        include: {
          transactions: {
            where: {
              createdAt: {
                gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
              }
            }
          }
        }
      });

      const variances = envelopes.map(envelope => {
        const actualSpent = Math.abs(envelope.transactions.reduce((sum, tx) => sum + tx.amount, 0));
        const budgeted = envelope.budgetAmount;
        const variance = budgeted - actualSpent;
        const variancePercentage = budgeted > 0 ? (variance / budgeted) * 100 : 0;

        return {
          category: envelope.name,
          budgeted,
          actualSpent,
          variance,
          variancePercentage: Math.round(variancePercentage),
          status: variance < 0 ? 'over_budget' : variance < budgeted * 0.2 ? 'near_limit' : 'on_track'
        };
      });

      const totalBudgeted = variances.reduce((sum, v) => sum + v.budgeted, 0);
      const totalSpent = variances.reduce((sum, v) => sum + v.actualSpent, 0);
      const overallVariance = totalBudgeted - totalSpent;

      return JSON.stringify({
        success: true,
        period: params.period,
        overallSummary: {
          totalBudgeted,
          totalSpent,
          overallVariance,
          overallVariancePercentage: Math.round((overallVariance / totalBudgeted) * 100)
        },
        categoryVariances: variances,
        recommendations: variances
          .filter(v => v.status === 'over_budget')
          .map(v => `Consider reducing spending in ${v.category} - you're ${Math.abs(v.variancePercentage)}% over budget`)
      });

    } catch (error: any) {
      logger.error({ error, params }, 'Budget variance analysis failed');
      return JSON.stringify({
        success: false,
        error: 'Failed to analyze budget variance',
        details: error.message
      });
    }
  }
});

export function registerAnalysisTools(registry: any): void {
  registry.registerTool(analyzeSpendingTool);
  registry.registerTool(budgetVarianceTool);
  logger.info('Financial analysis tools registered');
}
