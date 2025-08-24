
import { z } from 'zod';
import { defineTool } from '@openai/agents';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext, FinancialContext } from './types.js';

// Zod schemas for validation
const CreateEnvelopeInputSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  name: z.string().min(1, 'Envelope name is required').max(100),
  targetAmount: z.number().min(0, 'Target amount must be positive'),
  category: z.string().optional(),
  description: z.string().optional(),
});

const TransferFundsInputSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  fromEnvelopeId: z.string().min(1, 'Source envelope ID is required'),
  toEnvelopeId: z.string().min(1, 'Destination envelope ID is required'),
  amount: z.number().min(0.01, 'Transfer amount must be positive'),
  description: z.string().optional(),
});

const ManageBalanceInputSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  envelopeId: z.string().min(1, 'Envelope ID is required'),
  action: z.enum(['add', 'subtract', 'set']),
  amount: z.number().min(0, 'Amount must be positive'),
  description: z.string().optional(),
});

// Define tools using OpenAI SDK pattern
export const createEnvelopeTool = defineTool({
  name: 'create_envelope',
  description: 'Creates a new budget envelope with specified target amount and category',
  parameters: CreateEnvelopeInputSchema,
  execute: async (input, context: ToolExecutionContext & FinancialContext) => {
    try {
      const { userId, name, targetAmount, category, description } = input;
      
      logger.info({ userId, name, targetAmount, category }, 'Creating new envelope');

      // Check if envelope with same name already exists
      const existingEnvelope = await db.envelope.findFirst({
        where: {
          userId,
          name: {
            equals: name,
            mode: 'insensitive',
          },
        },
      });

      if (existingEnvelope) {
        throw new Error(`Envelope with name "${name}" already exists`);
      }

      // Create the envelope
      const envelope = await db.envelope.create({
        data: {
          userId,
          name,
          targetAmount,
          balance: 0, // Start with zero balance
          category: category || 'general',
          description,
        },
      });

      // Get updated envelope count for user
      const envelopeCount = await db.envelope.count({
        where: { userId },
      });

      logger.info({ envelopeId: envelope.id, userId }, 'Envelope created successfully');

      return {
        success: true,
        envelope: {
          id: envelope.id,
          name: envelope.name,
          targetAmount: envelope.targetAmount,
          balance: envelope.balance,
          category: envelope.category,
          description: envelope.description,
          createdAt: envelope.createdAt.toISOString(),
        },
        totalEnvelopes: envelopeCount,
        recommendations: [
          `Consider setting up automatic transfers to reach your $${targetAmount} target`,
          'Track spending against this envelope to stay within budget',
        ],
      };

    } catch (error: any) {
      logger.error({ error, input }, 'Failed to create envelope');
      throw new Error(`Failed to create envelope: ${error.message}`);
    }
  },
});

export const transferFundsTool = defineTool({
  name: 'transfer_funds',
  description: 'Transfers funds between two budget envelopes',
  parameters: TransferFundsInputSchema,
  execute: async (input, context: ToolExecutionContext & FinancialContext) => {
    try {
      const { userId, fromEnvelopeId, toEnvelopeId, amount, description } = input;
      
      logger.info({ userId, fromEnvelopeId, toEnvelopeId, amount }, 'Transferring funds between envelopes');

      if (fromEnvelopeId === toEnvelopeId) {
        throw new Error('Cannot transfer funds to the same envelope');
      }

      // Get both envelopes and verify ownership
      const [fromEnvelope, toEnvelope] = await Promise.all([
        db.envelope.findFirst({
          where: { id: fromEnvelopeId, userId },
        }),
        db.envelope.findFirst({
          where: { id: toEnvelopeId, userId },
        }),
      ]);

      if (!fromEnvelope) {
        throw new Error('Source envelope not found');
      }

      if (!toEnvelope) {
        throw new Error('Destination envelope not found');
      }

      if (fromEnvelope.balance < amount) {
        throw new Error(`Insufficient funds in ${fromEnvelope.name}. Available: $${fromEnvelope.balance}`);
      }

      // Perform the transfer in a transaction
      const result = await db.$transaction(async (prisma) => {
        // Update source envelope
        const updatedFromEnvelope = await prisma.envelope.update({
          where: { id: fromEnvelopeId },
          data: {
            balance: {
              decrement: amount,
            },
          },
        });

        // Update destination envelope
        const updatedToEnvelope = await prisma.envelope.update({
          where: { id: toEnvelopeId },
          data: {
            balance: {
              increment: amount,
            },
          },
        });

        // Create transfer record
        const transfer = await prisma.transfer.create({
          data: {
            userId,
            fromEnvelopeId,
            toEnvelopeId,
            amount,
            description: description || `Transfer from ${fromEnvelope.name} to ${toEnvelope.name}`,
          },
        });

        return {
          transfer,
          fromEnvelope: updatedFromEnvelope,
          toEnvelope: updatedToEnvelope,
        };
      });

      logger.info({ transferId: result.transfer.id, userId }, 'Funds transferred successfully');

      return {
        success: true,
        transfer: {
          id: result.transfer.id,
          amount,
          description: result.transfer.description,
          createdAt: result.transfer.createdAt.toISOString(),
        },
        fromEnvelope: {
          id: result.fromEnvelope.id,
          name: fromEnvelope.name,
          newBalance: result.fromEnvelope.balance,
          targetAmount: result.fromEnvelope.targetAmount,
        },
        toEnvelope: {
          id: result.toEnvelope.id,
          name: toEnvelope.name,
          newBalance: result.toEnvelope.balance,
          targetAmount: result.toEnvelope.targetAmount,
        },
        recommendations: generateTransferRecommendations(result.fromEnvelope, result.toEnvelope),
      };

    } catch (error: any) {
      logger.error({ error, input }, 'Failed to transfer funds');
      throw new Error(`Failed to transfer funds: ${error.message}`);
    }
  },
});

export const manageBalanceTool = defineTool({
  name: 'manage_balance',
  description: 'Adds, subtracts, or sets the balance of a budget envelope',
  parameters: ManageBalanceInputSchema,
  execute: async (input, context: ToolExecutionContext & FinancialContext) => {
    try {
      const { userId, envelopeId, action, amount, description } = input;
      
      logger.info({ userId, envelopeId, action, amount }, 'Managing envelope balance');

      // Get the envelope and verify ownership
      const envelope = await db.envelope.findFirst({
        where: { id: envelopeId, userId },
      });

      if (!envelope) {
        throw new Error('Envelope not found');
      }

      // Calculate new balance based on action
      let newBalance: number;
      let changeAmount: number;

      switch (action) {
        case 'add':
          newBalance = envelope.balance + amount;
          changeAmount = amount;
          break;
        case 'subtract':
          if (envelope.balance < amount) {
            throw new Error(`Insufficient funds. Current balance: $${envelope.balance}`);
          }
          newBalance = envelope.balance - amount;
          changeAmount = -amount;
          break;
        case 'set':
          newBalance = amount;
          changeAmount = amount - envelope.balance;
          break;
        default:
          throw new Error('Invalid action');
      }

      if (newBalance < 0) {
        throw new Error('Balance cannot be negative');
      }

      // Update the envelope balance
      const updatedEnvelope = await db.envelope.update({
        where: { id: envelopeId },
        data: { balance: newBalance },
      });

      // Create a transaction record for the balance change
      await db.transaction.create({
        data: {
          userId,
          amount: changeAmount,
          description: description || `Balance ${action}: ${envelope.name}`,
          category: envelope.category || 'envelope_management',
          type: changeAmount > 0 ? 'credit' : 'debit',
        },
      });

      logger.info({ envelopeId, newBalance, userId }, 'Envelope balance updated successfully');

      // Calculate progress towards target
      const progressPercentage = envelope.targetAmount > 0 
        ? (newBalance / envelope.targetAmount) * 100 
        : 0;

      return {
        success: true,
        envelope: {
          id: updatedEnvelope.id,
          name: updatedEnvelope.name,
          previousBalance: envelope.balance,
          newBalance: updatedEnvelope.balance,
          targetAmount: updatedEnvelope.targetAmount,
          progressPercentage,
          category: updatedEnvelope.category,
        },
        change: {
          action,
          amount: changeAmount,
          description: description || `Balance ${action}`,
        },
        insights: generateBalanceInsights(updatedEnvelope, envelope, action),
      };

    } catch (error: any) {
      logger.error({ error, input }, 'Failed to manage envelope balance');
      throw new Error(`Failed to manage envelope balance: ${error.message}`);
    }
  },
});

// Helper functions
function generateTransferRecommendations(fromEnvelope: any, toEnvelope: any): string[] {
  const recommendations: string[] = [];
  
  // Check if source envelope is getting low
  if (fromEnvelope.targetAmount > 0) {
    const remainingPercent = (fromEnvelope.balance / fromEnvelope.targetAmount) * 100;
    if (remainingPercent < 20) {
      recommendations.push(`Consider replenishing ${fromEnvelope.name} - now at ${remainingPercent.toFixed(1)}% of target`);
    }
  }
  
  // Check if destination envelope is approaching target
  if (toEnvelope.targetAmount > 0) {
    const progressPercent = (toEnvelope.balance / toEnvelope.targetAmount) * 100;
    if (progressPercent >= 80) {
      recommendations.push(`${toEnvelope.name} is ${progressPercent.toFixed(1)}% funded - great progress!`);
    }
  }
  
  return recommendations;
}

function generateBalanceInsights(updatedEnvelope: any, originalEnvelope: any, action: string): string[] {
  const insights: string[] = [];
  
  const progressPercentage = updatedEnvelope.targetAmount > 0 
    ? (updatedEnvelope.balance / updatedEnvelope.targetAmount) * 100 
    : 0;
  
  if (action === 'add') {
    insights.push(`Added funds to ${updatedEnvelope.name}`);
    if (progressPercentage >= 100) {
      insights.push('🎉 Envelope target reached!');
    } else if (progressPercentage >= 75) {
      insights.push('🎯 Envelope is nearly funded');
    }
  } else if (action === 'subtract') {
    insights.push(`Withdrew funds from ${updatedEnvelope.name}`);
    if (progressPercentage < 50) {
      insights.push('⚠️ Envelope is below 50% of target');
    }
  }
  
  // Add progress insight
  if (updatedEnvelope.targetAmount > 0) {
    insights.push(`Current progress: ${progressPercentage.toFixed(1)}% of target ($${updatedEnvelope.balance}/$${updatedEnvelope.targetAmount})`);
  }
  
  return insights;
}

// Export tool instances for registration
export const createEnvelope = createEnvelopeTool;
export const transferFunds = transferFundsTool;
export const manageBalance = manageBalanceTool;
