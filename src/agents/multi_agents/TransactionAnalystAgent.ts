
import { Agent } from '@openai/agents';
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { AGENT_CONFIG, AGENT_PROMPTS, createAgentConfig } from '../config.js';
import { agentValidator } from '../core/AgentValidator.js';
import { agentLifecycleManager } from '../config.js';
import type { FinancialContext, AgentExecutionResult } from '../types.js';

export class TransactionAnalystAgent {
  private agent: Agent;
  private isInitialized = false;

  constructor() {
    const config = createAgentConfig('Transaction Analyst', 'transaction_analyst', {
      handoffs: ['financial_advisor', 'budget_coach', 'insight_generator'],
      specializations: ['spending_analysis', 'pattern_recognition', 'categorization', 'anomaly_detection'],
    });

    this.agent = new Agent({
      name: config.name,
      instructions: AGENT_PROMPTS.transactionAnalyst,
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      tools: config.tools || [],
    });

    logger.info({ agentName: config.name }, 'Transaction Analyst Agent initialized');
    this.isInitialized = true;
  }

  async run(
    message: string,
    context: FinancialContext & {
      sessionId: string;
      timestamp: Date;
      previousInteractions?: any[];
    }
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    const agentName = 'transaction_analyst';

    try {
      const inputValidation = agentValidator.validateInput({ message });
      if (!inputValidation.isValid) {
        throw new Error(`Input validation failed: ${inputValidation.errors?.join(', ')}`);
      }

      agentLifecycleManager.startAgent(agentName, context);

      logger.info({ 
        agentName, 
        userId: context.userId, 
        sessionId: context.sessionId 
      }, 'Transaction Analyst processing request');

      // Perform transaction analysis
      const transactionInsights = this.analyzeTransactions(context);
      const enhancedPrompt = this.buildAnalysisPrompt(message, context, transactionInsights);

      const response = await createAgentResponse(
        AGENT_PROMPTS.transactionAnalyst,
        enhancedPrompt,
        context.previousInteractions || [],
        {
          temperature: 0.5, // Lower temperature for more analytical responses
          maxTokens: AGENT_CONFIG.maxTokens,
          useAdvancedModel: true,
        }
      );

      const outputValidation = agentValidator.validateOutput({
        response,
        agentName,
        sessionId: context.sessionId,
        timestamp: new Date().toISOString(),
      });

      if (!outputValidation.isValid) {
        throw new Error(`Output validation failed: ${outputValidation.errors?.join(', ')}`);
      }

      const duration = Date.now() - startTime;
      agentLifecycleManager.endAgent(agentName, true);

      return {
        success: true,
        response,
        agentName,
        sessionId: context.sessionId,
        timestamp: new Date(),
        duration,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      agentLifecycleManager.endAgent(agentName, false);

      logger.error({ 
        error: error.message, 
        agentName, 
        userId: context.userId,
        duration 
      }, 'Transaction Analyst execution failed');

      return {
        success: false,
        response: 'I apologize, but I encountered an issue analyzing your transactions. Please ensure you have transaction data available and try again.',
        agentName,
        sessionId: context.sessionId,
        timestamp: new Date(),
        duration,
        error: error.message,
      };
    }
  }

  private analyzeTransactions(context: FinancialContext) {
    const insights: any = {
      totalTransactions: 0,
      totalIncome: 0,
      totalExpenses: 0,
      averageTransaction: 0,
      categoryBreakdown: {},
      patterns: [],
      anomalies: [],
      trends: {},
    };

    if (!context.transactions || context.transactions.length === 0) {
      return insights;
    }

    insights.totalTransactions = context.transactions.length;

    // Analyze transactions
    context.transactions.forEach(transaction => {
      const amount = transaction.amount;
      
      if (amount >= 0) {
        insights.totalIncome += amount;
      } else {
        insights.totalExpenses += Math.abs(amount);
      }

      // Category breakdown
      const category = transaction.category || 'uncategorized';
      if (!insights.categoryBreakdown[category]) {
        insights.categoryBreakdown[category] = { count: 0, total: 0, average: 0 };
      }
      insights.categoryBreakdown[category].count += 1;
      insights.categoryBreakdown[category].total += Math.abs(amount);
    });

    // Calculate averages
    if (insights.totalTransactions > 0) {
      insights.averageTransaction = (insights.totalIncome + insights.totalExpenses) / insights.totalTransactions;
    }

    // Calculate category averages
    Object.keys(insights.categoryBreakdown).forEach(category => {
      const categoryData = insights.categoryBreakdown[category];
      categoryData.average = categoryData.total / categoryData.count;
    });

    // Detect patterns and anomalies
    insights.patterns = this.detectPatterns(context.transactions);
    insights.anomalies = this.detectAnomalies(context.transactions);

    return insights;
  }

  private detectPatterns(transactions: any[]): string[] {
    const patterns: string[] = [];

    // Analyze by day of week
    const dayPatterns: Record<string, number> = {};
    transactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
      dayPatterns[dayOfWeek] = (dayPatterns[dayOfWeek] || 0) + 1;
    });

    const maxDay = Object.keys(dayPatterns).reduce((a, b) => 
      dayPatterns[a] > dayPatterns[b] ? a : b
    );
    
    if (dayPatterns[maxDay] > transactions.length * 0.3) {
      patterns.push(`Heavy spending on ${maxDay}s (${dayPatterns[maxDay]} transactions)`);
    }

    // Analyze merchant frequency
    const merchantFrequency: Record<string, number> = {};
    transactions.forEach(transaction => {
      const merchant = transaction.description.split(' ')[0]; // Simple merchant extraction
      merchantFrequency[merchant] = (merchantFrequency[merchant] || 0) + 1;
    });

    const frequentMerchants = Object.entries(merchantFrequency)
      .filter(([_, count]) => count >= 3)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    frequentMerchants.forEach(([merchant, count]) => {
      patterns.push(`Frequent transactions at ${merchant} (${count} times)`);
    });

    return patterns;
  }

  private detectAnomalies(transactions: any[]): string[] {
    const anomalies: string[] = [];

    if (transactions.length < 3) return anomalies;

    // Calculate spending amount statistics
    const amounts = transactions.map(t => Math.abs(t.amount));
    const average = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const sorted = amounts.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Detect unusually large transactions
    const largeThreshold = Math.max(average * 3, median * 5);
    const largeTransactions = transactions.filter(t => Math.abs(t.amount) > largeThreshold);

    largeTransactions.forEach(transaction => {
      anomalies.push(
        `Unusually large transaction: ${transaction.description} ($${Math.abs(transaction.amount).toFixed(2)})`
      );
    });

    // Detect duplicate transactions
    const duplicates = this.findDuplicateTransactions(transactions);
    duplicates.forEach(duplicate => {
      anomalies.push(`Potential duplicate: ${duplicate}`);
    });

    return anomalies;
  }

  private findDuplicateTransactions(transactions: any[]): string[] {
    const duplicates: string[] = [];
    const seen = new Map<string, any>();

    transactions.forEach(transaction => {
      const key = `${transaction.description}-${transaction.amount}`;
      
      if (seen.has(key)) {
        const original = seen.get(key);
        const timeDiff = Math.abs(new Date(transaction.date).getTime() - new Date(original.date).getTime());
        
        // If transactions are within 24 hours and identical
        if (timeDiff < 86400000) {
          duplicates.push(`${transaction.description} ($${Math.abs(transaction.amount).toFixed(2)})`);
        }
      } else {
        seen.set(key, transaction);
      }
    });

    return duplicates;
  }

  private buildAnalysisPrompt(message: string, context: FinancialContext, insights: any): string {
    const promptParts: string[] = [message];

    promptParts.push('\n**Transaction Analysis:**');
    promptParts.push(`- Total Transactions: ${insights.totalTransactions}`);
    promptParts.push(`- Total Income: $${insights.totalIncome.toFixed(2)}`);
    promptParts.push(`- Total Expenses: $${insights.totalExpenses.toFixed(2)}`);
    promptParts.push(`- Average Transaction: $${insights.averageTransaction.toFixed(2)}`);

    if (Object.keys(insights.categoryBreakdown).length > 0) {
      promptParts.push('\n**Spending by Category:**');
      Object.entries(insights.categoryBreakdown).forEach(([category, data]: [string, any]) => {
        promptParts.push(`- ${category}: $${data.total.toFixed(2)} (${data.count} transactions, avg: $${data.average.toFixed(2)})`);
      });
    }

    if (insights.patterns.length > 0) {
      promptParts.push('\n**Spending Patterns:**');
      insights.patterns.forEach((pattern: string) => {
        promptParts.push(`- ${pattern}`);
      });
    }

    if (insights.anomalies.length > 0) {
      promptParts.push('\n**Anomalies Detected:**');
      insights.anomalies.forEach((anomaly: string) => {
        promptParts.push(`- ${anomaly}`);
      });
    }

    return promptParts.join('\n');
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  getCapabilities(): string[] {
    return [
      'spending_analysis',
      'pattern_recognition',
      'transaction_categorization',
      'anomaly_detection',
      'trend_analysis'
    ];
  }
}
