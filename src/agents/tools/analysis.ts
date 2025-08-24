
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toolRegistry } from "./registry.js";
import { 
  AnalysisParamsSchema, 
  ToolContext, 
  ToolResult,
  TOOL_CATEGORIES 
} from "./types.js";

// Trend Analysis Tool
const trendAnalysisExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = AnalysisParamsSchema.parse(params);
    const { userId, timeRange, includeForecasting } = validatedParams;

    logger.info({ userId, timeRange, includeForecasting }, "Executing trend analysis");

    // Calculate date ranges for comparison
    const now = new Date();
    let currentPeriodStart: Date;
    let previousPeriodStart: Date;
    let previousPeriodEnd: Date;

    switch (timeRange) {
      case 'current_month':
        currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last_month':
        currentPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        previousPeriodEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
        break;
      case 'last_3_months':
        currentPeriodStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        previousPeriodEnd = new Date(now.getFullYear(), now.getMonth() - 3, 0);
        break;
      default:
        currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    // Get transactions for both periods
    const [currentTransactions, previousTransactions] = await Promise.all([
      db.transaction.findMany({
        where: {
          userId,
          createdAt: {
            gte: currentPeriodStart,
            lte: now
          }
        },
        include: { envelope: true }
      }),
      db.transaction.findMany({
        where: {
          userId,
          createdAt: {
            gte: previousPeriodStart,
            lte: previousPeriodEnd
          }
        },
        include: { envelope: true }
      })
    ]);

    // Calculate spending by category for both periods
    const currentSpending = {};
    const previousSpending = {};

    currentTransactions.forEach(t => {
      const category = t.envelope?.name || 'Uncategorized';
      const amount = Math.abs(t.amount);
      currentSpending[category] = (currentSpending[category] || 0) + amount;
    });

    previousTransactions.forEach(t => {
      const category = t.envelope?.name || 'Uncategorized';
      const amount = Math.abs(t.amount);
      previousSpending[category] = (previousSpending[category] || 0) + amount;
    });

    // Calculate trends
    const trends = [];
    const allCategories = new Set([...Object.keys(currentSpending), ...Object.keys(previousSpending)]);

    allCategories.forEach(category => {
      const current = (currentSpending[category] || 0) / 100;
      const previous = (previousSpending[category] || 0) / 100;
      
      let changePercent = 0;
      let changeDirection = 'stable';
      
      if (previous > 0) {
        changePercent = ((current - previous) / previous) * 100;
        changeDirection = changePercent > 5 ? 'increasing' : changePercent < -5 ? 'decreasing' : 'stable';
      } else if (current > 0) {
        changeDirection = 'new_category';
      }

      trends.push({
        category,
        currentAmount: current,
        previousAmount: previous,
        changeAmount: current - previous,
        changePercent: Math.round(changePercent),
        direction: changeDirection,
        significance: Math.abs(changePercent) > 20 ? 'high' : Math.abs(changePercent) > 10 ? 'medium' : 'low'
      });
    });

    // Sort by significance
    trends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    // Generate forecasting if requested
    let forecasting = null;
    if (includeForecasting) {
      const totalCurrent = Object.values(currentSpending).reduce((sum: number, amt: number) => sum + amt, 0) / 100;
      const totalPrevious = Object.values(previousSpending).reduce((sum: number, amt: number) => sum + amt, 0) / 100;
      
      const monthlyGrowthRate = totalPrevious > 0 ? (totalCurrent - totalPrevious) / totalPrevious : 0;
      
      forecasting = {
        nextMonthProjection: totalCurrent * (1 + monthlyGrowthRate),
        quarterProjection: totalCurrent * 3 * (1 + monthlyGrowthRate),
        growthRate: Math.round(monthlyGrowthRate * 100),
        confidence: totalPrevious > 0 ? 'medium' : 'low'
      };
    }

    return {
      success: true,
      data: {
        trends,
        forecasting,
        summary: {
          totalCurrentSpending: Object.values(currentSpending).reduce((sum: number, amt: number) => sum + amt, 0) / 100,
          totalPreviousSpending: Object.values(previousSpending).reduce((sum: number, amt: number) => sum + amt, 0) / 100,
          categoriesAnalyzed: trends.length,
          significantChanges: trends.filter(t => t.significance !== 'low').length
        },
        periodComparison: {
          current: {
            start: currentPeriodStart.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0]
          },
          previous: {
            start: previousPeriodStart.toISOString().split('T')[0],
            end: previousPeriodEnd.toISOString().split('T')[0]
          }
        }
      },
      message: `Trend analysis completed for ${trends.length} categories with ${trends.filter(t => t.significance !== 'low').length} significant changes`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Trend analysis failed");
    return {
      success: false,
      error: `Trend analysis failed: ${error.message}`
    };
  }
};

// Predictive Modeling Tool
const predictiveModelingExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = AnalysisParamsSchema.parse(params);
    const { userId, timeRange } = validatedParams;

    logger.info({ userId, timeRange }, "Executing predictive modeling");

    // Get historical transaction data
    const transactions = await db.transaction.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - (180 * 24 * 60 * 60 * 1000)) // Last 6 months
        }
      },
      include: { envelope: true },
      orderBy: { createdAt: 'asc' }
    });

    // Group transactions by month
    const monthlyData = {};
    transactions.forEach(transaction => {
      const monthKey = transaction.createdAt.toISOString().substring(0, 7); // YYYY-MM
      const category = transaction.envelope?.name || 'Uncategorized';
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {};
      }
      
      if (!monthlyData[monthKey][category]) {
        monthlyData[monthKey][category] = 0;
      }
      
      monthlyData[monthKey][category] += Math.abs(transaction.amount);
    });

    // Calculate predictions using simple linear regression
    const predictions = {};
    const allCategories = new Set();
    
    Object.values(monthlyData).forEach((month: any) => {
      Object.keys(month).forEach(category => allCategories.add(category));
    });

    allCategories.forEach(category => {
      const monthlyAmounts = Object.entries(monthlyData)
        .map(([month, data]: [string, any]) => data[category] || 0)
        .filter(amount => amount > 0);

      if (monthlyAmounts.length >= 3) {
        // Simple trend calculation
        const average = monthlyAmounts.reduce((sum, amt) => sum + amt, 0) / monthlyAmounts.length;
        const recent = monthlyAmounts.slice(-2).reduce((sum, amt) => sum + amt, 0) / Math.min(2, monthlyAmounts.length);
        const trend = recent > average ? 'increasing' : recent < average ? 'decreasing' : 'stable';
        
        // Calculate seasonal factors if enough data
        let seasonalFactor = 1;
        if (monthlyAmounts.length >= 6) {
          const seasonalVariation = Math.max(...monthlyAmounts) / Math.min(...monthlyAmounts);
          seasonalFactor = seasonalVariation > 1.5 ? seasonalVariation : 1;
        }

        predictions[category] = {
          averageMonthly: average / 100,
          recentAverage: recent / 100,
          trend,
          nextMonthPrediction: (recent * seasonalFactor) / 100,
          confidence: monthlyAmounts.length >= 6 ? 'high' : monthlyAmounts.length >= 4 ? 'medium' : 'low',
          seasonalFactor: seasonalFactor.toFixed(2)
        };
      }
    });

    // Calculate overall spending prediction
    const totalHistoricalMonthly = Object.values(predictions)
      .reduce((sum: number, pred: any) => sum + pred.nextMonthPrediction, 0);

    const riskFactors = [];
    
    // Identify risk factors
    Object.entries(predictions).forEach(([category, pred]: [string, any]) => {
      if (pred.trend === 'increasing' && pred.nextMonthPrediction > pred.averageMonthly * 1.2) {
        riskFactors.push({
          category,
          type: 'spending_increase',
          severity: 'medium',
          message: `${category} spending is trending upward and may exceed budget`
        });
      }
    });

    return {
      success: true,
      data: {
        categoryPredictions: predictions,
        overallPrediction: {
          totalMonthlySpending: totalHistoricalMonthly,
          riskFactors,
          confidence: Object.values(predictions).filter((p: any) => p.confidence === 'high').length > 0 ? 'medium' : 'low'
        },
        methodology: {
          dataPoints: transactions.length,
          timespan: '6 months',
          algorithm: 'linear_trend_analysis'
        }
      },
      message: `Predictive modeling completed for ${Object.keys(predictions).length} categories with ${riskFactors.length} risk factors identified`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Predictive modeling failed");
    return {
      success: false,
      error: `Predictive modeling failed: ${error.message}`
    };
  }
};

// Goal Progress Tracking Tool
const goalProgressExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const { userId } = params;

    logger.info({ userId }, "Tracking goal progress");

    // Get user's envelopes (which represent savings/budget goals)
    const envelopes = await db.envelope.findMany({
      where: { userId },
      include: {
        transactions: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)) // Last 30 days
            }
          }
        }
      }
    });

    const goalProgress = envelopes.map(envelope => {
      const currentBalance = envelope.balance / 100;
      const targetAmount = envelope.targetAmount / 100;
      const progressPercent = targetAmount > 0 ? (currentBalance / targetAmount) * 100 : 0;
      
      // Calculate monthly contribution pattern
      const monthlyContributions = envelope.transactions
        .filter(t => t.amount > 0) // Only positive transactions (contributions)
        .reduce((sum, t) => sum + t.amount, 0) / 100;

      const monthlyWithdrawals = envelope.transactions
        .filter(t => t.amount < 0) // Only negative transactions (withdrawals/expenses)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0) / 100;

      const netMonthlyProgress = monthlyContributions - monthlyWithdrawals;

      // Estimate time to goal
      let timeToGoal = null;
      if (targetAmount > currentBalance && netMonthlyProgress > 0) {
        const remainingAmount = targetAmount - currentBalance;
        timeToGoal = Math.ceil(remainingAmount / netMonthlyProgress); // months
      }

      // Determine goal status
      let status = 'on_track';
      if (progressPercent >= 100) status = 'achieved';
      else if (progressPercent >= 80) status = 'nearly_achieved';
      else if (netMonthlyProgress <= 0) status = 'at_risk';
      else if (progressPercent < 50 && timeToGoal && timeToGoal > 12) status = 'behind';

      return {
        envelopeId: envelope.id,
        envelopeName: envelope.name,
        currentBalance,
        targetAmount,
        progressPercent: Math.round(progressPercent),
        status,
        monthlyContributions,
        monthlyWithdrawals,
        netMonthlyProgress,
        timeToGoal,
        lastActivity: envelope.transactions[0]?.createdAt || envelope.createdAt
      };
    });

    // Calculate overall goal summary
    const totalGoals = goalProgress.length;
    const achievedGoals = goalProgress.filter(g => g.status === 'achieved').length;
    const atRiskGoals = goalProgress.filter(g => g.status === 'at_risk').length;
    const totalTargetAmount = goalProgress.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalCurrentAmount = goalProgress.reduce((sum, g) => sum + g.currentBalance, 0);

    const insights = [];
    
    // Generate insights
    if (achievedGoals > 0) {
      insights.push(`🎉 Congratulations! You've achieved ${achievedGoals} of your ${totalGoals} goals.`);
    }
    
    if (atRiskGoals > 0) {
      insights.push(`⚠️ ${atRiskGoals} goals need attention - consider adjusting your strategy.`);
    }

    const avgProgress = totalTargetAmount > 0 ? (totalCurrentAmount / totalTargetAmount) * 100 : 0;
    insights.push(`📊 Overall progress: ${Math.round(avgProgress)}% across all goals.`);

    return {
      success: true,
      data: {
        goalProgress,
        summary: {
          totalGoals,
          achievedGoals,
          atRiskGoals,
          totalTargetAmount,
          totalCurrentAmount,
          overallProgress: Math.round(avgProgress)
        },
        insights,
        recommendations: goalProgress
          .filter(g => g.status === 'at_risk' || g.status === 'behind')
          .map(g => ({
            envelopeName: g.envelopeName,
            issue: g.status === 'at_risk' ? 'negative monthly progress' : 'slow progress',
            suggestion: g.status === 'at_risk' 
              ? 'Reduce withdrawals or increase contributions'
              : 'Consider increasing monthly contributions'
          }))
      },
      message: `Goal progress tracked for ${totalGoals} goals: ${achievedGoals} achieved, ${atRiskGoals} at risk`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Goal progress tracking failed");
    return {
      success: false,
      error: `Goal progress tracking failed: ${error.message}`
    };
  }
};

// Register analysis tools
toolRegistry.registerTool({
  name: "trend_analysis",
  description: "Analyze spending trends across time periods to identify patterns and changes in financial behavior",
  category: TOOL_CATEGORIES.ANALYSIS,
  parameters: AnalysisParamsSchema,
  execute: trendAnalysisExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 3000
});

toolRegistry.registerTool({
  name: "predictive_modeling",
  description: "Generate financial predictions and forecasts based on historical spending patterns",
  category: TOOL_CATEGORIES.ANALYSIS,
  parameters: AnalysisParamsSchema,
  execute: predictiveModelingExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 3500
});

toolRegistry.registerTool({
  name: "goal_tracking",
  description: "Track progress towards financial goals and provide insights on achievement timelines",
  category: TOOL_CATEGORIES.ANALYSIS,
  parameters: AnalysisParamsSchema,
  execute: goalProgressExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 2000
});

export { trendAnalysisExecute, predictiveModelingExecute, goalProgressExecute };
