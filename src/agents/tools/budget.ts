import { z } from 'zod';
import { defineTool, toolRegistry } from '@openai/agents';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext, FinancialContext } from './types.js';

// Zod schemas for validation
const BudgetAnalysisInputSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  timeframe: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).default('monthly'),
  categories: z.array(z.string()).optional(),
  includeProjections: z.boolean().default(false),
});

const SpendingPatternsInputSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  timeframe: z.enum(['daily', 'weekly', 'monthly']).default('monthly'),
  lookbackPeriod: z.number().min(1).max(12).default(3),
  categories: z.array(z.string()).optional(),
});

const VarianceCalculationInputSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  budgetPeriod: z.enum(['current', 'previous', 'custom']).default('current'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Define tools using OpenAI SDK pattern
export const budgetAnalysisTool = defineTool({
  name: 'budget_analysis',
  description: 'Analyzes user budget performance, spending patterns, and provides detailed financial insights',
  parameters: BudgetAnalysisInputSchema,
  execute: async (input, context: ToolExecutionContext & FinancialContext) => {
    try {
      const { userId, timeframe, categories, includeProjections } = input;

      logger.info({ userId, timeframe }, 'Executing budget analysis');

      // Calculate date range based on timeframe
      const endDate = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case 'weekly':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'monthly':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'quarterly':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case 'yearly':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      // Get transactions for the period
      const transactions = await db.transaction.findMany({
        where: {
          userId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          ...(categories && categories.length > 0 ? {
            category: {
              in: categories,
            },
          } : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Get user's envelopes for budget comparison
      const envelopes = await db.envelope.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          balance: true,
          targetAmount: true,
          category: true,
        },
      });

      // Calculate spending by category
      const spendingByCategory: Record<string, number> = {};
      const incomeByCategory: Record<string, number> = {};

      transactions.forEach(transaction => {
        const category = transaction.category || 'uncategorized';
        if (transaction.amount < 0) {
          spendingByCategory[category] = (spendingByCategory[category] || 0) + Math.abs(transaction.amount);
        } else {
          incomeByCategory[category] = (incomeByCategory[category] || 0) + transaction.amount;
        }
      });

      // Calculate budget variance
      const budgetVariance: Record<string, { budgeted: number; spent: number; variance: number; percentUsed: number }> = {};

      envelopes.forEach(envelope => {
        const category = envelope.category || 'general';
        const spent = spendingByCategory[category] || 0;
        const budgeted = envelope.targetAmount || 0;
        const variance = budgeted - spent;
        const percentUsed = budgeted > 0 ? (spent / budgeted) * 100 : 0;

        budgetVariance[category] = {
          budgeted,
          spent,
          variance,
          percentUsed,
        };
      });

      // Calculate totals
      const totalSpent = Object.values(spendingByCategory).reduce((sum, amount) => sum + amount, 0);
      const totalIncome = Object.values(incomeByCategory).reduce((sum, amount) => sum + amount, 0);
      const totalBudgeted = envelopes.reduce((sum, env) => sum + (env.targetAmount || 0), 0);
      const netFlow = totalIncome - totalSpent;

      // Generate insights
      const insights: string[] = [];

      // Budget adherence insights
      const overBudgetCategories = Object.entries(budgetVariance)
        .filter(([_, data]) => data.variance < 0)
        .map(([category, data]) => ({ category, overspent: Math.abs(data.variance) }));

      if (overBudgetCategories.length > 0) {
        insights.push(`You've exceeded budget in ${overBudgetCategories.length} categories`);
        overBudgetCategories.forEach(({ category, overspent }) => {
          insights.push(`${category}: $${overspent.toFixed(2)} over budget`);
        });
      }

      // Savings insights
      if (netFlow > 0) {
        insights.push(`Positive net flow of $${netFlow.toFixed(2)} this ${timeframe}`);
      } else if (netFlow < 0) {
        insights.push(`Negative net flow of $${Math.abs(netFlow).toFixed(2)} this ${timeframe}`);
      }

      // Top spending categories
      const topSpendingCategories = Object.entries(spendingByCategory)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3);

      if (topSpendingCategories.length > 0) {
        insights.push(`Top spending categories: ${topSpendingCategories.map(([cat, amount]) => `${cat} ($${amount.toFixed(2)})`).join(', ')}`);
      }

      const result = {
        period: {
          timeframe,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        summary: {
          totalSpent,
          totalIncome,
          totalBudgeted,
          netFlow,
          budgetUtilization: totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0,
        },
        spendingByCategory,
        incomeByCategory,
        budgetVariance,
        insights,
        recommendations: generateBudgetRecommendations(budgetVariance, insights),
        ...(includeProjections && {
          projections: generateBudgetProjections(transactions, timeframe),
        }),
      };

      return result;

    } catch (error: any) {
      logger.error({ error, input }, 'Budget analysis failed');
      throw new Error(`Budget analysis failed: ${error.message}`);
    }
  },
});

// Register the tool when this module is imported
toolRegistry.registerTool('budget_analysis', budgetAnalysisTool);


export const spendingPatternsTool = defineTool({
  name: 'spending_patterns',
  description: 'Analyzes spending patterns and trends over time to identify recurring expenses and habits',
  parameters: SpendingPatternsInputSchema,
  execute: async (input, context: ToolExecutionContext & FinancialContext) => {
    try {
      const { userId, timeframe, lookbackPeriod, categories } = input;

      logger.info({ userId, timeframe, lookbackPeriod }, 'Analyzing spending patterns');

      // Calculate lookback period
      const endDate = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case 'daily':
          startDate.setDate(startDate.getDate() - (lookbackPeriod * 7)); // weeks worth of days
          break;
        case 'weekly':
          startDate.setDate(startDate.getDate() - (lookbackPeriod * 7));
          break;
        case 'monthly':
          startDate.setMonth(startDate.getMonth() - lookbackPeriod);
          break;
      }

      const transactions = await db.transaction.findMany({
        where: {
          userId,
          amount: { lt: 0 }, // Only expenses
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          ...(categories && categories.length > 0 ? {
            category: { in: categories },
          } : {}),
        },
        orderBy: { createdAt: 'asc' },
      });

      // Analyze patterns by timeframe
      const patterns: Record<string, number[]> = {};
      const categoryTrends: Record<string, { amounts: number[]; dates: string[] }> = {};

      transactions.forEach(transaction => {
        const category = transaction.category || 'uncategorized';
        const amount = Math.abs(transaction.amount);
        const date = transaction.createdAt.toISOString().split('T')[0];

        if (!categoryTrends[category]) {
          categoryTrends[category] = { amounts: [], dates: [] };
        }

        categoryTrends[category].amounts.push(amount);
        categoryTrends[category].dates.push(date);
      });

      // Calculate trends and insights
      const insights: string[] = [];
      const trendAnalysis: Record<string, { trend: 'increasing' | 'decreasing' | 'stable'; changePercent: number }> = {};

      Object.entries(categoryTrends).forEach(([category, data]) => {
        if (data.amounts.length >= 2) {
          const firstHalf = data.amounts.slice(0, Math.floor(data.amounts.length / 2));
          const secondHalf = data.amounts.slice(Math.floor(data.amounts.length / 2));

          const firstAvg = firstHalf.reduce((sum, amt) => sum + amt, 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((sum, amt) => sum + amt, 0) / secondHalf.length;

          const changePercent = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

          let trend: 'increasing' | 'decreasing' | 'stable';
          if (Math.abs(changePercent) < 5) {
            trend = 'stable';
          } else if (changePercent > 0) {
            trend = 'increasing';
          } else {
            trend = 'decreasing';
          }

          trendAnalysis[category] = { trend, changePercent };

          if (Math.abs(changePercent) >= 10) {
            insights.push(`${category} spending is ${trend} by ${Math.abs(changePercent).toFixed(1)}%`);
          }
        }
      });

      return {
        period: {
          timeframe,
          lookbackPeriod,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        categoryTrends,
        trendAnalysis,
        insights,
        recommendations: generatePatternRecommendations(trendAnalysis, insights),
      };

    } catch (error: any) {
      logger.error({ error, input }, 'Spending patterns analysis failed');
      throw new Error(`Spending patterns analysis failed: ${error.message}`);
    }
  },
});

// Register the tool when this module is imported
toolRegistry.registerTool('spending_patterns', spendingPatternsTool);


export const varianceCalculationTool = defineTool({
  name: 'variance_calculation',
  description: 'Calculates budget variance and identifies areas of over/under spending',
  parameters: VarianceCalculationInputSchema,
  execute: async (input, context: ToolExecutionContext & FinancialContext) => {
    try {
      const { userId, budgetPeriod, startDate, endDate } = input;

      logger.info({ userId, budgetPeriod }, 'Calculating budget variance');

      // Calculate period dates
      let periodStart: Date;
      let periodEnd: Date;

      if (budgetPeriod === 'custom' && startDate && endDate) {
        periodStart = new Date(startDate);
        periodEnd = new Date(endDate);
      } else {
        periodEnd = new Date();
        periodStart = new Date();

        if (budgetPeriod === 'current') {
          periodStart.setDate(1); // Start of current month
        } else if (budgetPeriod === 'previous') {
          periodStart.setMonth(periodStart.getMonth() - 1);
          periodStart.setDate(1);
          periodEnd.setDate(0); // Last day of previous month
        }
      }

      // Get budget data (envelopes) and actual spending
      const [envelopes, transactions] = await Promise.all([
        db.envelope.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            targetAmount: true,
            category: true,
          },
        }),
        db.transaction.findMany({
          where: {
            userId,
            createdAt: {
              gte: periodStart,
              lte: periodEnd,
            },
            amount: { lt: 0 }, // Only expenses
          },
        }),
      ]);

      // Calculate variance by category
      const varianceAnalysis: Record<string, {
        budgeted: number;
        actual: number;
        variance: number;
        percentageVariance: number;
        status: 'over' | 'under' | 'on-track';
      }> = {};

      // Group actual spending by category
      const actualSpending: Record<string, number> = {};
      transactions.forEach(transaction => {
        const category = transaction.category || 'uncategorized';
        actualSpending[category] = (actualSpending[category] || 0) + Math.abs(transaction.amount);
      });

      // Calculate variance for each envelope/category
      envelopes.forEach(envelope => {
        const category = envelope.category || 'general';
        const budgeted = envelope.targetAmount || 0;
        const actual = actualSpending[category] || 0;
        const variance = budgeted - actual;
        const percentageVariance = budgeted > 0 ? (variance / budgeted) * 100 : 0;

        let status: 'over' | 'under' | 'on-track';
        if (Math.abs(percentageVariance) <= 5) {
          status = 'on-track';
        } else if (percentageVariance < 0) {
          status = 'over';
        } else {
          status = 'under';
        }

        varianceAnalysis[category] = {
          budgeted,
          actual,
          variance,
          percentageVariance,
          status,
        };
      });

      // Add categories with spending but no budget
      Object.entries(actualSpending).forEach(([category, actual]) => {
        if (!varianceAnalysis[category]) {
          varianceAnalysis[category] = {
            budgeted: 0,
            actual,
            variance: -actual,
            percentageVariance: -100,
            status: 'over',
          };
        }
      });

      // Generate summary
      const totalBudgeted = Object.values(varianceAnalysis).reduce((sum, item) => sum + item.budgeted, 0);
      const totalActual = Object.values(varianceAnalysis).reduce((sum, item) => sum + item.actual, 0);
      const totalVariance = totalBudgeted - totalActual;
      const overBudgetCount = Object.values(varianceAnalysis).filter(item => item.status === 'over').length;
      const underBudgetCount = Object.values(varianceAnalysis).filter(item => item.status === 'under').length;

      return {
        period: {
          budgetPeriod,
          startDate: periodStart.toISOString(),
          endDate: periodEnd.toISOString(),
        },
        summary: {
          totalBudgeted,
          totalActual,
          totalVariance,
          overallPercentageVariance: totalBudgeted > 0 ? (totalVariance / totalBudgeted) * 100 : 0,
          categoriesOverBudget: overBudgetCount,
          categoriesUnderBudget: underBudgetCount,
        },
        varianceAnalysis,
        recommendations: generateVarianceRecommendations(varianceAnalysis),
      };

    } catch (error: any) {
      logger.error({ error, input }, 'Variance calculation failed');
      throw new Error(`Variance calculation failed: ${error.message}`);
    }
  },
});

// Register the tool when this module is imported
toolRegistry.registerTool('variance_calculation', varianceCalculationTool);

// Helper functions
function generateBudgetRecommendations(budgetVariance: any, insights: string[]): string[] {
  const recommendations: string[] = [];

  const overBudgetCategories = Object.entries(budgetVariance)
    .filter(([_, data]: [string, any]) => data.variance < 0);

  if (overBudgetCategories.length > 0) {
    recommendations.push('Consider reviewing spending in over-budget categories');
    recommendations.push('Look for opportunities to reduce discretionary spending');
  }

  if (insights.some(insight => insight.includes('Positive net flow'))) {
    recommendations.push('Great job maintaining positive cash flow! Consider increasing savings goals');
  }

  return recommendations;
}

function generateBudgetProjections(transactions: any[], timeframe: string): any {
  // Simple projection based on current trends
  const totalSpent = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const projectionMultiplier = timeframe === 'weekly' ? 4 : timeframe === 'monthly' ? 12 : 1;

  return {
    projectedAnnualSpending: totalSpent * projectionMultiplier,
    confidence: 'medium',
  };
}

function generatePatternRecommendations(trendAnalysis: any, insights: string[]): string[] {
  const recommendations: string[] = [];

  Object.entries(trendAnalysis).forEach(([category, data]: [string, any]) => {
    if (data.trend === 'increasing' && Math.abs(data.changePercent) >= 15) {
      recommendations.push(`Monitor ${category} spending - showing significant increase`);
    }
  });

  return recommendations;
}

function generateVarianceRecommendations(varianceAnalysis: any): string[] {
  const recommendations: string[] = [];

  const significantOverages = Object.entries(varianceAnalysis)
    .filter(([_, data]: [string, any]) => data.status === 'over' && Math.abs(data.percentageVariance) >= 20);

  if (significantOverages.length > 0) {
    recommendations.push('Review budget allocations for categories with significant overages');
    significantOverages.forEach(([category, _]) => {
      recommendations.push(`Consider increasing budget or reducing spending in ${category}`);
    });
  }

  return recommendations;
}

// Export tool instances for registration
export const budgetAnalysis = budgetAnalysisTool;
export const spendingPatterns = spendingPatternsTool;
export const varianceCalculation = varianceCalculationTool;