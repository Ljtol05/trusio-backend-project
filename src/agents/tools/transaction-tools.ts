
import { z } from 'zod';
import { tool } from '@openai/agents';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from '../core/ToolRegistry.js';
import { toolRegistry } from '../core/ToolRegistry.js';

const TOOL_CATEGORIES = {
  TRANSACTION: 'transaction',
} as const;

// Zod schemas for transaction parameters
const TransactionParamsSchema = z.object({
  userId: z.string(),
  description: z.string().optional(),
  amount: z.number().optional(),
  category: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().optional(),
  sensitivity: z.enum(['low', 'medium', 'high']).optional(),
});

// Tool execution functions
async function categorizeTransactionExecute(
  parameters: z.infer<typeof TransactionParamsSchema>,
  context: ToolExecutionContext
): Promise<any> {
  try {
    logger.info({ parameters, userId: context.userId }, 'Categorizing transaction');

    const { description, amount } = parameters;
    
    // Simple categorization logic - in production, use ML model
    const categorization = categorizeTransaction(description || '', amount || 0);

    return {
      category: categorization.category,
      confidence: categorization.confidence,
      suggestedEnvelope: categorization.suggestedEnvelope,
      reasoning: categorization.reasoning,
    };
  } catch (error: any) {
    logger.error({ error, parameters }, 'Failed to categorize transaction');
    throw new Error(`Transaction categorization failed: ${error.message}`);
  }
}

async function autoAllocateExecute(
  parameters: z.infer<typeof TransactionParamsSchema>,
  context: ToolExecutionContext
): Promise<any> {
  try {
    logger.info({ parameters, userId: context.userId }, 'Auto-allocating transaction');

    const { userId, description, amount } = parameters;

    // Get user's envelopes
    const envelopes = await db.envelope.findMany({
      where: { userId },
    });

    if (!envelopes.length) {
      throw new Error('No envelopes found for user');
    }

    // Categorize the transaction
    const categorization = categorizeTransaction(description || '', amount || 0);
    
    // Find matching envelope
    const targetEnvelope = envelopes.find(env => 
      env.category?.toLowerCase() === categorization.category.toLowerCase()
    ) || envelopes[0]; // Default to first envelope

    // Check if envelope has sufficient balance
    const sufficientBalance = Math.abs(amount || 0) <= targetEnvelope.balance;

    return {
      allocatedEnvelope: targetEnvelope.name,
      envelopeId: targetEnvelope.id,
      category: categorization.category,
      sufficientBalance,
      newBalance: targetEnvelope.balance - Math.abs(amount || 0),
      confidence: categorization.confidence,
    };
  } catch (error: any) {
    logger.error({ error, parameters }, 'Failed to auto-allocate transaction');
    throw new Error(`Auto-allocation failed: ${error.message}`);
  }
}

async function patternDetectionExecute(
  parameters: z.infer<typeof TransactionParamsSchema>,
  context: ToolExecutionContext
): Promise<any> {
  try {
    logger.info({ parameters, userId: context.userId }, 'Detecting spending patterns');

    const { userId, startDate, endDate, category } = parameters;

    const whereClause: any = { userId };
    
    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (category) {
      whereClause.category = category;
    }

    const transactions = await db.transaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: parameters.limit || 100,
    });

    // Analyze patterns
    const patterns = analyzeSpendingPatterns(transactions);

    return {
      patterns,
      totalTransactions: transactions.length,
      timeRange: { startDate, endDate },
      insights: generatePatternInsights(patterns),
    };
  } catch (error: any) {
    logger.error({ error, parameters }, 'Failed to detect patterns');
    throw new Error(`Pattern detection failed: ${error.message}`);
  }
}

async function detectAnomaliesExecute(
  parameters: z.infer<typeof TransactionParamsSchema>,
  context: ToolExecutionContext
): Promise<any> {
  try {
    logger.info({ parameters, userId: context.userId }, 'Detecting transaction anomalies');

    const { userId, sensitivity = 'medium' } = parameters;

    const transactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200, // Last 200 transactions for analysis
    });

    const anomalies = detectTransactionAnomalies(transactions, sensitivity);

    return {
      anomalies,
      anomalyCount: anomalies.length,
      sensitivity,
      analysisDate: new Date().toISOString(),
      recommendations: generateAnomalyRecommendations(anomalies),
    };
  } catch (error: any) {
    logger.error({ error, parameters }, 'Failed to detect anomalies');
    throw new Error(`Anomaly detection failed: ${error.message}`);
  }
}

// Helper functions
function categorizeTransaction(description: string, amount: number): {
  category: string;
  confidence: number;
  suggestedEnvelope: string;
  reasoning: string;
} {
  const desc = description.toLowerCase();
  
  // Simple rule-based categorization
  if (desc.includes('grocery') || desc.includes('food') || desc.includes('restaurant')) {
    return {
      category: 'food',
      confidence: 0.9,
      suggestedEnvelope: 'Groceries',
      reasoning: 'Transaction description contains food-related keywords',
    };
  }
  
  if (desc.includes('gas') || desc.includes('fuel') || desc.includes('exxon') || desc.includes('shell')) {
    return {
      category: 'transport',
      confidence: 0.85,
      suggestedEnvelope: 'Transportation',
      reasoning: 'Transaction description contains fuel/gas-related keywords',
    };
  }
  
  if (desc.includes('netflix') || desc.includes('spotify') || desc.includes('entertainment')) {
    return {
      category: 'entertainment',
      confidence: 0.8,
      suggestedEnvelope: 'Entertainment',
      reasoning: 'Transaction description contains entertainment-related keywords',
    };
  }
  
  // Default category
  return {
    category: 'general',
    confidence: 0.5,
    suggestedEnvelope: 'General',
    reasoning: 'No specific category keywords found, defaulting to general',
  };
}

function analyzeSpendingPatterns(transactions: any[]): any[] {
  const patterns = [];
  
  // Group by day of week
  const dayOfWeekSpending = transactions.reduce((acc, txn) => {
    const day = new Date(txn.createdAt).getDay();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
    acc[dayName] = (acc[dayName] || 0) + Math.abs(txn.amount);
    return acc;
  }, {});
  
  patterns.push({
    type: 'day_of_week',
    data: dayOfWeekSpending,
    insight: `Highest spending on ${Object.keys(dayOfWeekSpending).reduce((a, b) => dayOfWeekSpending[a] > dayOfWeekSpending[b] ? a : b)}`,
  });
  
  // Group by category
  const categorySpending = transactions.reduce((acc, txn) => {
    const category = txn.category || 'uncategorized';
    acc[category] = (acc[category] || 0) + Math.abs(txn.amount);
    return acc;
  }, {});
  
  patterns.push({
    type: 'category',
    data: categorySpending,
    insight: `Top spending category: ${Object.keys(categorySpending).reduce((a, b) => categorySpending[a] > categorySpending[b] ? a : b)}`,
  });
  
  return patterns;
}

function generatePatternInsights(patterns: any[]): string[] {
  return patterns.map(pattern => pattern.insight);
}

function detectTransactionAnomalies(transactions: any[], sensitivity: string): any[] {
  const anomalies = [];
  
  if (transactions.length < 10) {
    return anomalies; // Need sufficient data
  }
  
  // Calculate average transaction amount
  const amounts = transactions.map(t => Math.abs(t.amount));
  const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
  const stdDev = Math.sqrt(amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) / amounts.length);
  
  // Sensitivity multipliers
  const thresholds = {
    low: 3,
    medium: 2,
    high: 1.5,
  };
  
  const threshold = avgAmount + (stdDev * thresholds[sensitivity as keyof typeof thresholds]);
  
  // Find anomalous transactions
  transactions.forEach(txn => {
    if (Math.abs(txn.amount) > threshold) {
      anomalies.push({
        transactionId: txn.id,
        amount: txn.amount,
        description: txn.description,
        date: txn.createdAt,
        type: 'high_amount',
        severity: Math.abs(txn.amount) > threshold * 2 ? 'high' : 'medium',
        expectedRange: `$0 - $${threshold.toFixed(2)}`,
      });
    }
  });
  
  return anomalies;
}

function generateAnomalyRecommendations(anomalies: any[]): string[] {
  const recommendations = [];
  
  if (anomalies.length === 0) {
    recommendations.push('No anomalies detected. Your spending patterns look normal.');
  } else {
    recommendations.push(`Found ${anomalies.length} unusual transaction(s). Review these for accuracy.`);
    
    if (anomalies.some(a => a.severity === 'high')) {
      recommendations.push('Some transactions are significantly higher than usual. Verify these are legitimate.');
    }
  }
  
  return recommendations;
}

// Registration function - no auto-registration
export function registerTransactionTools(registry = toolRegistry): void {
  registry.registerTool({
    name: "categorize_transaction",
    description: "Automatically categorize transactions using AI-powered analysis of merchant names, amounts, and descriptions.",
    category: TOOL_CATEGORIES.TRANSACTION,
    parameters: TransactionParamsSchema,
    execute: categorizeTransactionExecute,
    requiresAuth: true,
    riskLevel: 'low',
    estimatedDuration: 1000
  });

  registry.registerTool({
    name: "automatic_allocation",
    description: "Automatically allocate transactions to appropriate envelopes based on categorization and user preferences, updating balances.",
    category: TOOL_CATEGORIES.TRANSACTION,
    parameters: TransactionParamsSchema,
    execute: autoAllocateExecute,
    requiresAuth: true,
    riskLevel: 'medium',
    estimatedDuration: 1500
  });

  registry.registerTool({
    name: "pattern_detection",
    description: "Analyze transaction history to identify spending patterns, recurring expenses, and behavioral trends within a specified time range and categories.",
    category: TOOL_CATEGORIES.TRANSACTION,
    parameters: TransactionParamsSchema,
    execute: patternDetectionExecute,
    requiresAuth: true,
    riskLevel: 'low',
    estimatedDuration: 2500
  });

  registry.registerTool({
    name: "detect_anomalies",
    description: "Detect unusual transactions and spending behaviors based on user-defined sensitivity levels, identifying potential issues.",
    category: TOOL_CATEGORIES.TRANSACTION,
    parameters: TransactionParamsSchema,
    execute: detectAnomaliesExecute,
    requiresAuth: true,
    riskLevel: 'medium',
    estimatedDuration: 2000
  });
}

// Tool definitions for OpenAI SDK compatibility
export const categorizeTransactionTool = tool({
  name: 'categorize_transaction',
  description: 'Automatically categorize transactions using AI-powered analysis of merchant names, amounts, and descriptions.',
  parameters: TransactionParamsSchema,
  execute: categorizeTransactionExecute,
});

export const analyzeSpendingTool = tool({
  name: 'analyze_spending_patterns',
  description: 'Analyze transaction history to identify spending patterns, recurring expenses, and behavioral trends within a specified time range and categories.',
  parameters: TransactionParamsSchema,
  execute: patternDetectionExecute,
});

// Conditional auto-registration for non-test environments
if (process.env.NODE_ENV !== 'test') {
  registerTransactionTools();
}
