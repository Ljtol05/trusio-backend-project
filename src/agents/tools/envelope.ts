
import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from '../core/ToolRegistry.js';

const createEnvelopeSchema = z.object({
  userId: z.string(),
  name: z.string(),
  budgetAmount: z.number().positive(),
  category: z.string(),
  description: z.string().optional(),
});

const transferFundsSchema = z.object({
  userId: z.string(),
  fromEnvelopeId: z.string(),
  toEnvelopeId: z.string(),
  amount: z.number().positive(),
  reason: z.string().optional(),
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

export const transferFundsTool = tool({
  name: 'transfer_envelope_funds',
  description: 'Transfer funds between budget envelopes',
  parameters: transferFundsSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Transferring funds between envelopes');

      // Validate envelopes exist and belong to user
      const [fromEnvelope, toEnvelope] = await Promise.all([
        db.envelope.findFirst({ where: { id: params.fromEnvelopeId, userId: params.userId } }),
        db.envelope.findFirst({ where: { id: params.toEnvelopeId, userId: params.userId } })
      ]);

      if (!fromEnvelope || !toEnvelope) {
        return JSON.stringify({
          success: false,
          error: 'One or both envelopes not found'
        });
      }

      if (fromEnvelope.currentAmount < params.amount) {
        return JSON.stringify({
          success: false,
          error: `Insufficient funds in ${fromEnvelope.name}. Available: $${fromEnvelope.currentAmount}`
        });
      }

      // Perform the transfer
      await db.$transaction([
        db.envelope.update({
          where: { id: params.fromEnvelopeId },
          data: { currentAmount: { decrement: params.amount } }
        }),
        db.envelope.update({
          where: { id: params.toEnvelopeId },
          data: { currentAmount: { increment: params.amount } }
        })
      ]);

      return JSON.stringify({
        success: true,
        transfer: {
          from: fromEnvelope.name,
          to: toEnvelope.name,
          amount: params.amount,
          reason: params.reason
        },
        message: `Successfully transferred $${params.amount} from ${fromEnvelope.name} to ${toEnvelope.name}`
      });

    } catch (error: any) {
      logger.error({ error, params }, 'Failed to transfer funds');
      return JSON.stringify({
        success: false,
        error: 'Failed to transfer funds',
        details: error.message
      });
    }
  }
});

export function registerEnvelopeTools(registry: any): void {
  registry.registerTool(createEnvelopeTool);
  registry.registerTool(transferFundsTool);
  logger.info('Envelope management tools registered');
}
