import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';

const budgetAnalysisSchema = z.object({
  userId: z.string().describe('User ID to analyze budget for'),
  period: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly').describe('Analysis period'),
  categories: z.array(z.string()).optional().describe('Specific categories to analyze'),
  includeProjections: z.boolean().default(false).describe('Include future spending projections'),
  compareToGoals: z.boolean().default(true).describe('Compare spending to budget goals')
});

const budgetOptimizationSchema = z.object({
  userId: z.string().describe('User ID to optimize budget for'),
  targetSavings: z.number().positive().describe('Target savings amount'),
  priorities: z.array(z.string()).optional().describe('Priority categories to preserve'),
  aggressiveness: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate').describe('Optimization aggressiveness level')
});

const budgetAnalysisTool = tool({
  name: 'budget_analysis',
  description: 'Analyze user budget performance, spending patterns, adherence rates, and provide actionable insights and recommendations',
  parameters: budgetAnalysisSchema,
  async execute({ userId, period, categories, includeProjections, compareToGoals }) {
    try {
      logger.info({ userId, period, categories, includeProjections, compareToGoals }, 'Executing budget analysis');

      // TODO: Implement actual budget analysis logic with Prisma
      const analysis = {
        totalBudget: 5000,
        totalSpent: 4200,
        adherenceRate: 84,
        categories: categories || ['food', 'transportation', 'entertainment'],
        variance: {
          overBudget: ['entertainment'],
          underBudget: ['food', 'transportation'],
          onTrack: ['utilities']
        },
        recommendations: [
          'Consider reducing entertainment spending by 10%',
          'You\'re doing well with your food budget',
          'Transportation costs are under control'
        ],
        projections: includeProjections ? {
          endOfPeriodSpending: 4800,
          remainingBudget: 200,
          daysRemaining: 15
        } : undefined,
        goalComparison: compareToGoals ? {
          savingsGoalProgress: 75,
          emergencyFundProgress: 60,
          debtPayoffProgress: 90
        } : undefined
      };

      return {
        status: 'success',
        period,
        analysis
      };
    } catch (error) {
      logger.error({ error, userId }, 'Budget analysis failed');
      throw new Error(`Budget analysis failed: ${error.message}`);
    }
  }
});

const budgetOptimizationTool = tool({
  name: 'optimize_categories',
  description: 'Optimize budget category allocations to meet savings targets while preserving priority spending',
  parameters: budgetOptimizationSchema,
  async execute({ userId, targetSavings, priorities, aggressiveness }) {
    try {
      logger.info({ userId, targetSavings, priorities, aggressiveness }, 'Executing budget optimization');

      // TODO: Implement budget optimization logic
      const optimization = {
        originalBudget: 5000,
        optimizedBudget: 5000 - targetSavings,
        targetSavings,
        adjustments: [
          { category: 'entertainment', currentAmount: 500, suggestedAmount: 350, reduction: 150 },
          { category: 'dining_out', currentAmount: 400, suggestedAmount: 300, reduction: 100 },
          { category: 'subscriptions', currentAmount: 150, suggestedAmount: 100, reduction: 50 }
        ],
        preservedCategories: priorities || ['rent', 'groceries', 'utilities'],
        feasibilityScore: aggressiveness === 'aggressive' ? 85 : aggressiveness === 'moderate' ? 70 : 60
      };

      return {
        status: 'success',
        optimization
      };
    } catch (error) {
      logger.error({ error, userId }, 'Budget optimization failed');
      throw new Error(`Budget optimization failed: ${error.message}`);
    }
  }
});

export function registerBudgetTools(registry: ToolRegistry): void {
  try {
    // Register tools with enhanced metadata
    registry.registerTool({
      ...budgetAnalysisTool,
      category: 'budget',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 2000
    });

    registry.registerTool({
      ...budgetOptimizationTool,
      category: 'budget',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 3000
    });

    // Register aliases for common variations
    registry.registerTool({
      name: 'analyze_budget',
      ...budgetAnalysisTool,
      category: 'budget',
      riskLevel: 'low',
      requiresAuth: true
    });

    registry.registerTool({
      name: 'budget_performance',
      ...budgetAnalysisTool,
      category: 'budget', 
      riskLevel: 'low',
      requiresAuth: true
    });

    logger.info({ toolCount: 4 }, 'Budget tools registered successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to register budget tools');
    throw error;
  }
}