import { logger } from './logger.js';
import { db } from './db.js';
import { mccDatabase, TransactionSuggestion, SplitSuggestion } from './mccDatabase.js';
import { envelopeAutoRouter } from './envelopeAutoRouter.js';

export interface PendingTransaction {
  id: string;
  externalId: string;
  merchant: string;
  amount: number;
  mcc?: string;
  location?: string;
  status: 'PENDING' | 'REQUIRES_CATEGORIZATION';
  authorizedAt: Date;
  suggestions: TransactionSuggestion[];
  splitSuggestion?: SplitSuggestion;
  canSplit: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface TransactionChoice {
  type: 'single' | 'split';
  envelopeId?: string;
  splits?: Array<{
    envelopeId: string;
    percentage: number;
  }>;
}

class TransactionIntelligence {
  private readonly PENDING_EXPIRY_HOURS = 24;

  async processPendingTransaction(
    userId: string,
    transactionData: {
      externalId: string;
      merchant: string;
      amount: number;
      mcc?: string;
      location?: string;
      authorizedAt?: Date;
    }
  ): Promise<{
    transactionId: string;
    suggestions: TransactionSuggestion[];
    splitSuggestion?: SplitSuggestion;
    requiresUserChoice: boolean;
    autoProcessed: boolean;
  }> {
    try {
      logger.info({
        userId,
        merchant: transactionData.merchant,
        amount: transactionData.amount,
        mcc: transactionData.mcc
      }, 'Processing pending transaction');

      // Get user context
      const userContext = await this.getUserContext(userId);

      // Generate suggestions using MCC database
      const intelligenceResult = await mccDatabase.generateTransactionSuggestions(
        transactionData,
        userContext.envelopes,
        {
          hasTitheEnvelope: userContext.hasTitheEnvelope,
          userType: userContext.userType,
        }
      );

      // Create pending transaction record
      const pendingTransaction = await db.transaction.create({
        data: {
          userId,
          externalId: transactionData.externalId,
          merchant: transactionData.merchant,
          amountCents: Math.round(transactionData.amount * 100),
          mcc: transactionData.mcc,
          location: transactionData.location,
          status: 'PENDING',
          authorizedAt: transactionData.authorizedAt || new Date(),
          envelopeId: null, // Will be set when user makes choice
          wasHold: true,
          holdAmountCents: Math.round(transactionData.amount * 100),
        }
      });

      // Store suggestions in metadata (could be separate table in production)
      const suggestionData = {
        suggestions: intelligenceResult.suggestions,
        splitSuggestion: intelligenceResult.splitSuggestion,
        canSplit: intelligenceResult.canSplit,
        expiresAt: new Date(Date.now() + (this.PENDING_EXPIRY_HOURS * 60 * 60 * 1000)),
      };

      // Check if we can auto-process (high confidence single suggestion)
      const autoProcessable = this.canAutoProcess(intelligenceResult.suggestions);

      if (autoProcessable && intelligenceResult.suggestions.length > 0) {
        await this.processUserChoice(
          userId,
          pendingTransaction.id,
          {
            type: 'single',
            envelopeId: intelligenceResult.suggestions[0].envelopeId,
          }
        );

        return {
          transactionId: pendingTransaction.id,
          suggestions: intelligenceResult.suggestions,
          splitSuggestion: intelligenceResult.splitSuggestion,
          requiresUserChoice: false,
          autoProcessed: true,
        };
      }

      return {
        transactionId: pendingTransaction.id,
        suggestions: intelligenceResult.suggestions,
        splitSuggestion: intelligenceResult.splitSuggestion,
        requiresUserChoice: true,
        autoProcessed: false,
      };

    } catch (error) {
      logger.error({ error, userId, transactionData }, 'Failed to process pending transaction');
      throw error;
    }
  }

  async processUserChoice(
    userId: string,
    transactionId: string,
    choice: TransactionChoice
  ): Promise<{
    success: boolean;
    finalTransaction: any;
    transfers?: any[];
  }> {
    try {
      logger.info({
        userId,
        transactionId,
        choice
      }, 'Processing user transaction choice');

      const transaction = await db.transaction.findFirst({
        where: { id: transactionId, userId, status: 'PENDING' }
      });

      if (!transaction) {
        throw new Error('Pending transaction not found');
      }

      if (choice.type === 'single' && choice.envelopeId) {
        // Single envelope allocation
        const updatedTransaction = await db.transaction.update({
          where: { id: transactionId },
          data: {
            envelopeId: choice.envelopeId,
            status: 'SETTLED',
            postedAt: new Date(),
          }
        });

        // Update envelope balance
        await db.envelope.update({
          where: { id: choice.envelopeId },
          data: {
            balanceCents: { decrement: transaction.amountCents },
            spentThisMonth: { increment: transaction.amountCents },
          }
        });

        return {
          success: true,
          finalTransaction: updatedTransaction,
        };

      } else if (choice.type === 'split' && choice.splits) {
        // Split allocation
        const updatedTransaction = await db.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'SETTLED',
            postedAt: new Date(),
            reason: 'Split transaction',
          }
        });

        const transfers = [];

        for (const split of choice.splits) {
          const splitAmount = Math.round((transaction.amountCents * split.percentage) / 100);

          // Create transfer record
          const transfer = await db.transfer.create({
            data: {
              userId,
              toId: split.envelopeId,
              amountCents: splitAmount,
              note: `Split transaction: ${split.percentage}% of ${transaction.merchant}`,
            }
          });

          // Update envelope balance
          await db.envelope.update({
            where: { id: split.envelopeId },
            data: {
              balanceCents: { decrement: splitAmount },
              spentThisMonth: { increment: split.amountCents },
            }
          });

          transfers.push(transfer);
        }

        return {
          success: true,
          finalTransaction: updatedTransaction,
          transfers,
        };
      }

      throw new Error('Invalid choice type');

    } catch (error) {
      logger.error({ error, userId, transactionId, choice }, 'Failed to process user choice');
      throw error;
    }
  }

  async getPendingTransactions(userId: string): Promise<PendingTransaction[]> {
    try {
      const pendingTransactions = await db.transaction.findMany({
        where: {
          userId,
          status: 'PENDING',
        },
        orderBy: { authorizedAt: 'desc' },
      });

      // In a real implementation, suggestions would be stored in a separate table
      // For now, we'll regenerate them
      const result = [];

      for (const transaction of pendingTransactions) {
        const userContext = await this.getUserContext(userId);
        const intelligenceResult = await mccDatabase.generateTransactionSuggestions(
          {
            merchant: transaction.merchant,
            amount: transaction.amountCents / 100,
            mcc: transaction.mcc || undefined,
            location: transaction.location || undefined,
          },
          userContext.envelopes,
          {
            hasTitheEnvelope: userContext.hasTitheEnvelope,
            userType: userContext.userType,
          }
        );

        result.push({
          id: transaction.id,
          externalId: transaction.externalId || '',
          merchant: transaction.merchant,
          amount: transaction.amountCents / 100,
          mcc: transaction.mcc || undefined,
          location: transaction.location || undefined,
          status: 'PENDING' as const,
          authorizedAt: transaction.authorizedAt || transaction.createdAt,
          suggestions: intelligenceResult.suggestions,
          splitSuggestion: intelligenceResult.splitSuggestion,
          canSplit: intelligenceResult.canSplit,
          createdAt: transaction.createdAt,
          expiresAt: new Date(transaction.createdAt.getTime() + (this.PENDING_EXPIRY_HOURS * 60 * 60 * 1000)),
        });
      }

      return result;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to get pending transactions');
      throw error;
    }
  }

  async learnFromUserChoice(
    userId: string,
    transactionData: {
      merchant: string;
      mcc?: string;
      amount: number;
    },
    chosenEnvelopeId: string
  ): Promise<void> {
    try {
      // In a production system, this would update ML models or user preference weights
      // For now, we'll store this as user memory for the AI agents

      const envelope = await db.envelope.findUnique({
        where: { id: chosenEnvelopeId },
        select: { name: true, category: true }
      });

      if (envelope) {
        await db.userMemory.create({
          data: {
            userId,
            type: 'transaction_preference',
            content: JSON.stringify({
              merchant: transactionData.merchant,
              mcc: transactionData.mcc,
              amount: transactionData.amount,
              chosenEnvelope: envelope.name,
              chosenCategory: envelope.category,
              timestamp: new Date(),
            }),
            metadata: JSON.stringify({
              learningType: 'transaction_categorization',
              confidence: 1.0,
            }),
          }
        });

        logger.info({
          userId,
          merchant: transactionData.merchant,
          chosenEnvelope: envelope.name
        }, 'Learned from user transaction choice');
      }

    } catch (error) {
      logger.error({ error, userId }, 'Failed to learn from user choice');
      // Don't throw - learning failures shouldn't break the main flow
    }
  }

  private async getUserContext(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    const envelopes = await db.envelope.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        category: true,
        balanceCents: true,
      }
    });

    const autoRoutingConfig = await envelopeAutoRouter.getAutoRoutingConfig(userId);

    return {
      userType: (user?.userType as 'consumer' | 'creator' | 'hybrid') || 'consumer',
      envelopes: envelopes.map(env => ({
        id: env.id,
        name: env.name,
        category: env.category || undefined,
        balance: env.balanceCents / 100,
      })),
      hasTitheEnvelope: autoRoutingConfig.hasTitheRouting,
    };
  }

  private canAutoProcess(suggestions: TransactionSuggestion[]): boolean {
    // Auto-process if we have a high-confidence suggestion
    return suggestions.length > 0 && suggestions[0].confidence > 0.9;
  }

  async cleanupExpiredPendingTransactions(): Promise<number> {
    try {
      const expiredDate = new Date(Date.now() - (this.PENDING_EXPIRY_HOURS * 60 * 60 * 1000));

      const expiredTransactions = await db.transaction.findMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: expiredDate },
        }
      });

      // Auto-assign to first available envelope or general pool
      let cleanedCount = 0;

      for (const transaction of expiredTransactions) {
        const userEnvelopes = await db.envelope.findMany({
          where: { userId: transaction.userId, isActive: true },
          orderBy: { order: 'asc' },
          take: 1,
        });

        if (userEnvelopes.length > 0) {
          await db.transaction.update({
            where: { id: transaction.id },
            data: {
              envelopeId: userEnvelopes[0].id,
              status: 'SETTLED',
              postedAt: new Date(),
              reason: 'Auto-assigned after expiration',
            }
          });

          await db.envelope.update({
            where: { id: userEnvelopes[0].id },
            data: {
              balanceCents: { decrement: transaction.amountCents },
              spentThisMonth: { increment: transaction.amountCents },
            }
          });

          cleanedCount++;
        }
      }

      logger.info({ cleanedCount }, 'Cleaned up expired pending transactions');
      return cleanedCount;

    } catch (error) {
      logger.error({ error }, 'Failed to cleanup expired pending transactions');
      throw error;
    }
  }
}

export const transactionIntelligence = new TransactionIntelligence();