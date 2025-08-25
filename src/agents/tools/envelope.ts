import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from './types.js';

const createEnvelopeSchema = z.object({
  userId: z.string(),
  name: z.string(),
  budgetAmount: z.number().positive(),
  category: z.string(),
  description: z.string().optional(),
});

export const createEnvelopeTool = tool({
  name: 'create_envelope',
  description: 'Create a new budget envelope for expense tracking',
  parameters: createEnvelopeSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Creating new envelope');

      const envelope = await db.envelope.create({
        data: {
          userId: params.userId,
          name: params.name,
          budgetAmount: params.budgetAmount,
          currentAmount: params.budgetAmount,
          category: params.category,
          description: params.description,
        }
      });

      return JSON.stringify({
        success: true,
        envelope: {
          id: envelope.id,
          name: envelope.name,
          budgetAmount: envelope.budgetAmount,
          currentAmount: envelope.currentAmount,
          category: envelope.category,
        },
        message: `Successfully created envelope "${params.name}" with budget of $${params.budgetAmount}`
      });

    } catch (error: any) {
      logger.error({ error, params }, 'Failed to create envelope');
      return JSON.stringify({
        success: false,
        error: 'Failed to create envelope',
        details: error.message
      });
    }
  }
});

export function registerEnvelopeTools(registry: any): void {
  registry.registerTool(createEnvelopeTool);
  logger.info('Envelope management tools registered');
}