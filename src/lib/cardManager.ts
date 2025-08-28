
import { logger } from './logger.js';
import { db } from './db.js';

export interface CardUsageMetrics {
  totalSpent: number;
  transactionCount: number;
  avgTransactionSize: number;
  daysActive: number;
  lastUsed: Date | null;
  spendingVelocity: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface CardLimitCheck {
  withinDailyLimit: boolean;
  withinMonthlyLimit: boolean;
  withinSpendingLimit: boolean;
  remainingDaily: number;
  remainingMonthly: number;
  remainingTotal: number;
}

class CardManager {
  private readonly MAX_CARDS_PER_USER = 4;

  async validateCardCount(userId: string): Promise<{
    currentCount: number;
    canCreateMore: boolean;
    remainingSlots: number;
  }> {
    try {
      const currentCount = await db.card.count({
        where: { userId, status: { not: 'CANCELED' } }
      });

      return {
        currentCount,
        canCreateMore: currentCount < this.MAX_CARDS_PER_USER,
        remainingSlots: Math.max(0, this.MAX_CARDS_PER_USER - currentCount),
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to validate card count');
      throw error;
    }
  }

  async getCardUsageMetrics(cardId: number, days = 30): Promise<CardUsageMetrics> {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const card = await db.card.findUnique({
        where: { id: cardId },
        include: {
          transactions: {
            where: {
              createdAt: { gte: startDate },
              status: 'SETTLED',
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!card) {
        throw new Error('Card not found');
      }

      const transactions = card.transactions;
      const totalSpent = transactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0);
      const transactionCount = transactions.length;
      const avgTransactionSize = transactionCount > 0 ? totalSpent / transactionCount : 0;

      // Calculate days with transactions
      const daysActive = new Set(
        transactions.map(txn => txn.createdAt.toISOString().split('T')[0])
      ).size;

      // Calculate spending velocity (spending per active day)
      const spendingVelocity = daysActive > 0 ? totalSpent / daysActive : 0;

      // Determine risk level based on spending patterns
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      const recentTransactions = transactions.slice(0, 10);
      const recentSpending = recentTransactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0);
      const recentVelocity = recentTransactions.length > 0 ? recentSpending / Math.min(10, daysActive) : 0;

      if (recentVelocity > spendingVelocity * 1.5) {
        riskLevel = 'high';
      } else if (recentVelocity > spendingVelocity * 1.2) {
        riskLevel = 'medium';
      }

      return {
        totalSpent: totalSpent / 100, // Convert to dollars
        transactionCount,
        avgTransactionSize: avgTransactionSize / 100,
        daysActive,
        lastUsed: card.lastUsed,
        spendingVelocity: spendingVelocity / 100,
        riskLevel,
      };
    } catch (error) {
      logger.error({ error, cardId }, 'Failed to get card usage metrics');
      throw error;
    }
  }

  async checkSpendingLimits(cardId: number, transactionAmount: number): Promise<CardLimitCheck> {
    try {
      const card = await db.card.findUnique({
        where: { id: cardId },
        include: {
          transactions: {
            where: {
              status: 'SETTLED',
              createdAt: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)), // Today
              },
            },
          },
        },
      });

      if (!card) {
        throw new Error('Card not found');
      }

      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Get daily spending
      const dailySpent = card.transactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0);

      // Get monthly spending
      const monthlyTransactions = await db.transaction.findMany({
        where: {
          cardId,
          status: 'SETTLED',
          createdAt: { gte: startOfMonth },
        },
      });
      const monthlySpent = monthlyTransactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0);

      // Check limits
      const dailyLimit = card.dailyLimitCents || Infinity;
      const monthlyLimit = card.monthlyLimitCents || Infinity;
      const spendingLimit = card.spendingLimitCents || Infinity;

      const withinDailyLimit = (dailySpent + transactionAmount) <= dailyLimit;
      const withinMonthlyLimit = (monthlySpent + transactionAmount) <= monthlyLimit;
      const withinSpendingLimit = (card.totalSpentCents + transactionAmount) <= spendingLimit;

      return {
        withinDailyLimit,
        withinMonthlyLimit,
        withinSpendingLimit,
        remainingDaily: Math.max(0, dailyLimit - dailySpent),
        remainingMonthly: Math.max(0, monthlyLimit - monthlySpent),
        remainingTotal: Math.max(0, spendingLimit - card.totalSpentCents),
      };
    } catch (error) {
      logger.error({ error, cardId }, 'Failed to check spending limits');
      throw error;
    }
  }

  async updateCardUsage(cardId: number, transactionAmount: number): Promise<void> {
    try {
      await db.card.update({
        where: { id: cardId },
        data: {
          lastUsed: new Date(),
          totalTransactions: { increment: 1 },
          totalSpentCents: { increment: Math.abs(transactionAmount) },
        },
      });

      logger.info({ cardId, transactionAmount }, 'Card usage updated');
    } catch (error) {
      logger.error({ error, cardId }, 'Failed to update card usage');
      throw error;
    }
  }

  async getCardRecommendations(userId: string): Promise<{
    unusedCards: Array<{ cardId: number; last4: string; label: string; daysUnused: number }>;
    overusedCards: Array<{ cardId: number; last4: string; label: string; riskLevel: string }>;
    optimizationSuggestions: string[];
  }> {
    try {
      const cards = await db.card.findMany({
        where: { userId, status: 'ACTIVE' },
        include: {
          transactions: {
            where: {
              createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              status: 'SETTLED',
            },
          },
        },
      });

      const unusedCards = [];
      const overusedCards = [];
      const suggestions = [];

      for (const card of cards) {
        const metrics = await this.getCardUsageMetrics(card.id);
        
        if (metrics.transactionCount === 0) {
          const daysUnused = card.lastUsed 
            ? Math.floor((Date.now() - card.lastUsed.getTime()) / (1000 * 60 * 60 * 24))
            : 30;
          
          unusedCards.push({
            cardId: card.id,
            last4: card.last4,
            label: card.label,
            daysUnused,
          });
        }

        if (metrics.riskLevel === 'high') {
          overusedCards.push({
            cardId: card.id,
            last4: card.last4,
            label: card.label,
            riskLevel: metrics.riskLevel,
          });
        }
      }

      // Generate suggestions
      if (unusedCards.length > 0) {
        suggestions.push(`You have ${unusedCards.length} unused cards. Consider removing them or linking to different envelopes.`);
      }
      if (overusedCards.length > 0) {
        suggestions.push(`${overusedCards.length} cards show increased spending. Review recent transactions.`);
      }
      if (cards.length < this.MAX_CARDS_PER_USER) {
        suggestions.push(`You can create ${this.MAX_CARDS_PER_USER - cards.length} more virtual cards.`);
      }

      return {
        unusedCards,
        overusedCards,
        optimizationSuggestions: suggestions,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get card recommendations');
      throw error;
    }
  }
}

export const cardManager = new CardManager();
