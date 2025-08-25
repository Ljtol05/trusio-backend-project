import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';

const createEnvelopeSchema = z.object({
  userId: z.string().describe('User ID who owns the envelope'),
  name: z.string().min(1).describe('Name of the envelope'),
  targetAmount: z.number().positive().describe('Target amount for the envelope'),
  category: z.string().optional().describe('Category of the envelope'),
  description: z.string().optional().describe('Description of envelope purpose'),
  priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Envelope priority level')
});

const manageBalanceSchema = z.object({
  userId: z.string().describe('User ID'),
  envelopeId: z.string().describe('Envelope ID to manage'),
  action: z.enum(['add', 'withdraw', 'view']).describe('Action to perform'),
  amount: z.number().positive().optional().describe('Amount for add/withdraw actions'),
  description: z.string().optional().describe('Description of the transaction')
});

const transferFundsSchema = z.object({
  userId: z.string().describe('User ID'),
  fromEnvelopeId: z.string().describe('Source envelope ID'),
  toEnvelopeId: z.string().describe('Destination envelope ID'),
  amount: z.number().positive().describe('Amount to transfer'),
  reason: z.string().optional().describe('Reason for transfer')
});

const createEnvelopeTool = tool({
  name: 'create_envelope',
  description: 'Create a new envelope for budget allocation, savings tracking, and financial goal management',
  parameters: createEnvelopeSchema,
  async execute({ userId, name, targetAmount, category, description, priority }) {
    try {
      logger.info({ userId, name, targetAmount, category, priority }, 'Creating envelope');

      // TODO: Implement actual envelope creation with Prisma
      const envelope = {
        id: `env_${Date.now()}`,
        name,
        targetAmount,
        currentAmount: 0,
        category: category || 'general',
        description,
        priority,
        userId,
        createdAt: new Date().toISOString(),
        progressPercentage: 0,
        isActive: true
      };

      return {
        status: 'success',
        envelope,
        message: `Envelope "${name}" created successfully with target of $${targetAmount}`
      };
    } catch (error) {
      logger.error({ error, userId, name }, 'Envelope creation failed');
      throw new Error(`Envelope creation failed: ${error.message}`);
    }
  }
});

const manageBalanceTool = tool({
  name: 'manage_balance',
  description: 'Add funds to, withdraw from, or view balance of an envelope',
  parameters: manageBalanceSchema,
  async execute({ userId, envelopeId, action, amount, description }) {
    try {
      logger.info({ userId, envelopeId, action, amount }, 'Managing envelope balance');

      // TODO: Implement actual balance management with Prisma
      const currentBalance = 500; // Mock current balance

      let newBalance = currentBalance;
      let transaction = null;

      if (action === 'add' && amount) {
        newBalance = currentBalance + amount;
        transaction = {
          id: `txn_${Date.now()}`,
          type: 'deposit',
          amount,
          description: description || 'Envelope deposit',
          timestamp: new Date().toISOString()
        };
      } else if (action === 'withdraw' && amount) {
        if (amount > currentBalance) {
          throw new Error('Insufficient funds in envelope');
        }
        newBalance = currentBalance - amount;
        transaction = {
          id: `txn_${Date.now()}`,
          type: 'withdrawal',
          amount,
          description: description || 'Envelope withdrawal',
          timestamp: new Date().toISOString()
        };
      }

      return {
        status: 'success',
        action,
        previousBalance: currentBalance,
        newBalance,
        transaction,
        envelope: {
          id: envelopeId,
          currentAmount: newBalance,
          progressPercentage: Math.min((newBalance / 1000) * 100, 100) // Mock target of 1000
        }
      };
    } catch (error) {
      logger.error({ error, userId, envelopeId, action }, 'Balance management failed');
      throw new Error(`Balance management failed: ${error.message}`);
    }
  }
});

const transferFundsTool = tool({
  name: 'transfer_funds',
  description: 'Transfer funds between envelopes for budget reallocation',
  parameters: transferFundsSchema,
  async execute({ userId, fromEnvelopeId, toEnvelopeId, amount, reason }) {
    try {
      logger.info({ userId, fromEnvelopeId, toEnvelopeId, amount }, 'Transferring funds between envelopes');

      // TODO: Implement actual fund transfer with Prisma
      const sourceBalance = 500; // Mock balance
      const destinationBalance = 300; // Mock balance

      if (amount > sourceBalance) {
        throw new Error('Insufficient funds in source envelope');
      }

      const newSourceBalance = sourceBalance - amount;
      const newDestinationBalance = destinationBalance + amount;

      const transfer = {
        id: `transfer_${Date.now()}`,
        fromEnvelopeId,
        toEnvelopeId,
        amount,
        reason: reason || 'Envelope transfer',
        timestamp: new Date().toISOString(),
        status: 'completed'
      };

      return {
        status: 'success',
        transfer,
        sourceEnvelope: {
          id: fromEnvelopeId,
          previousBalance: sourceBalance,
          newBalance: newSourceBalance
        },
        destinationEnvelope: {
          id: toEnvelopeId,
          previousBalance: destinationBalance,
          newBalance: newDestinationBalance
        }
      };
    } catch (error) {
      logger.error({ error, userId, fromEnvelopeId, toEnvelopeId }, 'Fund transfer failed');
      throw new Error(`Fund transfer failed: ${error.message}`);
    }
  }
});

export function registerEnvelopeTools(registry: ToolRegistry): void {
  try {
    // Register tools with enhanced metadata
    registry.registerTool({
      ...createEnvelopeTool,
      category: 'envelope',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 1500
    });

    registry.registerTool({
      ...manageBalanceTool,
      category: 'envelope',
      riskLevel: 'medium',
      requiresAuth: true,
      estimatedDuration: 2000
    });

    registry.registerTool({
      ...transferFundsTool,
      category: 'envelope',
      riskLevel: 'medium',
      requiresAuth: true,
      estimatedDuration: 2500
    });

    // Register aliases
    registry.registerTool({
      name: 'envelope_transfer',
      ...transferFundsTool,
      category: 'envelope',
      riskLevel: 'medium',
      requiresAuth: true
    });

    registry.registerTool({
      name: 'envelope_balance',
      ...manageBalanceTool,
      category: 'envelope',
      riskLevel: 'medium',
      requiresAuth: true
    });

    logger.info({ toolCount: 5 }, 'Envelope tools registered successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to register envelope tools');
    throw error;
  }
}