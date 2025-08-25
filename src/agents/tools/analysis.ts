import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';

const budgetVarianceSchema = z.object({
  userId: z.string().describe('User ID to analyze'),
  period: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).default('monthly').describe('Analysis period'),
  categories: z.array(z.string()).optional().describe('Specific categories to analyze'),
  includeProjections: z.boolean().default(false).describe('Include end-of-period projections'),
  detailLevel: z.enum(['summary', 'detailed', 'comprehensive']).default('detailed').describe('Level of analysis detail')
});

const trendAnalysisSchema = z.object({
  userId: z.string().describe('User ID to analyze'),
  metricType: z.enum(['spending', 'income', 'savings', 'debt']).describe('Type of metric to analyze'),
  timeRange: z.number().positive().default(6).describe('Number of periods to analyze'),
  periodType: z.enum(['week', 'month', 'quarter']).default('month').describe('Type of period'),
  includeSeasonality: z.boolean().default(true).describe('Include seasonal pattern analysis')
});

const financialHealthSchema = z.object({
  userId: z.string().describe('User ID to assess'),
  includeRatios: z.boolean().default(true).describe('Include financial ratio calculations'),
  includeGoalProgress: z.boolean().default(true).describe('Include goal progress assessment'),
  includePredictions: z.boolean().default(false).describe('Include future financial health predictions')
});

const budgetVarianceTool = tool({
  name: 'analyze_budget_variance',
  description: 'Comprehensive analysis of variance between budgeted and actual spending with actionable insights',
  parameters: budgetVarianceSchema,
  async execute({ userId, period, categories, includeProjections, detailLevel }) {
    try {
      logger.info({ userId, period, categories, detailLevel }, 'Analyzing budget variance');

      // TODO: Implement actual variance analysis with Prisma
      const variance = {
        period,
        totalBudget: 5000,
        totalSpent: 4500,
        totalVariance: -500,
        variancePercentage: -10,
        overallStatus: 'under_budget',
        categories: [
          {
            name: 'food_dining',
            budgeted: 800,
            spent: 900,
            variance: 100,
            variancePercentage: 12.5,
            status: 'over_budget',
            trend: 'increasing',
            recommendation: 'Consider meal planning to reduce dining costs'
          },
          {
            name: 'transportation',
            budgeted: 400,
            spent: 350,
            variance: -50,
            variancePercentage: -12.5,
            status: 'under_budget',
            trend: 'stable',
            recommendation: 'Good control, consider reallocating savings'
          },
          {
            name: 'groceries',
            budgeted: 600,
            spent: 580,
            variance: -20,
            variancePercentage: -3.3,
            status: 'on_track',
            trend: 'stable',
            recommendation: 'Excellent budget adherence'
          }
        ],
        insights: [
          'Overall spending is 10% under budget',
          'Dining category needs attention - 12.5% over budget',
          'Transportation savings can be reallocated'
        ],
        riskFactors: [
          {
            category: 'food_dining',
            risk: 'medium',
            description: 'Consistent overspending pattern detected'
          }
        ]
      };

      if (includeProjections) {
        variance.projections = {
          endOfPeriodSpending: 4800,
          projectedVariance: -200,
          confidenceLevel: 85,
          adjustmentRecommendations: [
            'Reduce dining out by $100 to meet budget',
            'Reallocate $50 from transportation to emergency fund'
          ]
        };
      }

      if (detailLevel === 'comprehensive') {
        variance.detailedMetrics = {
          averageDailySpending: 150,
          spendingVelocity: 'moderate',
          categoryCorrelations: [
            { categories: ['food_dining', 'entertainment'], correlation: 0.7 }
          ]
        };
      }

      return {
        status: 'success',
        variance,
        analysisDate: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error, userId }, 'Budget variance analysis failed');
      throw new Error(`Budget variance analysis failed: ${error.message}`);
    }
  }
});

const analyzeTrendsTool = tool({
  name: 'analyze_trends',
  description: 'Analyze financial trends over time with pattern recognition and forecasting',
  parameters: trendAnalysisSchema,
  async execute({ userId, metricType, timeRange, periodType, includeSeasonality }) {
    try {
      logger.info({ userId, metricType, timeRange, periodType }, 'Analyzing financial trends');

      // TODO: Implement actual trend analysis
      const trends = {
        metricType,
        timeRange,
        periodType,
        dataPoints: Array.from({ length: timeRange }, (_, i) => ({
          period: i + 1,
          value: 1000 + Math.random() * 500,
          date: new Date(Date.now() - (timeRange - i) * 30 * 24 * 60 * 60 * 1000).toISOString()
        })),
        trendDirection: 'increasing',
        trendStrength: 'moderate',
        averageChange: 2.5,
        volatility: 'low',
        patterns: [
          {
            type: 'weekly_pattern',
            description: 'Higher spending on weekends',
            strength: 'strong'
          },
          {
            type: 'monthly_pattern',
            description: 'Increased spending at month start',
            strength: 'moderate'
          }
        ],
        forecast: {
          nextPeriod: 1150,
          confidence: 78,
          range: { min: 1000, max: 1300 }
        },
        anomalies: [
          {
            period: 3,
            value: 1500,
            type: 'spike',
            severity: 'medium',
            possibleCause: 'One-time large purchase'
          }
        ]
      };

      if (includeSeasonality) {
        trends.seasonality = {
          hasSeasonalPattern: true,
          seasonalStrength: 'moderate',
          peakPeriods: ['December', 'July'],
          lowPeriods: ['February', 'September']
        };
      }

      return {
        status: 'success',
        trends,
        analysisDate: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error, userId }, 'Trend analysis failed');
      throw new Error(`Trend analysis failed: ${error.message}`);
    }
  }
});

const assessFinancialHealthTool = tool({
  name: 'assess_financial_health',
  description: 'Comprehensive financial health assessment with key ratios and recommendations',
  parameters: financialHealthSchema,
  async execute({ userId, includeRatios, includeGoalProgress, includePredictions }) {
    try {
      logger.info({ userId, includeRatios, includeGoalProgress }, 'Assessing financial health');

      // TODO: Implement actual financial health assessment
      const assessment = {
        overallScore: 75,
        grade: 'B+',
        status: 'good',
        strengths: [
          'Consistent saving habits',
          'Low debt-to-income ratio',
          'Emergency fund well-funded'
        ],
        weaknesses: [
          'High entertainment spending',
          'Limited investment diversification'
        ],
        recommendations: [
          'Reduce discretionary spending by 10%',
          'Increase retirement contributions',
          'Consider diversifying investments'
        ]
      };

      if (includeRatios) {
        assessment.financialRatios = {
          debtToIncomeRatio: 0.25,
          savingsRate: 0.15,
          emergencyFundMonths: 4.5,
          expenseRatio: 0.75,
          liquidityRatio: 1.8
        };
      }

      if (includeGoalProgress) {
        assessment.goalProgress = [
          {
            goalType: 'emergency_fund',
            target: 10000,
            current: 7500,
            progress: 75,
            onTrack: true
          },
          {
            goalType: 'retirement',
            target: 500000,
            current: 125000,
            progress: 25,
            onTrack: true
          }
        ];
      }

      if (includePredictions) {
        assessment.predictions = {
          financialHealthIn6Months: 78,
          financialHealthIn1Year: 82,
          keyRisks: [
            'Inflation impact on savings',
            'Potential job market changes'
          ],
          opportunities: [
            'Investment growth potential',
            'Side income opportunities'
          ]
        };
      }

      return {
        status: 'success',
        assessment,
        assessmentDate: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error, userId }, 'Financial health assessment failed');
      throw new Error(`Financial health assessment failed: ${error.message}`);
    }
  }
});

export function registerAnalysisTools(registry: ToolRegistry): void {
  try {
    // Register tools with enhanced metadata
    registry.registerTool({
      ...budgetVarianceTool,
      category: 'analysis',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 3000
    });

    registry.registerTool({
      ...analyzeTrendsTool,
      category: 'analysis',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 4000
    });

    registry.registerTool({
      ...assessFinancialHealthTool,
      category: 'analysis',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 5000
    });

    // Register aliases
    registry.registerTool({
      name: 'variance_calculation',
      ...budgetVarianceTool,
      category: 'analysis',
      riskLevel: 'low',
      requiresAuth: true
    });

    registry.registerTool({
      name: 'financial_trends',
      ...analyzeTrendsTool,
      category: 'analysis',
      riskLevel: 'low',
      requiresAuth: true
    });

    registry.registerTool({
      name: 'health_check',
      ...assessFinancialHealthTool,
      category: 'analysis',
      riskLevel: 'low',
      requiresAuth: true
    });

    logger.info({ toolCount: 6 }, 'Analysis tools registered successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to register analysis tools');
    throw error;
  }
}