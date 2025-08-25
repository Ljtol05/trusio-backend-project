import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toolRegistry } from "./registry.js";
import { InsightParamsSchema, ToolContext, ToolResult, TOOL_CATEGORIES } from "./types.js";

// Helper function to generate recommendations
async function generateRecommendations(envelopes: any[], transactions: any[], transfers: any[]) {
  const recommendations = [];

  // Analyze envelope utilization
  envelopes.forEach(envelope => {
    const totalSpent = envelope.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const utilizationRate = envelope.targetAmount > 0 ? (totalSpent / envelope.targetAmount) * 100 : 0;

    if (utilizationRate > 90 && utilizationRate < 110) {
      recommendations.push({
        type: 'budget_optimization',
        title: `${envelope.name} Budget Utilization`,
        message: `Your ${envelope.name} envelope is well-utilized at ${Math.round(utilizationRate)}%. This shows good budget planning!`,
        priority: 'low',
        category: envelope.name,
        confidence: 0.8
      });
    } else if (utilizationRate < 50 && envelope.targetAmount > 0) {
      recommendations.push({
        type: 'reallocation_opportunity',
        title: `Underutilized ${envelope.name} Budget`,
        message: `You've only used ${Math.round(utilizationRate)}% of your ${envelope.name} budget. Consider reallocating funds to other categories.`,
        priority: 'medium',
        category: envelope.name,
        confidence: 0.7,
        potentialSavings: (envelope.targetAmount - totalSpent) / 100
      });
    }
  });

  // Analyze transfer patterns
  const frequentTransfers = transfers.filter(t =>
    transfers.filter(t2 =>
      t2.fromEnvelopeId === t.fromEnvelopeId && t2.toEnvelopeId === t.toEnvelopeId
    ).length > 2
  );

  if (frequentTransfers.length > 0) {
    recommendations.push({
      type: 'budget_adjustment',
      title: 'Frequent Budget Transfers Detected',
      message: 'You\'re frequently moving money between envelopes. Consider adjusting your budget allocations to better match your spending patterns.',
      priority: 'medium',
      confidence: 0.6,
      affectedEnvelopes: frequentTransfers.map(t => t.fromEnvelope?.name).filter(Boolean)
    });
  }

  return recommendations;
}

// Helper function to generate opportunities
async function generateOpportunities(envelopes: any[], transactions: any[]) {
  const opportunities = [];

  // Calculate total unused budget
  let totalUnusedBudget = 0;
  envelopes.forEach(envelope => {
    const totalSpent = envelope.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    if (envelope.targetAmount > totalSpent) {
      totalUnusedBudget += envelope.targetAmount - totalSpent;
    }
  });

  if (totalUnusedBudget > 5000) { // $50+ unused
    opportunities.push({
      type: 'savings_opportunity',
      title: 'Unused Budget Allocation',
      message: `You have $${(totalUnusedBudget / 100).toFixed(2)} in unused budget this month. Consider moving this to savings or emergency fund.`,
      priority: 'high',
      confidence: 0.9,
      potentialSavings: totalUnusedBudget / 100
    });
  }

  // Identify categories with no transactions
  const inactiveEnvelopes = envelopes.filter(env =>
    env.transactions.length === 0 && env.targetAmount > 0
  );

  if (inactiveEnvelopes.length > 0) {
    opportunities.push({
      type: 'budget_simplification',
      title: 'Inactive Budget Categories',
      message: `${inactiveEnvelopes.length} envelopes have no recent activity. Consider consolidating or removing unused categories.`,
      priority: 'medium',
      confidence: 0.7,
      affectedEnvelopes: inactiveEnvelopes.map(env => env.name)
    });
  }

  // Analyze transaction frequency for automation opportunities
  const transactionGroups = {};
  transactions.forEach(t => {
    const desc = t.description.toLowerCase().replace(/\d+/g, 'X');
    transactionGroups[desc] = (transactionGroups[desc] || 0) + 1;
  });

  const recurringTransactions = Object.entries(transactionGroups)
    .filter(([_, count]) => count >= 3)
    .map(([desc, count]) => ({ description: desc, frequency: count }));

  if (recurringTransactions.length > 0) {
    opportunities.push({
      type: 'automation_opportunity',
      title: 'Recurring Transaction Automation',
      message: `Found ${recurringTransactions.length} recurring transactions that could be automated for easier budget management.`,
      priority: 'low',
      confidence: 0.6,
      recurringTransactions: recurringTransactions.slice(0, 3) // Top 3
    });
  }

  return opportunities;
}

// Helper function to generate warnings
async function generateWarnings(envelopes: any[], transactions: any[]) {
  const warnings = [];

  // Check for overspending
  envelopes.forEach(envelope => {
    const totalSpent = envelope.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const overspendAmount = totalSpent - envelope.targetAmount;

    if (overspendAmount > 0 && envelope.targetAmount > 0) {
      const overspendPercent = (overspendAmount / envelope.targetAmount) * 100;
      warnings.push({
        type: 'overspending_alert',
        title: `${envelope.name} Over Budget`,
        message: `You've exceeded your ${envelope.name} budget by $${(overspendAmount / 100).toFixed(2)} (${Math.round(overspendPercent)}% over).`,
        priority: overspendPercent > 50 ? 'high' : 'medium',
        confidence: 0.9,
        category: envelope.name,
        overspendAmount: overspendAmount / 100
      });
    }
  });

  // Check for rapidly depleting envelopes
  envelopes.forEach(envelope => {
    if (envelope.balance < envelope.targetAmount * 0.1 && envelope.targetAmount > 0) {
      warnings.push({
        type: 'low_balance_warning',
        title: `${envelope.name} Low Balance`,
        message: `Your ${envelope.name} envelope is running low. Current balance: $${(envelope.balance / 100).toFixed(2)}`,
        priority: 'medium',
        confidence: 0.8,
        category: envelope.name,
        remainingBalance: envelope.balance / 100
      });
    }
  });

  // Check for unusual spending patterns
  const last7Days = transactions.filter(t =>
    t.createdAt >= new Date(Date.now() - (7 * 24 * 60 * 60 * 1000))
  );
  const previous7Days = transactions.filter(t =>
    t.createdAt >= new Date(Date.now() - (14 * 24 * 60 * 60 * 1000)) &&
    t.createdAt < new Date(Date.now() - (7 * 24 * 60 * 60 * 1000))
  );

  const recentSpending = last7Days.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const previousSpending = previous7Days.reduce((sum, t) => sum + Math.abs(t.amount), 0);

  if (recentSpending > previousSpending * 1.5 && previousSpending > 0) {
    const increasePercent = ((recentSpending - previousSpending) / previousSpending) * 100;
    warnings.push({
      type: 'unusual_spending',
      title: 'Unusual Spending Activity',
      message: `Your spending has increased by ${Math.round(increasePercent)}% compared to last week. Recent 7 days: $${(recentSpending / 100).toFixed(2)}`,
      priority: 'medium',
      confidence: 0.7,
      spendingIncrease: increasePercent
    });
  }

  return warnings;
}

// Helper function to generate achievements
async function generateAchievements(envelopes: any[], transactions: any[], transfers: any[]) {
  const achievements = [];

  // Check for successful budget adherence
  envelopes.forEach(envelope => {
    const totalSpent = envelope.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const utilizationRate = envelope.targetAmount > 0 ? (totalSpent / envelope.targetAmount) * 100 : 0;

    if (utilizationRate <= 100 && utilizationRate >= 80 && envelope.targetAmount > 0) {
      achievements.push({
        type: 'budget_success',
        title: `${envelope.name} Budget Achievement`,
        message: `Great job staying within your ${envelope.name} budget! You used ${Math.round(utilizationRate)}% of your allocated funds.`,
        priority: 'low',
        confidence: 0.9,
        category: envelope.name,
        utilizationRate: Math.round(utilizationRate)
      });
    }
  });

  // Check for savings growth
  const savingsEnvelopes = envelopes.filter(env =>
    env.name.toLowerCase().includes('saving') ||
    env.name.toLowerCase().includes('emergency') ||
    env.category?.toLowerCase().includes('saving')
  );

  savingsEnvelopes.forEach(envelope => {
    const contributions = envelope.transactions.filter(t => t.amount > 0);
    const totalContributions = contributions.reduce((sum, t) => sum + t.amount, 0);

    if (totalContributions > 0) {
      achievements.push({
        type: 'savings_milestone',
        title: `${envelope.name} Progress`,
        message: `You've added $${(totalContributions / 100).toFixed(2)} to your ${envelope.name} this month. Keep up the great work!`,
        priority: 'medium',
        confidence: 0.8,
        category: envelope.name,
        contributionAmount: totalContributions / 100
      });
    }
  });

  // Check for consistent financial management
  if (transactions.length > 10 && transfers.length > 0) {
    achievements.push({
      type: 'engagement_achievement',
      title: 'Active Financial Management',
      message: `You've been actively managing your finances with ${transactions.length} transactions and ${transfers.length} transfers this month!`,
      priority: 'low',
      confidence: 0.7,
      activityScore: transactions.length + transfers.length
    });
  }

  return achievements;
}

// Helper function to generate action items
function generateActionItems(insight: any, envelopes: any[]) {
  const actionItems = [];

  switch (insight.type) {
    case 'reallocation_opportunity':
      actionItems.push({
        action: 'reallocate_funds',
        description: `Move unused funds from ${insight.category} to another envelope`,
        estimatedImpact: 'medium',
        difficulty: 'easy'
      });
      break;
    case 'overspending_alert':
      actionItems.push({
        action: 'review_spending',
        description: `Review recent ${insight.category} transactions and identify areas to cut back`,
        estimatedImpact: 'high',
        difficulty: 'medium'
      });
      break;
    case 'savings_opportunity':
      actionItems.push({
        action: 'transfer_to_savings',
        description: 'Move unused budget allocation to savings or emergency fund',
        estimatedImpact: 'high',
        difficulty: 'easy'
      });
      break;
    case 'automation_opportunity':
      actionItems.push({
        action: 'setup_automation',
        description: 'Set up automatic categorization for recurring transactions',
        estimatedImpact: 'medium',
        difficulty: 'medium'
      });
      break;
  }

  return actionItems;
}

// Insight Generator Tool
const insightGeneratorExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = InsightParamsSchema.parse(params);
    const { userId, insightType, priority, includeActionItems } = validatedParams;

    logger.info({ userId, insightType, priority }, "Generating financial insights");

    // Get comprehensive financial data
    const [envelopes, transactions, transfers] = await Promise.all([
      db.envelope.findMany({
        where: { userId },
        include: {
          transactions: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - (90 * 24 * 60 * 60 * 1000)) // Last 90 days
              }
            }
          }
        }
      }),
      db.transaction.findMany({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)) // Last 30 days
          }
        },
        include: { envelope: true }
      }),
      db.transfer.findMany({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000))
          }
        },
        include: {
          fromEnvelope: true,
          toEnvelope: true
        }
      })
    ]);

    let insights = [];

    switch (insightType) {
      case 'recommendations':
        insights = await generateRecommendations(envelopes, transactions, transfers);
        break;
      case 'opportunities':
        insights = await generateOpportunities(envelopes, transactions);
        break;
      case 'warnings':
        insights = await generateWarnings(envelopes, transactions);
        break;
      case 'achievements':
        insights = await generateAchievements(envelopes, transactions, transfers);
        break;
    }

    // Filter by priority if specified
    if (priority !== 'medium') {
      insights = insights.filter(insight => insight.priority === priority);
    }

    // Add action items if requested
    if (includeActionItems) {
      insights = insights.map(insight => ({
        ...insight,
        actionItems: generateActionItems(insight, envelopes)
      }));
    }

    return {
      success: true,
      data: {
        insights,
        summary: {
          totalInsights: insights.length,
          highPriority: insights.filter(i => i.priority === 'high').length,
          mediumPriority: insights.filter(i => i.priority === 'medium').length,
          lowPriority: insights.filter(i => i.priority === 'low').length
        },
        context: {
          envelopeCount: envelopes.length,
          transactionCount: transactions.length,
          transferCount: transfers.length,
          analysisDate: new Date().toISOString()
        }
      },
      message: `Generated ${insights.length} ${insightType} insights`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Insight generation failed");
    return {
      success: false,
      error: `Insight generation failed: ${error.message}`
    };
  }
};

// Register insight tools
toolRegistry.registerTool({
  name: "insight_generator",
  description: "Generate personalized financial insights including recommendations, opportunities, warnings, and achievements",
  category: TOOL_CATEGORIES.INSIGHT,
  parameters: InsightParamsSchema,
  execute: insightGeneratorExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 4000
});

// New tools from the edited snippet
const recommendationSchema = z.object({
  userId: z.string(),
  analysisType: z.enum(['spending', 'saving', 'investment', 'general']).default('general'),
  timeframe: z.string().optional(),
});

const opportunityAnalysisSchema = z.object({
  userId: z.string(),
  focusAreas: z.array(z.string()).optional(),
});

export const generateRecommendationsTool = tool({
  name: 'generate_personalized_recommendations',
  description: 'Generate personalized financial recommendations based on user data',
  parameters: recommendationSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Generating personalized recommendations');

      // Gather user financial data
      const [transactions, envelopes, user] = await Promise.all([
        db.transaction.findMany({
          where: {
            userId: params.userId,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        }),
        db.envelope.findMany({ where: { userId: params.userId } }),
        db.user.findUnique({ where: { id: params.userId } })
      ]);

      if (!user) {
        return JSON.stringify({
          success: false,
          error: 'User not found'
        });
      }

      const recommendations = [];
      const insights = [];

      // Spending analysis
      if (params.analysisType === 'spending' || params.analysisType === 'general') {
        const expenses = transactions.filter(tx => tx.amount < 0);
        const totalSpent = Math.abs(expenses.reduce((sum, tx) => sum + tx.amount, 0));

        if (expenses.length > 0) {
          const categorySpending = expenses.reduce((acc, tx) => {
            const category = tx.category || 'Other';
            acc[category] = (acc[category] || 0) + Math.abs(tx.amount);
            return acc;
          }, {} as Record<string, number>);

          const topCategory = Object.entries(categorySpending)
            .sort(([,a], [,b]) => b - a)[0];

          if (topCategory && topCategory[1] > totalSpent * 0.3) {
            recommendations.push({
              type: 'spending_optimization',
              priority: 'high',
              description: `Consider reducing spending in ${topCategory[0]} - it represents ${Math.round((topCategory[1] / totalSpent) * 100)}% of your expenses`,
              estimatedImpact: `Could save $${(topCategory[1] * 0.1).toFixed(2)} per month`,
              actionRequired: `Review ${topCategory[0]} expenses and identify unnecessary purchases`
            });
          }
        }
      }

      // Budget envelope analysis
      if (envelopes.length > 0) {
        const overBudgetEnvelopes = envelopes.filter(env => env.currentAmount < 0);
        if (overBudgetEnvelopes.length > 0) {
          recommendations.push({
            type: 'budget_adjustment',
            priority: 'high',
            description: `${overBudgetEnvelopes.length} budget categories are overspent`,
            estimatedImpact: 'Better budget adherence',
            actionRequired: 'Reallocate funds or adjust spending habits'
          });
        }

        const underUtilizedEnvelopes = envelopes.filter(env =>
          env.currentAmount > env.budgetAmount * 0.8
        );
        if (underUtilizedEnvelopes.length > 0) {
          recommendations.push({
            type: 'reallocation',
            priority: 'medium',
            description: `${underUtilizedEnvelopes.length} budget categories have excess funds`,
            estimatedImpact: 'Better fund utilization',
            actionRequired: 'Consider reallocating excess funds to other categories'
          });
        }
      }

      // Saving opportunities
      if (params.analysisType === 'saving' || params.analysisType === 'general') {
        const income = transactions.filter(tx => tx.amount > 0);
        const totalIncome = income.reduce((sum, tx) => sum + tx.amount, 0);
        const expenses = Math.abs(transactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0));

        const savingsRate = totalIncome > 0 ? ((totalIncome - expenses) / totalIncome) * 100 : 0;

        if (savingsRate < 20) {
          recommendations.push({
            type: 'savings_improvement',
            priority: 'high',
            description: `Your savings rate is ${savingsRate.toFixed(1)}%. Aim for at least 20%`,
            estimatedImpact: `Increase monthly savings by $${((totalIncome * 0.2) - (totalIncome - expenses)).toFixed(2)}`,
            actionRequired: 'Create a dedicated savings plan and reduce discretionary spending'
          });
        }
      }

      insights.push(`Analyzed ${transactions.length} transactions over the last 30 days`);
      insights.push(`You have ${envelopes.length} active budget categories`);

      if (recommendations.length === 0) {
        recommendations.push({
          type: 'general',
          priority: 'low',
          description: 'Your finances appear to be well managed',
          estimatedImpact: 'Continued financial stability',
          actionRequired: 'Keep monitoring your spending patterns'
        });
      }

      return JSON.stringify({
        success: true,
        analysisType: params.analysisType,
        recommendations,
        insights,
        summary: {
          totalRecommendations: recommendations.length,
          highPriorityItems: recommendations.filter(r => r.priority === 'high').length
        }
      });

    } catch (error: any) {
      logger.error({ error, params }, 'Failed to generate recommendations');
      return JSON.stringify({
        success: false,
        error: 'Failed to generate personalized recommendations',
        details: error.message
      });
    }
  }
});

export const identifyOpportunitiesTool = tool({
  name: 'identify_financial_opportunities',
  description: 'Identify financial optimization opportunities',
  parameters: opportunityAnalysisSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Identifying financial opportunities');

      const [transactions, envelopes] = await Promise.all([
        db.transaction.findMany({
          where: {
            userId: params.userId,
            createdAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }
          }
        }),
        db.envelope.findMany({ where: { userId: params.userId } })
      ]);

      const opportunities = [];

      // Recurring expense optimization
      const merchantFrequency = transactions.reduce((acc, tx) => {
        if (tx.amount < 0 && tx.description) {
          const merchant = tx.description.toLowerCase();
          acc[merchant] = (acc[merchant] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);

      const frequentMerchants = Object.entries(merchantFrequency)
        .filter(([, count]) => count >= 4)
        .sort(([, a], [, b]) => b - a);

      if (frequentMerchants.length > 0) {
        opportunities.push({
          type: 'subscription_optimization',
          title: 'Review Recurring Expenses',
          description: `You have ${frequentMerchants.length} frequently charged merchants`,
          potentialSaving: 'Up to 15-25% on subscriptions',
          action: 'Review and cancel unused subscriptions',
          merchants: frequentMerchants.slice(0, 3).map(([name]) => name)
        });
      }

      // Cash flow timing optimization
      const monthlyExpenses = transactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / 2; // 2 months of data

      const monthlyIncome = transactions
        .filter(tx => tx.amount > 0)
        .reduce((sum, tx) => sum + tx.amount, 0) / 2;

      if (monthlyIncome > monthlyExpenses * 1.5) {
        opportunities.push({
          type: 'investment_opportunity',
          title: 'Excess Cash Flow',
          description: `You have $${(monthlyIncome - monthlyExpenses).toFixed(2)} monthly surplus`,
          potentialSaving: 'Compound growth potential',
          action: 'Consider investing surplus funds'
        });
      }

      // Budget rebalancing
      if (envelopes.length > 0) {
        const imbalancedEnvelopes = envelopes.filter(env =>
          Math.abs(env.currentAmount - env.budgetAmount) > env.budgetAmount * 0.2
        );

        if (imbalancedEnvelopes.length > 0) {
          opportunities.push({
            type: 'budget_rebalancing',
            title: 'Budget Optimization',
            description: `${imbalancedEnvelopes.length} budget categories need rebalancing`,
            potentialSaving: 'Improved budget efficiency',
            action: 'Redistribute funds between over/under-allocated categories'
          });
        }
      }

      return JSON.stringify({
        success: true,
        opportunities,
        summary: {
          totalOpportunities: opportunities.length,
          categories: [...new Set(opportunities.map(o => o.type))]
        },
        nextSteps: opportunities.length > 0 ?
          'Review the identified opportunities and prioritize based on potential impact' :
          'Continue monitoring for new optimization opportunities'
      });

    } catch (error: any) {
      logger.error({ error, params }, 'Failed to identify opportunities');
      return JSON.stringify({
        success: false,
        error: 'Failed to identify financial opportunities',
        details: error.message
      });
    }
  }
});

export function registerInsightTools(registry: any): void {
  registry.registerTool(generateRecommendationsTool);
  registry.registerTool(identifyOpportunitiesTool);
  logger.info('Financial insight tools registered');
}