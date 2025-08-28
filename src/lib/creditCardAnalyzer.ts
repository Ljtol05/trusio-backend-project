
import { logger } from './logger.js';
import { createAgentResponse } from './openai.js';
import { db } from './db.js';

export interface CreditCardAnalysis {
  detectedTransactions: Array<{
    date: string;
    merchant: string;
    amount: number;
    category: string;
    confidence: number;
  }>;
  monthlySpending: number;
  topCategories: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  recommendations: string[];
}

class CreditCardAnalyzer {
  
  async analyzeUploadedStatements(
    userId: string,
    fileContents: string[],
    fileTypes: string[]
  ): Promise<CreditCardAnalysis> {
    try {
      logger.info({ 
        userId, 
        fileCount: fileContents.length,
        fileTypes 
      }, 'Analyzing uploaded credit card statements');

      const systemPrompt = `
      You are a financial AI assistant specialized in analyzing credit card statements and receipts.
      Extract transaction data from uploaded documents to help with budgeting and financial planning.
      
      Focus on:
      - Transaction dates, merchants, and amounts
      - Categorizing expenses (dining, groceries, gas, entertainment, etc.)
      - Identifying spending patterns
      - Providing budgeting insights
      
      Return analysis in JSON format with transaction details and recommendations.
      `;

      const userPrompt = `
      Analyze these credit card statements/receipts for budgeting purposes:
      
      ${fileContents.map((content, index) => `
      File ${index + 1} (${fileTypes[index]}):
      ${content.substring(0, 3000)} ${content.length > 3000 ? '...' : ''}
      `).join('\n\n')}
      
      Extract all transactions and provide:
      1. Individual transactions with dates, merchants, amounts, and categories
      2. Total monthly spending analysis
      3. Top spending categories with percentages
      4. Recommendations for envelope budgeting
      `;

      const analysisResponse = await createAgentResponse(
        systemPrompt,
        userPrompt,
        [],
        { temperature: 0.1, maxTokens: 3000, useAdvancedModel: true }
      );

      // Parse AI response
      let analysis: CreditCardAnalysis;
      try {
        const parsed = JSON.parse(analysisResponse);
        analysis = {
          detectedTransactions: parsed.detectedTransactions || [],
          monthlySpending: parsed.monthlySpending || 0,
          topCategories: parsed.topCategories || [],
          recommendations: parsed.recommendations || []
        };
      } catch (parseError) {
        logger.warn({ parseError }, 'Failed to parse credit card analysis, using fallback');
        
        // Simple fallback parsing
        analysis = this.fallbackTextAnalysis(fileContents.join('\n\n'));
      }

      // Store analyzed transactions for budget influence
      await this.storeAnalyzedTransactions(userId, analysis.detectedTransactions, 'credit_card_upload');

      logger.info({
        userId,
        transactionCount: analysis.detectedTransactions.length,
        monthlySpending: analysis.monthlySpending,
        topCategories: analysis.topCategories.length
      }, 'Credit card analysis completed');

      return analysis;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to analyze credit card statements');
      throw error;
    }
  }

  async confirmUncertainTransactions(
    userId: string,
    uncertainTransactions: Array<{
      id: string;
      merchant: string;
      amount: number;
      suggestedCategory: string;
      confidence: number;
    }>,
    userConfirmations: Record<string, { category: string; merchant?: string }>
  ): Promise<void> {
    try {
      logger.info({ 
        userId, 
        uncertainCount: uncertainTransactions.length,
        confirmationCount: Object.keys(userConfirmations).length 
      }, 'Processing user confirmations for uncertain transactions');

      // Update transactions with user confirmations
      for (const [transactionId, confirmation] of Object.entries(userConfirmations)) {
        await db.transaction.updateMany({
          where: {
            userId,
            id: transactionId,
          },
          data: {
            category: confirmation.category,
            merchant: confirmation.merchant || undefined,
            userConfirmed: true,
          }
        });
      }

      logger.info({ userId, updatedCount: Object.keys(userConfirmations).length }, 'Transaction confirmations processed');

    } catch (error) {
      logger.error({ error, userId }, 'Failed to process transaction confirmations');
      throw error;
    }
  }

  private async storeAnalyzedTransactions(
    userId: string,
    transactions: any[],
    source: string
  ): Promise<void> {
    try {
      for (const transaction of transactions) {
        await db.transaction.create({
          data: {
            userId,
            amountCents: Math.round(transaction.amount * 100),
            merchant: transaction.merchant,
            description: `${transaction.merchant} - ${source}`,
            category: transaction.category,
            subcategory: null,
            source: source,
            userConfirmed: transaction.confidence > 0.8,
            createdAt: new Date(transaction.date),
          }
        });
      }

      logger.info({ 
        userId, 
        transactionCount: transactions.length, 
        source 
      }, 'Analyzed transactions stored');

    } catch (error) {
      logger.error({ error, userId, source }, 'Failed to store analyzed transactions');
    }
  }

  private fallbackTextAnalysis(text: string): CreditCardAnalysis {
    // Simple regex-based fallback for basic transaction extraction
    const transactionRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([A-Z\s]+)\s+\$?(\d+\.?\d*)/gi;
    const transactions = [];
    let match;

    while ((match = transactionRegex.exec(text)) !== null) {
      transactions.push({
        date: match[1],
        merchant: match[2].trim(),
        amount: parseFloat(match[3]),
        category: 'Other',
        confidence: 0.5
      });
    }

    const monthlySpending = transactions.reduce((sum, t) => sum + t.amount, 0);

    return {
      detectedTransactions: transactions,
      monthlySpending,
      topCategories: [{ category: 'Other', amount: monthlySpending, percentage: 100 }],
      recommendations: ['Manual categorization recommended for better insights']
    };
  }
}

export const creditCardAnalyzer = new CreditCardAnalyzer();
