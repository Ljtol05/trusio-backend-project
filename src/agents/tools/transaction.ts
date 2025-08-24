import { tool } from '@openai/agents';
import { z } from 'zod';
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { toolRegistry } from "./registry.js";
import {
  TransactionParamsSchema,
  ToolContext,
  ToolResult,
  TOOL_CATEGORIES
} from "./types.js";

// Transaction categorization tool
const categorizeTransactionExecute = async (params: z.infer<typeof TransactionParamsSchema>, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = TransactionParamsSchema.parse(params);
    const { userId, transactionId, merchant, amount, description, suggestedEnvelopeId } = validatedParams;

    logger.info({
      userId,
      transactionId,
      merchant,
      amount,
      suggestedEnvelopeId
    }, "Categorizing transaction");

    let category = 'General';
    let confidence = 0.5;
    let envelopeId = suggestedEnvelopeId || 'env_general';

    // Fetch user's envelopes for potential matches
    const envelopes = await db.envelope.findMany({
      where: { userId },
      select: { id: true, name: true, category: true }
    });

    // Simple categorization logic (replace with ML model if needed)
    const merchantLower = merchant.toLowerCase();
    if (merchantLower.includes('grocery') || merchantLower.includes('supermarket')) {
      category = 'Food & Dining';
      confidence = 0.95;
      envelopeId = envelopes.find(env => env.name.toLowerCase().includes('food') || env.category?.toLowerCase().includes('food'))?.id || envelopeId;
    } else if (merchantLower.includes('gas') || merchantLower.includes('fuel')) {
      category = 'Transportation';
      confidence = 0.90;
      envelopeId = envelopes.find(env => env.name.toLowerCase().includes('transport') || env.category?.toLowerCase().includes('transport'))?.id || envelopeId;
    } else if (merchantLower.includes('restaurant') || merchantLower.includes('cafe')) {
      category = 'Food & Dining';
      confidence = 0.85;
      envelopeId = envelopes.find(env => env.name.toLowerCase().includes('food') || env.category?.toLowerCase().includes('food'))?.id || envelopeId;
    } else if (description && description.toLowerCase().includes('salary')) {
      category = 'Income';
      confidence = 0.98;
      envelopeId = envelopes.find(env => env.name.toLowerCase().includes('income'))?.id || envelopeId;
    }

    const resultData = {
      transactionId: transactionId || 'N/A', // Handle cases where transactionId might not be provided initially
      suggestedCategory: category,
      confidence,
      suggestedEnvelopeId: envelopeId,
      reasoning: `Categorized based on merchant "${merchant}" and description "${description || 'N/A'}"`,
      allEnvelopes: envelopes.map(env => ({ id: env.id, name: env.name, category: env.category })),
    };

    return {
      success: true,
      data: resultData,
      message: `Transaction categorized as "${category}" with ${Math.round(confidence * 100)}% confidence. Suggested Envelope: ${envelopes.find(env => env.id === envelopeId)?.name || envelopeId}`,
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId, transactionId: params.transactionId }, "Transaction categorization failed");

    return {
      success: false,
      error: error.message,
      message: "Failed to categorize transaction",
    };
  }
};

// Automatic allocation tool
const autoAllocateExecute = async (params: z.infer<typeof TransactionParamsSchema>, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = TransactionParamsSchema.parse(params);
    const { userId, transactionId, suggestedEnvelopeId, forceAllocation } = validatedParams;

    if (!transactionId || !suggestedEnvelopeId) {
      throw new Error("Transaction ID and suggested envelope ID are required for allocation");
    }

    logger.info({ userId, transactionId, suggestedEnvelopeId, forceAllocation }, "Auto-allocating transaction");

    const transaction = await db.transaction.findUnique({
      where: { id: transactionId, userId }
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    if (transaction.envelopeId && !forceAllocation) {
      return {
        success: false,
        error: "Transaction is already allocated. Use forceAllocation=true to override.",
        data: { transactionId, currentEnvelopeId: transaction.envelopeId }
      };
    }

    const envelope = await db.envelope.findUnique({
      where: { id: suggestedEnvelopeId, userId }
    });

    if (!envelope) {
      throw new Error("Target envelope not found");
    }

    const transactionAmount = Math.abs(transaction.amount);
    let newBalance = envelope.balance;

    await db.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: { envelopeId: suggestedEnvelopeId }
      });

      if (transaction.amount < 0) { // Expense
        await tx.envelope.update({
          where: { id: suggestedEnvelopeId },
          data: { balance: { decrement: transactionAmount } }
        });
        newBalance = envelope.balance - transactionAmount;
      } else { // Income
        await tx.envelope.update({
          where: { id: suggestedEnvelopeId },
          data: { balance: { increment: transactionAmount } }
        });
        newBalance = envelope.balance + transactionAmount;
      }
    });

    return {
      success: true,
      data: {
        transactionId: transaction.id,
        allocatedToEnvelope: envelope.name,
        allocationAmount: transaction.amount / 100,
        newBalance: newBalance / 100,
      },
      message: `Transaction allocated to "${envelope.name}" envelope. New balance: $${(newBalance / 100).toFixed(2)}`,
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId, transactionId: params.transactionId }, "Automatic allocation failed");

    return {
      success: false,
      error: error.message,
      message: "Failed to allocate transaction",
    };
  }
};

// Pattern detection tool
const patternDetectionExecute = async (params: z.infer<typeof TransactionParamsSchema>, context: ToolContext): Promise<ToolResult> => {
  try {
    const { userId, timeRange, categories } = params;

    logger.info({ userId, timeRange, categories }, "Detecting transaction patterns");

    // Fetch transactions based on time range and categories
    const dateFilter = {
      gte: new Date(Date.now() - (() => {
        switch (timeRange) {
          case 'last_30_days': return 30 * 24 * 60 * 60 * 1000;
          case 'last_90_days': return 90 * 24 * 60 * 60 * 1000;
          case 'last_6_months': return 6 * 30 * 24 * 60 * 60 * 1000;
          default: return 90 * 24 * 60 * 60 * 1000;
        }
      })())
    };

    const transactions = await db.transaction.findMany({
      where: {
        userId,
        createdAt: dateFilter,
        envelope: categories && categories.length > 0 ? {
          name: { in: categories }
        } : undefined
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
      recurringTransactions: [],
      spendingPatterns: [],
      seasonalTrends: []
    };

    // Group transactions by description similarity for recurring patterns
    const transactionGroups: { [key: string]: any[] } = {};
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

    // Identify recurring transactions (e.g., 3+ occurrences)
    Object.entries(transactionGroups).forEach(([patternDesc, txns]) => {
      if (txns.length >= 3) {
        const amounts = txns.map(t => Math.abs(t.amount));
        const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
        const amountVariance = Math.max(...amounts) - Math.min(...amounts);
        const firstOccurrence = txns[txns.length - 1].createdAt; // Oldest first
        const lastOccurrence = txns[0].createdAt; // Newest first

        // Basic frequency estimation
        let frequency = 'irregular';
        if (txns.length >= 3) {
          const timeDiffs = [];
          for (let i = 0; i < txns.length - 1; i++) {
            timeDiffs.push(txns[i].createdAt.getTime() - txns[i+1].createdAt.getTime());
          }
          const avgTimeDiff = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;
          if (avgTimeDiff < 7 * 24 * 60 * 60 * 1000) frequency = 'weekly';
          else if (avgTimeDiff < 30 * 24 * 60 * 60 * 1000) frequency = 'monthly';
          else if (avgTimeDiff < 90 * 24 * 60 * 60 * 1000) frequency = 'quarterly';
        }

        patterns.recurringTransactions.push({
          description: txns[0].description, // Use original description for clarity
          merchant: txns[0].merchant,
          amount: avgAmount / 100,
          frequency,
          nextExpected: null, // Difficult to predict without more sophisticated analysis
          category: txns[0].envelope?.category || 'Unassigned',
          envelope: txns[0].envelope?.name || 'Unassigned',
          occurrences: txns.length,
          firstOccurrence: firstOccurrence.toISOString().split('T')[0],
          lastOccurrence: lastOccurrence.toISOString().split('T')[0]
        });
      }
    });

    // Placeholder for spending patterns and seasonal trends
    // These would require more complex analysis of aggregated data over time.

    return {
      success: true,
      data: patterns,
      message: `Identified ${patterns.recurringTransactions.length} recurring transaction patterns.`,
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Pattern detection failed");

    return {
      success: false,
      error: error.message,
      message: "Failed to detect patterns",
    };
  }
};

// Anomaly detection tool
const detectAnomaliesExecute = async (params: z.infer<typeof TransactionParamsSchema>, context: ToolContext): Promise<ToolResult> => {
  try {
    const { userId, sensitivityLevel, categories } = params;

    logger.info({ userId, sensitivityLevel, categories }, "Detecting transaction anomalies");

    // Fetch transactions for analysis
    const dateFilter = {
      gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Last 90 days for anomaly detection
    };

    const transactions = await db.transaction.findMany({
      where: {
        userId,
        createdAt: dateFilter,
        envelope: categories && categories.length > 0 ? {
          name: { in: categories }
        } : undefined
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const allAmounts = transactions.map(t => Math.abs(t.amount));
    const avgTransaction = allAmounts.reduce((sum, amt) => sum + amt, 0) / allAmounts.length;
    const stdDev = Math.sqrt(
      allAmounts.reduce((sum, amt) => sum + Math.pow(amt - avgTransaction, 2), 0) / allAmounts.length
    );

    const sensitivityThreshold = {
      'low': 3 * stdDev,
      'medium': 2 * stdDev,
      'high': 1 * stdDev
    };

    const threshold = sensitivityThreshold[sensitivityLevel || 'medium'];

    const anomalies = [];
    transactions.forEach(transaction => {
      const amount = Math.abs(transaction.amount);
      if (amount > avgTransaction + threshold) {
        anomalies.push({
          transactionId: transaction.id,
          merchant: transaction.merchant,
          amount: amount / 100,
          date: transaction.createdAt.toISOString().split('T')[0],
          anomalyType: 'amount_outlier',
          severity: threshold === sensitivityThreshold.high ? 'high' : (threshold === sensitivityThreshold.medium ? 'medium' : 'low'),
          reasoning: `Amount is ${(amount / avgTransaction).toFixed(1)}x higher than average for this user.`,
          suggestedAction: 'Review transaction details for potential issues.'
        });
      }
    });

    const summary = {
      totalAnomalies: anomalies.length,
      highSeverity: anomalies.filter(a => a.severity === 'high').length,
      mediumSeverity: anomalies.filter(a => a.severity === 'medium').length,
      lowSeverity: anomalies.filter(a => a.severity === 'low').length,
      overallRiskScore: anomalies.length > 0 ? Math.min(1, (anomalies.length * 0.2) + (anomalies.filter(a => a.severity === 'high').length * 0.3)) : 0, // Simple scoring
      riskLevel: 'low'
    };

    if (summary.overallRiskScore > 0.7) summary.riskLevel = 'high';
    else if (summary.overallRiskScore > 0.4) summary.riskLevel = 'medium';

    return {
      success: true,
      data: {
        detected: anomalies,
        summary,
        recommendations: [
          'Review medium and high severity anomalies for potential fraud',
          `Set up alerts for transactions over $${(avgTransaction + threshold).toFixed(2)}`,
          'Regularly review transactions flagged as new merchants (if applicable)'
        ]
      },
      message: `Detected ${anomalies.length} anomalies with overall risk level: ${summary.riskLevel}.`,
    };

  } catch (error: any) {
    logger.error({ error: error.message, userId: params.userId }, "Anomaly detection failed");

    return {
      success: false,
      error: error.message,
      message: "Failed to detect anomalies",
    };
  }
};


// Register transaction tools using the tool registry
toolRegistry.registerTool({
  name: "transaction_categorization",
  description: "Automatically categorize transactions using AI-powered analysis of merchant names, amounts, and descriptions.",
  category: TOOL_CATEGORIES.TRANSACTION,
  parameters: TransactionParamsSchema,
  execute: categorizeTransactionExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 1000
});

toolRegistry.registerTool({
  name: "automatic_allocation",
  description: "Automatically allocate transactions to appropriate envelopes based on categorization and user preferences, updating balances.",
  category: TOOL_CATEGORIES.TRANSACTION,
  parameters: TransactionParamsSchema,
  execute: autoAllocateExecute,
  requiresAuth: true,
  riskLevel: 'medium',
  estimatedDuration: 1500
});

toolRegistry.registerTool({
  name: "pattern_detection",
  description: "Analyze transaction history to identify spending patterns, recurring expenses, and behavioral trends within a specified time range and categories.",
  category: TOOL_CATEGORIES.TRANSACTION,
  parameters: TransactionParamsSchema,
  execute: patternDetectionExecute,
  requiresAuth: true,
  riskLevel: 'low',
  estimatedDuration: 2500
});

toolRegistry.registerTool({
  name: "detect_anomalies",
  description: "Detect unusual transactions and spending behaviors based on user-defined sensitivity levels, identifying potential issues.",
  category: TOOL_CATEGORIES.TRANSACTION,
  parameters: TransactionParamsSchema,
  execute: detectAnomaliesExecute,
  requiresAuth: true,
  riskLevel: 'medium',
  estimatedDuration: 2000
});

export { categorizeTransactionExecute, autoAllocateExecute, patternDetectionExecute, detectAnomaliesExecute };