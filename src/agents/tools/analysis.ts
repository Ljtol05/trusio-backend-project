import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from './types.js';

const budgetVarianceSchema = z.object({
  userId: z.string(),
  period: z.enum(['current_month', 'last_month', 'quarter']).default('current_month'),
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

        return {
          category: envelope.name,
          budgeted,
          actualSpent,
          variance,
          status: variance < 0 ? 'over_budget' : 'on_track'
        };
      });

      return JSON.stringify({
        success: true,
        period: params.period,
        categoryVariances: variances,
        recommendations: variances
          .filter(v => v.status === 'over_budget')
          .map(v => `Review spending in ${v.category} - you're over budget`)
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
  registry.registerTool(budgetVarianceTool);
  logger.info('Financial analysis tools registered');
}