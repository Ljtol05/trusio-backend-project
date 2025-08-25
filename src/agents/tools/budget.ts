import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from './types.js';

const budgetAnalysisSchema = z.object({
  userId: z.string(),
  period: z.enum(['monthly', 'quarterly', 'yearly']).default('monthly'),
  categories: z.array(z.string()).optional(),
});

export const budgetAnalysisTool = tool({
  name: 'budget_analysis',
  description: 'Analyze budget performance and provide spending insights',
  parameters: budgetAnalysisSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Executing budget analysis');

      // Fetch user's envelopes (budgets)
      const envelopes = await db.envelope.findMany({
        where: { userId: params.userId },
        include: {
          transactions: {
            where: {
              createdAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
              }
            }
          }
        }
      });

      if (envelopes.length === 0) {
        return JSON.stringify({
          success: false,
          message: 'No budget envelopes found. Please create budget categories first.',
          recommendations: ['Create budget envelopes for different spending categories']
        });
      }

      const analysis = envelopes.map(envelope => {
        const spent = envelope.transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const remaining = envelope.budgetAmount - spent;
        const usagePercentage = (spent / envelope.budgetAmount) * 100;

        return {
          category: envelope.name,
          budgeted: envelope.budgetAmount,
          spent: spent,
          remaining: remaining,
          usagePercentage: Math.round(usagePercentage),
          status: usagePercentage > 100 ? 'over_budget' : 
                  usagePercentage > 80 ? 'warning' : 'on_track'
        };
      });

      const totalBudgeted = envelopes.reduce((sum, e) => sum + e.budgetAmount, 0);
      const totalSpent = analysis.reduce((sum, a) => sum + a.spent, 0);

      return JSON.stringify({
        success: true,
        period: params.period,
        totalBudgeted,
        totalSpent,
        totalRemaining: totalBudgeted - totalSpent,
        overallUsage: Math.round((totalSpent / totalBudgeted) * 100),
        categoryBreakdown: analysis,
        insights: [
          `Total spent: $${totalSpent.toFixed(2)} of $${totalBudgeted.toFixed(2)}`,
          `You have ${analysis.filter(a => a.status === 'over_budget').length} categories over budget`
        ]
      });

    } catch (error: any) {
      logger.error({ error, params }, 'Budget analysis failed');
      return JSON.stringify({
        success: false,
        error: 'Failed to analyze budget data',
        details: error.message
      });
    }
  }
});

export function registerBudgetTools(registry: any): void {
  registry.registerTool(budgetAnalysisTool);
  logger.info('Budget analysis tools registered');
}