import { logger } from './logger.js';
import { db } from './db.js';

export interface ClassificationResult {
  category: string;
  confidence: number;
  reasoning: string;
  suggestedEnvelope?: string;
}

export class TransactionClassifier {
  /**
   * Classify a transaction using AI and rules-based logic
   */
  static async classifyTransaction(
    transactionId: number,
    userId: number
  ): Promise<ClassificationResult | null> {
    try {
      // Get the transaction
      const transaction = await db.transaction.findUnique({
        where: { id: transactionId },
        include: {
          envelope: { select: { name: true, category: true } }
        }
      });

      if (!transaction) {
        logger.warn({ transactionId }, 'Transaction not found for classification');
        return null;
      }

      // Skip if already classified
      if (transaction.envelopeId) {
        logger.debug({ transactionId }, 'Transaction already classified, skipping');
        return null;
      }

      // Get user's envelope preferences
      const userEnvelopes = await db.envelope.findMany({
        where: { userId },
        select: { id: true, name: true, category: true, priority: true }
      });

      // Classify using rules-based logic
      const classification = this.rulesBasedClassification(
        transaction.merchant,
        transaction.amountCents,
        transaction.mcc,
        userEnvelopes
      );

      if (classification) {
        // Update transaction with classification
        await db.transaction.update({
          where: { id: transactionId },
          data: {
            envelopeId: classification.suggestedEnvelope ?
              parseInt(classification.suggestedEnvelope) : null,
            updatedAt: new Date()
          }
        });

        logger.info({
          transactionId,
          userId,
          classification: classification.category,
          confidence: classification.confidence
        }, 'Transaction classified automatically');

        return classification;
      }

      return null;
    } catch (error) {
      logger.error({ error, transactionId, userId }, 'Failed to classify transaction');
      return null;
    }
  }

  /**
   * Rules-based classification logic
   */
  private static rulesBasedClassification(
    merchant: string,
    amountCents: number,
    mcc: string | null,
    userEnvelopes: Array<{ id: number; name: string; category: string | null; priority: string | null }>
  ): ClassificationResult | null {
    const merchantLower = merchant.toLowerCase();
    const amount = Math.abs(amountCents) / 100;

    // High-confidence merchant patterns
    const merchantPatterns = [
      {
        keywords: ['grocery', 'market', 'walmart', 'target', 'safeway', 'kroger', 'whole foods'],
        category: 'Groceries',
        confidence: 0.95,
        reasoning: 'Merchant name indicates grocery store'
      },
      {
        keywords: ['gas', 'fuel', 'shell', 'chevron', 'exxon', 'bp', 'mobil'],
        category: 'Transportation',
        confidence: 0.95,
        reasoning: 'Merchant name indicates gas station'
      },
      {
        keywords: ['mcdonald', 'starbucks', 'subway', 'taco bell', 'burger king', 'wendy'],
        category: 'Dining',
        confidence: 0.90,
        reasoning: 'Merchant name indicates fast food restaurant'
      },
      {
        keywords: ['restaurant', 'cafe', 'bistro', 'grill', 'pizza', 'chinese', 'mexican'],
        category: 'Dining',
        confidence: 0.85,
        reasoning: 'Merchant name indicates restaurant'
      },
      {
        keywords: ['uber', 'lyft', 'taxi'],
        category: 'Transportation',
        confidence: 0.90,
        reasoning: 'Merchant name indicates rideshare service'
      },
      {
        keywords: ['amazon', 'ebay', 'etsy'],
        category: 'Shopping',
        confidence: 0.80,
        reasoning: 'Merchant name indicates online marketplace'
      },
      {
        keywords: ['verizon', 'at&t', 'comcast', 'spectrum', 'xfinity'],
        category: 'Bills',
        confidence: 0.90,
        reasoning: 'Merchant name indicates utility provider'
      },
      {
        keywords: ['pharmacy', 'cvs', 'walgreens', 'rite aid'],
        category: 'Healthcare',
        confidence: 0.85,
        reasoning: 'Merchant name indicates pharmacy'
      }
    ];

    // Check merchant patterns
    for (const pattern of merchantPatterns) {
      if (pattern.keywords.some(keyword => merchantLower.includes(keyword))) {
        const suggestedEnvelope = this.findBestEnvelope(
          pattern.category,
          userEnvelopes
        );

        return {
          category: pattern.category,
          confidence: pattern.confidence,
          reasoning: pattern.reasoning,
          suggestedEnvelope: suggestedEnvelope?.toString()
        };
      }
    }

    // MCC-based classification
    if (mcc) {
      const mccClassification = this.classifyByMCC(mcc);
      if (mccClassification) {
        const suggestedEnvelope = this.findBestEnvelope(
          mccClassification.category,
          userEnvelopes
        );

        return {
          category: mccClassification.category,
          confidence: mccClassification.confidence,
          reasoning: `MCC ${mcc} indicates ${mccClassification.category}`,
          suggestedEnvelope: suggestedEnvelope?.toString()
        };
      }
    }

    // Amount-based classification
    if (amount > 1000) {
      return {
        category: 'Large Purchase',
        confidence: 0.70,
        reasoning: 'High amount suggests major purchase',
        suggestedEnvelope: this.findBestEnvelope('Large Purchase', userEnvelopes)?.toString()
      };
    }

    // Default classification
    return {
      category: 'Other',
      confidence: 0.50,
      reasoning: 'Unable to determine category from available data',
      suggestedEnvelope: this.findBestEnvelope('Other', userEnvelopes)?.toString()
    };
  }

  /**
   * Classify transaction by MCC code
   */
  private static classifyByMCC(mcc: string): { category: string; confidence: number } | null {
    const mccCategories: Record<string, { category: string; confidence: number }> = {
      '5411': { category: 'Groceries', confidence: 0.95 },
      '5541': { category: 'Transportation', confidence: 0.95 },
      '5814': { category: 'Dining', confidence: 0.90 },
      '4511': { category: 'Travel', confidence: 0.90 },
      '4900': { category: 'Bills', confidence: 0.90 },
      '7832': { category: 'Entertainment', confidence: 0.85 },
      '8011': { category: 'Healthcare', confidence: 0.90 },
      '8099': { category: 'Healthcare', confidence: 0.85 },
      '8220': { category: 'Education', confidence: 0.90 },
      '7230': { category: 'Personal Care', confidence: 0.85 },
      '5311': { category: 'Shopping', confidence: 0.85 },
      '5999': { category: 'Shopping', confidence: 0.80 }
    };

    return mccCategories[mcc] || null;
  }

  /**
   * Find the best envelope for a category
   */
  private static findBestEnvelope(
    category: string,
    userEnvelopes: Array<{ id: number; name: string; category: string | null; priority: string | null }>
  ): number | null {
    // First, try to find an envelope with matching category
    const categoryMatch = userEnvelopes.find(env =>
      env.category && env.category.toLowerCase() === category.toLowerCase()
    );
    if (categoryMatch) return categoryMatch.id;

    // Then, try to find an envelope with matching name
    const nameMatch = userEnvelopes.find(env =>
      env.name.toLowerCase().includes(category.toLowerCase()) ||
      category.toLowerCase().includes(env.name.toLowerCase())
    );
    if (nameMatch) return nameMatch.id;

    // Finally, look for a general-purpose envelope
    const generalEnvelope = userEnvelopes.find(env =>
      env.name.toLowerCase().includes('misc') ||
      env.name.toLowerCase().includes('other') ||
      env.name.toLowerCase().includes('general')
    );
    if (generalEnvelope) return generalEnvelope.id;

    return null;
  }

  /**
   * Batch classify multiple transactions
   */
  static async batchClassifyTransactions(
    userId: number,
    limit: number = 50
  ): Promise<{ processed: number; classified: number; errors: number }> {
    try {
      const unclassifiedTransactions = await db.transaction.findMany({
        where: {
          userId,
          envelopeId: null
        },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });

      let processed = 0;
      let classified = 0;
      let errors = 0;

      for (const transaction of unclassifiedTransactions) {
        try {
          const result = await this.classifyTransaction(transaction.id, userId);
          if (result) classified++;
          processed++;
        } catch (error) {
          errors++;
          logger.error({ error, transactionId: transaction.id }, 'Failed to classify transaction in batch');
        }
      }

      logger.info({
        userId,
        processed,
        classified,
        errors
      }, 'Batch classification completed');

      return { processed, classified, errors };
    } catch (error) {
      logger.error({ error, userId }, 'Batch classification failed');
      throw error;
    }
  }
}

// Export convenience functions
export const classifyTransaction = TransactionClassifier.classifyTransaction;
export const batchClassifyTransactions = TransactionClassifier.batchClassifyTransactions;
