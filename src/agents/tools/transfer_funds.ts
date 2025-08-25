
import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/db.js';
import type { FinancialContext } from '../types.js';

// Transfer funds schema
const transferFundsSchema = z.object({
  fromEnvelopeId: z.string().min(1, 'Source envelope ID is required'),
  toEnvelopeId: z.string().min(1, 'Destination envelope ID is required'),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
});

export const transferFunds = tool({
  name: 'transfer_funds',
  description: 'Transfer funds between envelopes with validation and tracking',
  parameters: transferFundsSchema,
  async execute(params, context) {
    try {
      logger.info({ params }, 'Executing transfer funds tool');

      const { fromEnvelopeId, toEnvelopeId, amount, description, userId } = params;

      // Validate that source and destination are different
      if (fromEnvelopeId === toEnvelopeId) {
        return JSON.stringify({
          success: false,
          error: 'Cannot transfer funds to the same envelope'
        });
      }

      // Get both envelopes
      const [fromEnvelope, toEnvelope] = await Promise.all([
        prisma.envelope.findFirst({
          where: { id: fromEnvelopeId, userId }
        }),
        prisma.envelope.findFirst({
          where: { id: toEnvelopeId, userId }
        })
      ]);

      if (!fromEnvelope) {
        return JSON.stringify({
          success: false,
          error: 'Source envelope not found'
        });
      }

      if (!toEnvelope) {
        return JSON.stringify({
          success: false,
          error: 'Destination envelope not found'
        });
      }

      // Check if source envelope has sufficient funds
      if (fromEnvelope.balance < amount) {
        return JSON.stringify({
          success: false,
          error: `Insufficient funds in ${fromEnvelope.name}. Available: $${fromEnvelope.balance}, Requested: $${amount}`
        });
      }

      // Perform the transfer in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Update source envelope
        const updatedFromEnvelope = await tx.envelope.update({
          where: { id: fromEnvelopeId },
          data: { balance: fromEnvelope.balance - amount }
        });

        // Update destination envelope
        const updatedToEnvelope = await tx.envelope.update({
          where: { id: toEnvelopeId },
          data: { balance: toEnvelope.balance + amount }
        });

        // Create transfer record
        const transfer = await tx.transfer.create({
          data: {
            fromEnvelopeId,
            toEnvelopeId,
            amount,
            description: description || `Transfer from ${fromEnvelope.name} to ${toEnvelope.name}`,
            userId,
            status: 'completed'
          }
        });

        return {
          transfer,
          fromEnvelope: updatedFromEnvelope,
          toEnvelope: updatedToEnvelope
        };
      });

      logger.info({ transferId: result.transfer.id }, 'Funds transferred successfully');

      return JSON.stringify({
        success: true,
        transfer: {
          id: result.transfer.id,
          amount,
          fromEnvelope: {
            id: result.fromEnvelope.id,
            name: fromEnvelope.name,
            newBalance: result.fromEnvelope.balance
          },
          toEnvelope: {
            id: result.toEnvelope.id,
            name: toEnvelope.name,
            newBalance: result.toEnvelope.balance
          },
          description: result.transfer.description,
          timestamp: result.transfer.createdAt
        }
      });

    } catch (error) {
      logger.error({ error: error.message, params }, 'Error transferring funds');
      return JSON.stringify({
        success: false,
        error: 'Failed to transfer funds. Please try again.'
      });
    }
  }
});

export default transferFunds;
