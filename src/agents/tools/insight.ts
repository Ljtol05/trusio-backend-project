import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from './types.js';

const recommendationSchema = z.object({
  userId: z.string(),
  analysisType: z.enum(['spending', 'saving', 'investment', 'general']).default('general'),
});

export const generateRecommendationsTool = tool({
  name: 'generate_personalized_recommendations',
  description: 'Generate personalized financial recommendations based on user data',
  parameters: recommendationSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Generating personalized recommendations');

      const [transactions, envelopes] = await Promise.all([
        db.transaction.findMany({
          where: {
            userId: params.userId,
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          }
        }),
        db.envelope.findMany({ where: { userId: params.userId } })
      ]);

      const recommendations = [];

      if (transactions.length > 0) {
        const totalSpent = Math.abs(transactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + tx.amount, 0));
        recommendations.push({
          type: 'spending_analysis',
          description: `You've spent $${totalSpent.toFixed(2)} this month`,
          priority: 'medium'
        });
      }

      if (envelopes.length === 0) {
        recommendations.push({
          type: 'setup_budgets',
          description: 'Create budget envelopes to better track your spending',
          priority: 'high'
        });
      }

      return JSON.stringify({
        success: true,
        analysisType: params.analysisType,
        recommendations,
        summary: {
          totalRecommendations: recommendations.length
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

export function registerInsightTools(registry: any): void {
  registry.registerTool(generateRecommendationsTool);
  logger.info('Financial insight tools registered');
}