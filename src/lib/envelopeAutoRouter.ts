
import { logger } from './logger.js';
import { db } from './db.js';

export interface AutoRouteRule {
  envelopeId: string;
  percentage: number;
  condition?: 'always' | 'income_only' | 'specific_amount';
}

class EnvelopeAutoRouter {
  // Route funds to auto-allocation envelopes when income is added (NOT for spending transactions)
  async routeIncomeFunds(
    userId: string, 
    totalIncome: number,
    transactionId?: string,
    transactionType: 'INCOME' | 'DEPOSIT' = 'INCOME'
  ): Promise<{
    routedAmount: number;
    distributions: Array<{
      envelopeId: string;
      envelopeName: string;
      amount: number;
      percentage: number;
      isFromIncome: boolean;
    }>;
  }> {
    try {
      logger.info({ userId, totalIncome }, 'Processing automatic fund routing');

      // Get all auto-allocation envelopes for this user
      const autoEnvelopes = await db.envelope.findMany({
        where: { 
          userId, 
          autoAllocate: true,
          allocationPercentage: { not: null }
        },
        select: {
          id: true,
          name: true,
          allocationPercentage: true,
          category: true,
        }
      });

      if (autoEnvelopes.length === 0) {
        logger.debug({ userId }, 'No auto-allocation envelopes found');
        return { routedAmount: 0, distributions: [] };
      }

      const distributions = [];
      let totalRouted = 0;

      // Process each auto-allocation envelope
      for (const envelope of autoEnvelopes) {
        const percentage = envelope.allocationPercentage!;
        const amount = (totalIncome * percentage) / 100;
        
        // Update envelope balance (convert to cents)
        await db.envelope.update({
          where: { id: envelope.id },
          data: {
            balanceCents: { increment: Math.round(amount * 100) }
          }
        });

        // Create transfer record
        await db.transfer.create({
          data: {
            userId,
            fromEnvelopeId: null, // Income source
            toEnvelopeId: envelope.id,
            amount,
            description: `Auto-allocation (${percentage}% of income)`,
            category: 'auto_route',
            sourceTransactionId: transactionId,
          }
        });

        distributions.push({
          envelopeId: envelope.id,
          envelopeName: envelope.name,
          amount,
          percentage,
          isFromIncome: true, // This is specifically for income-based auto-routing
        });

        totalRouted += amount;

        logger.debug({
          userId,
          envelopeId: envelope.id,
          envelopeName: envelope.name,
          amount,
          percentage
        }, 'Auto-routed funds to envelope');
      }

      logger.info({
        userId,
        totalRouted,
        envelopeCount: distributions.length,
        distributions: distributions.map(d => `${d.envelopeName}: ${d.percentage}%`)
      }, 'Automatic fund routing completed');

      return { routedAmount: totalRouted, distributions };

    } catch (error) {
      logger.error({ error, userId, totalIncome }, 'Auto-routing failed');
      throw error;
    }
  }

  // Get user's auto-routing configuration
  async getAutoRoutingConfig(userId: string): Promise<{
    hasAutoRouting: boolean;
    totalPercentage: number;
    envelopes: Array<{
      id: string;
      name: string;
      percentage: number;
      category: string;
    }>;
    hasTitheRouting: boolean;
  }> {
    try {
      const autoEnvelopes = await db.envelope.findMany({
        where: { 
          userId, 
          autoAllocate: true,
          allocationPercentage: { not: null }
        },
        select: {
          id: true,
          name: true,
          allocationPercentage: true,
          category: true,
        }
      });

      const totalPercentage = autoEnvelopes.reduce(
        (sum, env) => sum + (env.allocationPercentage || 0), 
        0
      );

      const hasTitheRouting = autoEnvelopes.some(
        env => env.category === 'giving' && env.allocationPercentage === 10
      );

      return {
        hasAutoRouting: autoEnvelopes.length > 0,
        totalPercentage,
        envelopes: autoEnvelopes.map(env => ({
          id: env.id,
          name: env.name,
          percentage: env.allocationPercentage!,
          category: env.category || 'general',
        })),
        hasTitheRouting,
      };

    } catch (error) {
      logger.error({ error, userId }, 'Failed to get auto-routing config');
      throw error;
    }
  }

  // Update envelope auto-routing settings
  async updateEnvelopeAutoRouting(
    envelopeId: string,
    userId: string,
    autoAllocate: boolean,
    percentage?: number
  ): Promise<void> {
    try {
      // Verify envelope ownership
      const envelope = await db.envelope.findFirst({
        where: { id: envelopeId, userId }
      });

      if (!envelope) {
        throw new Error('Envelope not found or access denied');
      }

      await db.envelope.update({
        where: { id: envelopeId },
        data: {
          autoAllocate,
          allocationPercentage: autoAllocate ? percentage : null,
        }
      });

      logger.info({
        userId,
        envelopeId,
        autoAllocate,
        percentage
      }, 'Envelope auto-routing updated');

    } catch (error) {
      logger.error({ error, userId, envelopeId }, 'Failed to update auto-routing');
      throw error;
    }
  }
}

export const envelopeAutoRouter = new EnvelopeAutoRouter();
