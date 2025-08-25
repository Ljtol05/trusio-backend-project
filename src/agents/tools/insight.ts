import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';

const recommendationSchema = z.object({
  userId: z.string(),
  analysisType: z.enum(['spending', 'saving', 'investment', 'general']).default('general'),
});

const generateRecommendationsSchema = z.object({
  userId: z.string().describe('User ID to generate recommendations for'),
  focusAreas: z.array(z.enum(['budgeting', 'saving', 'investing', 'debt', 'spending', 'goals'])).optional().describe('Specific areas to focus recommendations on'),
  riskTolerance: z.enum(['low', 'medium', 'high']).default('medium').describe('User risk tolerance level'),
  timeHorizon: z.enum(['short', 'medium', 'long']).default('medium').describe('Time horizon for recommendations'),
  priorityLevel: z.enum(['critical', 'important', 'nice_to_have']).optional().describe('Filter by priority level'),
  maxRecommendations: z.number().min(1).max(20).default(10).describe('Maximum number of recommendations to return')
});

const analyzeGoalProgressSchema = z.object({
  userId: z.string().describe('User ID to analyze goals for'),
  goalIds: z.array(z.string()).optional().describe('Specific goal IDs to analyze'),
  includeProjections: z.boolean().default(true).describe('Include completion projections'),
  includeMilestones: z.boolean().default(true).describe('Include milestone tracking')
});

const detectWarningsSchema = z.object({
  userId: z.string().describe('User ID to check for warnings'),
  severityThreshold: z.enum(['low', 'medium', 'high']).default('medium').describe('Minimum severity level for warnings'),
  categories: z.array(z.string()).optional().describe('Specific categories to check'),
  includePredictive: z.boolean().default(true).describe('Include predictive warnings')
});

const generateRecommendationsTool = tool({
  name: 'generate_recommendations',
  description: 'Generate personalized, actionable financial recommendations based on comprehensive user data analysis and goals',
  parameters: generateRecommendationsSchema,
  async execute({ userId, focusAreas, riskTolerance, timeHorizon, priorityLevel, maxRecommendations }) {
    try {
      logger.info({ userId, focusAreas, riskTolerance, timeHorizon }, 'Generating personalized recommendations');

      // TODO: Implement actual recommendation engine with ML/AI
      const baseRecommendations = [
        {
          id: 'rec_001',
          type: 'budget_optimization',
          priority: 'high',
          title: 'Optimize dining expenses',
          description: 'Reduce dining out costs by 25% through strategic meal planning',
          potentialSavings: 200,
          timeframe: '1 month',
          actionSteps: [
            'Plan weekly meals every Sunday',
            'Cook at home 5 days per week',
            'Set a $300 monthly dining budget',
            'Use grocery list apps to avoid impulse purchases'
          ],
          difficulty: 'medium',
          impact: 'high',
          category: 'spending',
          riskLevel: 'low'
        },
        {
          id: 'rec_002',
          type: 'emergency_fund',
          priority: 'critical',
          title: 'Increase emergency fund',
          description: 'Build emergency fund to 6 months of expenses',
          potentialSavings: 0,
          targetAmount: 15000,
          currentAmount: 7500,
          timeframe: '12 months',
          actionSteps: [
            'Automate $625 monthly transfer to emergency fund',
            'Use high-yield savings account',
            'Apply tax refunds to emergency fund'
          ],
          difficulty: 'easy',
          impact: 'critical',
          category: 'saving',
          riskLevel: 'low'
        },
        {
          id: 'rec_003',
          type: 'investment',
          priority: 'important',
          title: 'Diversify investment portfolio',
          description: 'Reduce risk through better asset allocation',
          potentialSavings: 0,
          expectedReturn: 8.5,
          timeframe: '3-6 months',
          actionSteps: [
            'Rebalance portfolio to 60/40 stocks/bonds',
            'Add international equity exposure',
            'Consider low-cost index funds',
            'Review and reduce investment fees'
          ],
          difficulty: 'medium',
          impact: 'high',
          category: 'investing',
          riskLevel: riskTolerance
        },
        {
          id: 'rec_004',
          type: 'debt_payoff',
          priority: 'important',
          title: 'Accelerate credit card payoff',
          description: 'Pay off high-interest debt 6 months early',
          potentialSavings: 1200,
          timeframe: '18 months',
          actionSteps: [
            'Use avalanche method for debt payoff',
            'Increase minimum payment by $150',
            'Apply dining savings to debt payments',
            'Consider balance transfer if beneficial'
          ],
          difficulty: 'medium',
          impact: 'high',
          category: 'debt',
          riskLevel: 'low'
        }
      ];

      // Filter by focus areas
      let recommendations = focusAreas ?
        baseRecommendations.filter(rec => focusAreas.includes(rec.category)) :
        baseRecommendations;

      // Filter by priority level
      if (priorityLevel) {
        recommendations = recommendations.filter(rec => rec.priority === priorityLevel);
      }

      // Limit results
      recommendations = recommendations.slice(0, maxRecommendations);

      // Add personalization based on risk tolerance
      recommendations.forEach(rec => {
        if (rec.type === 'investment' && riskTolerance === 'high') {
          rec.actionSteps.push('Consider adding growth stocks or emerging markets');
        } else if (rec.type === 'investment' && riskTolerance === 'low') {
          rec.actionSteps.push('Focus on bonds and dividend-paying stocks');
        }
      });

      return {
        status: 'success',
        recommendations,
        summary: {
          totalRecommendations: recommendations.length,
          totalPotentialSavings: recommendations.reduce((sum, rec) => sum + (rec.potentialSavings || 0), 0),
          priorityBreakdown: {
            critical: recommendations.filter(r => r.priority === 'critical').length,
            important: recommendations.filter(r => r.priority === 'important').length,
            high: recommendations.filter(r => r.priority === 'high').length
          },
          timeHorizon,
          riskTolerance
        },
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error, userId }, 'Recommendation generation failed');
      throw new Error(`Recommendation generation failed: ${error.message}`);
    }
  }
});

const analyzeGoalProgressTool = tool({
  name: 'analyze_goal_progress',
  description: 'Analyze progress towards financial goals with projections and milestone tracking',
  parameters: analyzeGoalProgressSchema,
  async execute({ userId, goalIds, includeProjections, includeMilestones }) {
    try {
      logger.info({ userId, goalIds, includeProjections, includeMilestones }, 'Analyzing goal progress');

      // TODO: Implement actual goal analysis with Prisma
      const goals = [
        {
          id: 'goal_001',
          name: 'Emergency Fund',
          type: 'savings',
          targetAmount: 15000,
          currentAmount: 7500,
          progress: 50,
          status: 'on_track',
          deadline: '2024-12-31',
          monthlyContribution: 625,
          projectedCompletion: '2024-11-15',
          confidence: 85
        },
        {
          id: 'goal_002',
          name: 'Vacation Fund',
          type: 'savings',
          targetAmount: 5000,
          currentAmount: 2800,
          progress: 56,
          status: 'ahead',
          deadline: '2024-06-01',
          monthlyContribution: 400,
          projectedCompletion: '2024-05-20',
          confidence: 95
        },
        {
          id: 'goal_003',
          name: 'Debt Payoff',
          type: 'debt',
          targetAmount: 8000,
          currentAmount: 3200,
          progress: 60,
          status: 'behind',
          deadline: '2024-08-31',
          monthlyContribution: 500,
          projectedCompletion: '2024-10-15',
          confidence: 70
        }
      ];

      const filteredGoals = goalIds ? goals.filter(g => goalIds.includes(g.id)) : goals;

      const analysis = {
        totalGoals: filteredGoals.length,
        onTrackGoals: filteredGoals.filter(g => g.status === 'on_track' || g.status === 'ahead').length,
        behindGoals: filteredGoals.filter(g => g.status === 'behind').length,
        averageProgress: filteredGoals.length > 0 ? filteredGoals.reduce((sum, g) => sum + g.progress, 0) / filteredGoals.length : 0,
        goals: filteredGoals.map(goal => {
          const result = { ...goal };

          if (includeProjections) {
            result.projections = {
              monthsToCompletion: Math.ceil((goal.targetAmount - goal.currentAmount) / goal.monthlyContribution),
              adjustedContribution: goal.status === 'behind' ? goal.monthlyContribution * 1.2 : goal.monthlyContribution,
              probabilityOfSuccess: goal.confidence / 100
            };
          }

          if (includeMilestones) {
            result.milestones = [
              { percentage: 25, achieved: goal.progress >= 25, achievedDate: '2024-01-15' },
              { percentage: 50, achieved: goal.progress >= 50, achievedDate: goal.progress >= 50 ? '2024-03-15' : null },
              { percentage: 75, achieved: goal.progress >= 75, achievedDate: null },
              { percentage: 100, achieved: goal.progress >= 100, achievedDate: null }
            ];
          }

          return result;
        }),
        recommendations: [
          'Increase emergency fund contribution by $100/month',
          'Consider reallocating vacation fund excess to debt payoff',
          'Set up automatic transfers for consistent progress'
        ]
      };

      return {
        status: 'success',
        analysis,
        analysisDate: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error, userId }, 'Goal progress analysis failed');
      throw new Error(`Goal progress analysis failed: ${error.message}`);
    }
  }
});

const detectWarningsTool = tool({
  name: 'detect_warnings',
  description: 'Detect potential financial issues and warnings before they become problems',
  parameters: detectWarningsSchema,
  async execute({ userId, severityThreshold, categories, includePredictive }) {
    try {
      logger.info({ userId, severityThreshold, categories, includePredictive }, 'Detecting financial warnings');

      // TODO: Implement actual warning detection system
      const allWarnings = [
        {
          id: 'warn_001',
          type: 'overspending',
          severity: 'high',
          category: 'budget',
          title: 'Consistent budget overruns',
          description: 'Dining category has exceeded budget for 3 consecutive months',
          impact: 'Potential $600 annual overspend',
          actionRequired: true,
          daysToAddress: 7,
          suggestions: [
            'Set strict dining budget limits',
            'Use envelope budgeting for dining',
            'Track daily spending'
          ]
        },
        {
          id: 'warn_002',
          type: 'emergency_fund',
          severity: 'medium',
          category: 'savings',
          title: 'Emergency fund below recommended level',
          description: 'Current emergency fund covers only 3 months of expenses',
          impact: 'Insufficient financial buffer for emergencies',
          actionRequired: false,
          daysToAddress: 30,
          suggestions: [
            'Increase emergency fund contributions',
            'Automate emergency fund transfers',
            'Consider high-yield savings account'
          ]
        },
        {
          id: 'warn_003',
          type: 'cash_flow',
          severity: 'low',
          category: 'liquidity',
          title: 'Tight end-of-month cash flow',
          description: 'Available cash typically drops below $500 in last week of month',
          impact: 'Limited flexibility for unexpected expenses',
          actionRequired: false,
          daysToAddress: 14,
          suggestions: [
            'Spread large expenses throughout month',
            'Build small cash buffer',
            'Review payment timing'
          ]
        }
      ];

      if (includePredictive) {
        allWarnings.push({
          id: 'warn_004',
          type: 'predictive',
          severity: 'medium',
          category: 'investment',
          title: 'Portfolio concentration risk',
          description: 'Over 70% allocation in single asset class detected',
          impact: 'Higher volatility and risk exposure',
          actionRequired: false,
          daysToAddress: 90,
          suggestions: [
            'Diversify across asset classes',
            'Consider international exposure',
            'Regular portfolio rebalancing'
          ]
        });
      }

      // Filter warnings
      let warnings = allWarnings;

      // Filter by severity threshold
      const severityOrder = { low: 1, medium: 2, high: 3 };
      const threshold = severityOrder[severityThreshold];
      warnings = warnings.filter(w => severityOrder[w.severity] >= threshold);

      // Filter by categories
      if (categories) {
        warnings = warnings.filter(w => categories.includes(w.category));
      }

      const analysis = {
        totalWarnings: warnings.length,
        criticalWarnings: warnings.filter(w => w.severity === 'high').length,
        actionRequiredCount: warnings.filter(w => w.actionRequired).length,
        warnings,
        summary: {
          mostUrgent: warnings.filter(w => w.actionRequired)[0] || null,
          riskLevel: warnings.some(w => w.severity === 'high') ? 'high' :
                     warnings.some(w => w.severity === 'medium') ? 'medium' : 'low',
          recommendedActions: warnings.filter(w => w.actionRequired).length
        }
      };

      return {
        status: 'success',
        analysis,
        detectionDate: new Date().toISOString()
      };
    } catch (error) {
      logger.error({ error, userId }, 'Warning detection failed');
      throw new Error(`Warning detection failed: ${error.message}`);
    }
  }
});

export function registerInsightTools(registry: ToolRegistry): void {
  try {
    // Register tools with enhanced metadata
    registry.registerTool({
      ...generateRecommendationsTool,
      category: 'insight',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 4000
    });

    registry.registerTool({
      ...analyzeGoalProgressTool,
      category: 'insight',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 3000
    });

    registry.registerTool({
      ...detectWarningsTool,
      category: 'insight',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 2500
    });

    // Register aliases
    registry.registerTool({
      name: 'personalized_recommendations',
      ...generateRecommendationsTool,
      category: 'insight',
      riskLevel: 'low',
      requiresAuth: true
    });

    registry.registerTool({
      name: 'goal_tracking',
      ...analyzeGoalProgressTool,
      category: 'insight',
      riskLevel: 'low',
      requiresAuth: true
    });

    registry.registerTool({
      name: 'financial_warnings',
      ...detectWarningsTool,
      category: 'insight',
      riskLevel: 'low',
      requiresAuth: true
    });

    logger.info({ toolCount: 6 }, 'Insight tools registered successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to register insight tools');
    throw error;
  }
}