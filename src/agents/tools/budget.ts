import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toolRegistry } from "./registry.js";
import { 
  BudgetAnalysisParamsSchema, 
  ToolContext, 
  ToolResult,
  TOOL_CATEGORIES 
} from "./types.js";
import { tool } from '@openai/agents';
import { z } from 'zod';


// Budget Analysis Tool
const budgetAnalysisExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = BudgetAnalysisParamsSchema.parse(params);
    const { userId, timeRange, startDate, endDate, envelopeIds, includeProjections } = validatedParams;

    logger.info({ userId, timeRange }, "Executing budget analysis");

    // Calculate date range
    const now = new Date();
    let dateFrom: Date;
    let dateTo: Date = now;

    switch (timeRange) {
      case 'current_month':
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        dateTo = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last_3_months':
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case 'last_6_months':
        dateFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        break;
      case 'custom':
        if (!startDate || !endDate) {
          throw new Error("Custom date range requires startDate and endDate");
        }
        dateFrom = new Date(startDate);
        dateTo = new Date(endDate);
        break;
      default:
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Get user's envelopes
    const envelopesQuery = await db.envelope.findMany({
      where: {
        userId,
        ...(envelopeIds ? { id: { in: envelopeIds } } : {})
      },
      include: {
        transactions: {
          where: {
            createdAt: {
              gte: dateFrom,
              lte: dateTo
            }
          }
        }
      }
    });

    // Calculate budget analysis
    const analysis = envelopesQuery.map(envelope => {
      const totalSpent = envelope.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const budgetAmount = envelope.targetAmount || 0;
      const variance = budgetAmount - totalSpent;
      const utilizationRate = budgetAmount > 0 ? (totalSpent / budgetAmount) * 100 : 0;

      return {
        envelopeId: envelope.id,
        envelopeName: envelope.name,
        budgetAmount: budgetAmount / 100, // Convert to dollars
        totalSpent: totalSpent / 100,
        variance: variance / 100,
        utilizationRate: Math.round(utilizationRate),
        status: variance >= 0 ? 'under_budget' : 'over_budget',
        transactionCount: envelope.transactions.length
      };
    });

    // Calculate overall summary
    const totalBudget = analysis.reduce((sum, a) => sum + a.budgetAmount, 0);
    const totalSpent = analysis.reduce((sum, a) => sum + a.totalSpent, 0);
    const overBudgetCount = analysis.filter(a => a.status === 'over_budget').length;

    const summary = {
      totalBudget,
      totalSpent,
      totalVariance: totalBudget - totalSpent,
      overallUtilization: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
      envelopesOverBudget: overBudgetCount,
      totalEnvelopes: analysis.length,
      analysisDate: now.toISOString(),
      timeRange: `${dateFrom.toISOString().split('T')[0]} to ${dateTo.toISOString().split('T')[0]}`
    };

    // Add projections if requested
    let projections = null;
    if (includeProjections && totalSpent > 0) {
      const daysInPeriod = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24));
      const dailySpendRate = totalSpent / daysInPeriod;
      const daysLeftInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

      projections = {
        projectedMonthlySpend: totalSpent + (dailySpendRate * daysLeftInMonth),
        dailySpendRate,
        daysLeftInMonth,
        isOnTrack: (totalSpent + (dailySpendRate * daysLeftInMonth)) <= totalBudget
      };
    }

    return {
      success: true,
      data: {
        summary,
        envelopeAnalysis: analysis,
        projections,
        metadata: {
          analysisType: 'budget_analysis',
          timeRange,
          includeProjections
        }
      },
      message: `Budget analysis completed for ${analysis.length} envelopes`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Budget analysis failed");
    return {
      success: false,
      error: `Budget analysis failed: ${error.message}`
    };
  }
};

// Spending Patterns Tool
const spendingPatternsExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = BudgetAnalysisParamsSchema.parse(params);
    const { userId, timeRange } = validatedParams;

    logger.info({ userId, timeRange }, "Analyzing spending patterns");

    // Get transactions for analysis
    const transactions = await db.transaction.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)) // Last 30 days
        }
      },
      include: {
        envelope: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Analyze spending patterns
    const patterns = {
      dailySpending: {},
      categorySpending: {},
      merchantSpending: {},
      timeOfDaySpending: { morning: 0, afternoon: 0, evening: 0, night: 0 }
    };

    transactions.forEach(transaction => {
      const amount = Math.abs(transaction.amount) / 100;
      const date = transaction.createdAt.toISOString().split('T')[0];
      const hour = transaction.createdAt.getHours();
      const category = transaction.envelope?.name || 'Uncategorized';

      // Daily spending
      patterns.dailySpending[date] = (patterns.dailySpending[date] || 0) + amount;

      // Category spending
      patterns.categorySpending[category] = (patterns.categorySpending[category] || 0) + amount;

      // Time of day analysis
      if (hour >= 6 && hour < 12) patterns.timeOfDaySpending.morning += amount;
      else if (hour >= 12 && hour < 18) patterns.timeOfDaySpending.afternoon += amount;
      else if (hour >= 18 && hour < 22) patterns.timeOfDaySpending.evening += amount;
      else patterns.timeOfDaySpending.night += amount;
    });

    // Find highest spending day and category
    const highestSpendingDay = Object.entries(patterns.dailySpending)
      .sort(([,a], [,b]) => b - a)[0];

    const highestSpendingCategory = Object.entries(patterns.categorySpending)
      .sort(([,a], [,b]) => b - a)[0];

    const insights = [
      `Highest spending day: ${highestSpendingDay?.[0]} ($${highestSpendingDay?.[1]?.toFixed(2) || '0.00'})`,
      `Top spending category: ${highestSpendingCategory?.[0]} ($${highestSpendingCategory?.[1]?.toFixed(2) || '0.00'})`,
      `Most active spending time: ${Object.entries(patterns.timeOfDaySpending)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown'}`
    ];

    return {
      success: true,
      data: {
        patterns,
        insights,
        totalTransactions: transactions.length,
        analysisDate: new Date().toISOString()
      },
      message: `Spending patterns analyzed for ${transactions.length} transactions`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Spending patterns analysis failed");
    return {
      success: false,
      error: `Spending patterns analysis failed: ${error.message}`
    };
  }
};

// Export tools for registration
export const budgetTools = [
  {
    name: "budget_analysis",
    description: "Analyze budget performance and provide insights on spending patterns",
    category: "budget",
    riskLevel: "low" as const,
    estimatedDuration: 2000,
    tool: budgetAnalysisTool,
  },
  {
    name: "spending_patterns",
    description: "Analyze historical spending patterns and identify trends",
    category: "budget" as const, 
    riskLevel: "low" as const,
    estimatedDuration: 1500,
    tool: spendingPatternsTool,
  },
  {
    name: "variance_calculation",
    description: "Calculate budget variance and identify over/under spending",
    category: "budget" as const,
    riskLevel: "low" as const, 
    estimatedDuration: 1000,
    tool: varianceCalculationTool,
  }
];

// Register tools when this module is imported
import { toolRegistry } from './registry.js';
budgetTools.forEach(toolDef => toolRegistry.registerTool(toolDef));

// Budget analysis tool using OpenAI Agents SDK pattern
export const budgetAnalysisTool = tool({
  name: 'budget_analysis',
  description: `Analyze budget performance and spending patterns. 
  Provides variance analysis, category breakdowns, and actionable recommendations.
  Use this when users want to understand their budget performance or need spending insights.`,
  parameters: BudgetAnalysisParamsSchema,
}, async (params, context) => {
  try {
    logger.info({ 
      userId: params.userId, 
      timeRange: params.timeRange 
    }, "Executing budget analysis");

    // TODO: Implement actual budget analysis logic
    // This would integrate with your Prisma database
    const analysisResult = {
      totalBudget: 5000,
      totalSpent: 3200,
      variance: 1800,
      categoryBreakdown: [
        { category: "Food", budgeted: 800, spent: 750, variance: 50 },
        { category: "Transportation", budgeted: 300, spent: 280, variance: 20 },
        { category: "Entertainment", budgeted: 200, spent: 250, variance: -50 }
      ],
      recommendations: [
        "You're under budget in Food category - great job!",
        "Consider reducing Entertainment spending by $50 next month"
      ]
    };

    return JSON.stringify({
      success: true,
      data: analysisResult,
      message: `Budget analysis completed for ${params.timeRange}`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message, 
      userId: params.userId 
    }, "Budget analysis failed");

    return JSON.stringify({
      success: false,
      error: error.message,
      message: "Failed to complete budget analysis",
      timestamp: new Date().toISOString()
    });
  }
});

// Spending patterns analysis tool
export const spendingPatternsTool = tool({
  name: 'spending_patterns',
  description: 'Analyze spending patterns and trends over time. Identifies recurring expenses, seasonal variations, and unusual spending behavior.',
  parameters: z.object({
    userId: z.string(),
    timeRange: z.enum(['last_30_days', 'last_90_days', 'last_6_months', 'last_year']).default('last_30_days'),
    categories: z.array(z.string()).optional(),
  }),
}, async (params, context) => {
  try {
    logger.info({ userId: params.userId }, "Analyzing spending patterns");

    // TODO: Implement actual spending patterns analysis
    const patternsResult = {
      recurringExpenses: [
        { merchant: "Netflix", amount: 15.99, frequency: "monthly" },
        { merchant: "Grocery Store", amount: 120, frequency: "weekly" }
      ],
      seasonalTrends: {
        holiday_spending: { increase: "25%", period: "December" },
        summer_activities: { increase: "15%", period: "June-August" }
      },
      anomalies: [
        { date: "2024-01-15", amount: 500, description: "Unusual restaurant spending" }
      ],
      insights: [
        "Your grocery spending is very consistent week-to-week",
        "Consider reviewing subscription services - you have 5 active subscriptions"
      ]
    };

    return JSON.stringify({
      success: true,
      data: patternsResult,
      message: "Spending patterns analysis completed",
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Spending patterns analysis failed");

    return JSON.stringify({
      success: false,
      error: error.message,
      message: "Failed to analyze spending patterns",
      timestamp: new Date().toISOString()
    });
  }
});

// Budget variance calculation tool
export const varianceCalculationTool = tool({
  name: 'variance_calculation',
  description: 'Calculate detailed budget vs actual spending variances with forecasting capabilities.',
  parameters: z.object({
    userId: z.string(),
    envelopeIds: z.array(z.string()).optional(),
    includeForecasting: z.boolean().default(false),
  }),
}, async (params, context) => {
  try {
    logger.info({ userId: params.userId }, "Calculating budget variance");

    // TODO: Implement actual variance calculation
    const varianceResult = {
      overallVariance: {
        budgeted: 5000,
        actual: 3200,
        variance: 1800,
        variancePercentage: 36
      },
      categoryVariances: [
        { category: "Food", budgeted: 800, actual: 750, variance: 50, status: "under_budget" },
        { category: "Transportation", budgeted: 300, actual: 280, variance: 20, status: "under_budget" },
        { category: "Entertainment", budgeted: 200, actual: 250, variance: -50, status: "over_budget" }
      ],
      forecast: params.includeForecasting ? {
        projectedMonthEnd: 4200,
        recommendedAdjustments: [
          "Increase Entertainment budget by $50",
          "Consider reallocating unused Food budget"
        ]
      } : null
    };

    return JSON.stringify({
      success: true,
      data: varianceResult,
      message: "Budget variance calculation completed",
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Variance calculation failed");

    return JSON.stringify({
      success: false,
      error: error.message,
      message: "Failed to calculate budget variance",
      timestamp: new Date().toISOString()
    });
  }
});

export { budgetAnalysisExecute, spendingPatternsExecute };