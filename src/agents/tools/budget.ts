
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toolRegistry } from "./registry.js";
import { 
  BudgetAnalysisParamsSchema, 
  ToolContext, 
  ToolResult,
  TOOL_CATEGORIES 
} from "./types.js";

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

// Register budget tools
toolRegistry.registerTool({
  name: "budget_analysis",
  description: "Analyze budget performance, variances, and utilization across envelopes for specified time periods",
  category: TOOL_CATEGORIES.BUDGET,
  parameters: BudgetAnalysisParamsSchema,
  execute: budgetAnalysisExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 2000
});

toolRegistry.registerTool({
  name: "spending_patterns",
  description: "Analyze user spending patterns by day, category, merchant, and time to identify trends and insights",
  category: TOOL_CATEGORIES.BUDGET,
  parameters: BudgetAnalysisParamsSchema,
  execute: spendingPatternsExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 1500
});

export { budgetAnalysisExecute, spendingPatternsExecute };
