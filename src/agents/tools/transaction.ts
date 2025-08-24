
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toolRegistry } from "./registry.js";
import { 
  TransactionParamsSchema, 
  ToolContext, 
  ToolResult,
  TOOL_CATEGORIES 
} from "./types.js";

// Transaction Categorization Tool
const transactionCategorizationExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = TransactionParamsSchema.parse(params);
    const { userId, transactionId, transactions, suggestedEnvelopeId } = validatedParams;

    logger.info({ userId, transactionId, transactionCount: transactions?.length }, "Categorizing transactions");

    if (transactionId) {
      // Single transaction categorization
      const transaction = await db.transaction.findUnique({
        where: { id: transactionId, userId }
      });

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      // Get user's envelopes for categorization suggestions
      const envelopes = await db.envelope.findMany({
        where: { userId },
        select: { id: true, name: true, category: true }
      });

      // Simple categorization logic based on description keywords
      const description = transaction.description.toLowerCase();
      let suggestedEnvelope = null;

      // Category mapping
      const categoryMappings = {
        'food': ['restaurant', 'food', 'grocery', 'cafe', 'pizza', 'mcdonald', 'subway'],
        'transportation': ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'parking', 'metro'],
        'shopping': ['amazon', 'target', 'walmart', 'store', 'shop', 'retail'],
        'entertainment': ['movie', 'theater', 'netflix', 'spotify', 'game', 'entertainment'],
        'utilities': ['electric', 'water', 'gas', 'internet', 'phone', 'utility'],
        'healthcare': ['pharmacy', 'doctor', 'medical', 'health', 'hospital']
      };

      // Find matching category
      for (const [category, keywords] of Object.entries(categoryMappings)) {
        if (keywords.some(keyword => description.includes(keyword))) {
          suggestedEnvelope = envelopes.find(env => 
            env.name.toLowerCase().includes(category) || 
            env.category?.toLowerCase().includes(category)
          );
          break;
        }
      }

      return {
        success: true,
        data: {
          transaction: {
            id: transaction.id,
            description: transaction.description,
            amount: transaction.amount / 100
          },
          suggestedEnvelope,
          allEnvelopes: envelopes,
          confidence: suggestedEnvelope ? 0.8 : 0.3
        },
        message: suggestedEnvelope 
          ? `Suggested categorization: ${suggestedEnvelope.name}`
          : "No clear category match found. Manual categorization recommended."
      };

    } else if (transactions) {
      // Batch transaction categorization
      const categorizedTransactions = [];

      for (const transactionData of transactions) {
        // Similar categorization logic for batch processing
        const description = transactionData.description.toLowerCase();
        let suggestedCategory = 'General';

        const categoryMappings = {
          'Food & Dining': ['restaurant', 'food', 'grocery', 'cafe', 'pizza'],
          'Transportation': ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'parking'],
          'Shopping': ['amazon', 'target', 'walmart', 'store', 'shop'],
          'Entertainment': ['movie', 'theater', 'netflix', 'spotify', 'game'],
          'Utilities': ['electric', 'water', 'gas', 'internet', 'phone'],
          'Healthcare': ['pharmacy', 'doctor', 'medical', 'health']
        };

        for (const [category, keywords] of Object.entries(categoryMappings)) {
          if (keywords.some(keyword => description.includes(keyword))) {
            suggestedCategory = category;
            break;
          }
        }

        categorizedTransactions.push({
          ...transactionData,
          suggestedCategory,
          confidence: suggestedCategory !== 'General' ? 0.8 : 0.3
        });
      }

      return {
        success: true,
        data: {
          categorizedTransactions,
          summary: {
            total: transactions.length,
            highConfidence: categorizedTransactions.filter(t => t.confidence > 0.7).length,
            categories: [...new Set(categorizedTransactions.map(t => t.suggestedCategory))]
          }
        },
        message: `Categorized ${transactions.length} transactions`
      };
    }

    throw new Error("Either transactionId or transactions array is required");

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Transaction categorization failed");
    return {
      success: false,
      error: `Transaction categorization failed: ${error.message}`
    };
  }
};

// Automatic Allocation Tool
const automaticAllocationExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = TransactionParamsSchema.parse(params);
    const { userId, transactionId, suggestedEnvelopeId, forceAllocation } = validatedParams;

    if (!transactionId) {
      throw new Error("Transaction ID is required for allocation");
    }

    logger.info({ userId, transactionId, suggestedEnvelopeId }, "Allocating transaction to envelope");

    // Get the transaction
    const transaction = await db.transaction.findUnique({
      where: { id: transactionId, userId }
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.envelopeId && !forceAllocation) {
      return {
        success: false,
        error: "Transaction is already allocated. Use forceAllocation=true to override."
      };
    }

    // Get the target envelope
    const envelope = await db.envelope.findUnique({
      where: { id: suggestedEnvelopeId, userId }
    });

    if (!envelope) {
      throw new Error("Target envelope not found");
    }

    // Update transaction and envelope balance
    const transactionAmount = Math.abs(transaction.amount);
    
    await db.$transaction(async (tx) => {
      // Update transaction with envelope assignment
      await tx.transaction.update({
        where: { id: transactionId },
        data: { envelopeId: suggestedEnvelopeId }
      });

      // Update envelope balance (subtract for expenses)
      if (transaction.amount < 0) { // Expense
        await tx.envelope.update({
          where: { id: suggestedEnvelopeId },
          data: { balance: { decrement: transactionAmount } }
        });
      } else { // Income
        await tx.envelope.update({
          where: { id: suggestedEnvelopeId },
          data: { balance: { increment: transactionAmount } }
        });
      }
    });

    return {
      success: true,
      data: {
        transaction: {
          id: transaction.id,
          description: transaction.description,
          amount: transaction.amount / 100,
          allocatedTo: envelope.name
        },
        envelope: {
          id: envelope.id,
          name: envelope.name,
          newBalance: transaction.amount < 0 
            ? (envelope.balance - transactionAmount) / 100
            : (envelope.balance + transactionAmount) / 100
        }
      },
      message: `Transaction allocated to "${envelope.name}" envelope`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Automatic allocation failed");
    return {
      success: false,
      error: `Automatic allocation failed: ${error.message}`
    };
  }
};

// Pattern Detection Tool
const patternDetectionExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const { userId } = params;

    logger.info({ userId }, "Detecting transaction patterns");

    // Get recent transactions for pattern analysis
    const transactions = await db.transaction.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - (60 * 24 * 60 * 60 * 1000)) // Last 60 days
        }
      },
      include: {
        envelope: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Analyze patterns
    const patterns = {
      recurring: [],
      anomalies: [],
      trends: []
    };

    // Group transactions by description similarity
    const transactionGroups = {};
    transactions.forEach(transaction => {
      const normalizedDesc = transaction.description.toLowerCase()
        .replace(/\d+/g, 'X') // Replace numbers with X
        .replace(/[^\w\s]/g, '') // Remove special characters
        .trim();

      if (!transactionGroups[normalizedDesc]) {
        transactionGroups[normalizedDesc] = [];
      }
      transactionGroups[normalizedDesc].push(transaction);
    });

    // Identify recurring transactions (3+ occurrences)
    Object.entries(transactionGroups).forEach(([pattern, txns]: [string, any[]]) => {
      if (txns.length >= 3) {
        const amounts = txns.map(t => Math.abs(t.amount));
        const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
        const amountVariance = Math.max(...amounts) - Math.min(...amounts);
        
        patterns.recurring.push({
          pattern: txns[0].description,
          frequency: txns.length,
          averageAmount: avgAmount / 100,
          amountVariance: amountVariance / 100,
          lastOccurrence: txns[0].createdAt,
          envelope: txns[0].envelope?.name || 'Unassigned'
        });
      }
    });

    // Detect anomalies (transactions significantly larger than user's average)
    const allAmounts = transactions.map(t => Math.abs(t.amount));
    const avgTransaction = allAmounts.reduce((sum, amt) => sum + amt, 0) / allAmounts.length;
    const stdDev = Math.sqrt(
      allAmounts.reduce((sum, amt) => sum + Math.pow(amt - avgTransaction, 2), 0) / allAmounts.length
    );

    transactions.forEach(transaction => {
      const amount = Math.abs(transaction.amount);
      if (amount > avgTransaction + (2 * stdDev)) { // 2 standard deviations above average
        patterns.anomalies.push({
          id: transaction.id,
          description: transaction.description,
          amount: amount / 100,
          date: transaction.createdAt,
          deviationFactor: ((amount - avgTransaction) / stdDev).toFixed(2)
        });
      }
    });

    // Identify spending trends
    const last30Days = transactions.filter(t => 
      t.createdAt >= new Date(Date.now() - (30 * 24 * 60 * 60 * 1000))
    );
    const previous30Days = transactions.filter(t => 
      t.createdAt >= new Date(Date.now() - (60 * 24 * 60 * 60 * 1000)) &&
      t.createdAt < new Date(Date.now() - (30 * 24 * 60 * 60 * 1000))
    );

    const recentSpending = last30Days.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const previousSpending = previous30Days.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    if (previousSpending > 0) {
      const spendingChange = ((recentSpending - previousSpending) / previousSpending) * 100;
      patterns.trends.push({
        type: 'spending_change',
        change: spendingChange.toFixed(1) + '%',
        direction: spendingChange > 0 ? 'increase' : 'decrease',
        recent: recentSpending / 100,
        previous: previousSpending / 100
      });
    }

    return {
      success: true,
      data: {
        patterns,
        summary: {
          totalTransactions: transactions.length,
          recurringPatterns: patterns.recurring.length,
          anomaliesDetected: patterns.anomalies.length,
          trendsIdentified: patterns.trends.length
        }
      },
      message: `Pattern analysis completed: ${patterns.recurring.length} recurring patterns, ${patterns.anomalies.length} anomalies detected`
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Pattern detection failed");
    return {
      success: false,
      error: `Pattern detection failed: ${error.message}`
    };
  }
};

// Register transaction tools
toolRegistry.registerTool({
  name: "transaction_categorization",
  description: "Intelligently categorize transactions based on description and merchant information",
  category: TOOL_CATEGORIES.TRANSACTION,
  parameters: TransactionParamsSchema,
  execute: transactionCategorizationExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 1000
});

toolRegistry.registerTool({
  name: "automatic_allocation",
  description: "Automatically allocate transactions to appropriate envelopes with balance updates",
  category: TOOL_CATEGORIES.TRANSACTION,
  parameters: TransactionParamsSchema,
  execute: automaticAllocationExecute,
  requiresAuth: true,
  riskLevel: 'medium',
  estimatedDuration: 1500
});

toolRegistry.registerTool({
  name: "pattern_detection",
  description: "Detect recurring transactions, anomalies, and spending trends for better financial insights",
  category: TOOL_CATEGORIES.TRANSACTION,
  parameters: TransactionParamsSchema,
  execute: patternDetectionExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 2500
});

export { transactionCategorizationExecute, automaticAllocationExecute, patternDetectionExecute };
