
import { logger } from './logger.js';
import { db } from './db.js';
import { createAgentResponse } from './openai.js';
import { envelopeAutoRouter } from './envelopeAutoRouter.js';

export interface BillAnalysis {
  totalMonthlyBills: number;
  suggestedBuffer: number;
  recommendedBillsEnvelopeAmount: number;
  detectedBills: Array<{
    name: string;
    amount: number;
    frequency: string;
    confidence: number;
  }>;
  recommendations: string[];
}

export interface FinancialHealthCheck {
  shouldRebalance: boolean;
  reasons: string[];
  suggestedChanges: Array<{
    envelopeId: string;
    envelopeName: string;
    currentAmount: number;
    suggestedAmount: number;
    reason: string;
  }>;
}

class BillAnalyzer {
  
  async analyzeBillsFromTransactions(
    userId: string,
    timeframeDays: number = 90
  ): Promise<BillAnalysis> {
    try {
      logger.info({ userId, timeframeDays }, 'Starting AI bill analysis');

      // Get recent transactions for pattern analysis
      const startDate = new Date(Date.now() - (timeframeDays * 24 * 60 * 60 * 1000));
      
      const transactions = await db.transaction.findMany({
        where: {
          userId,
          createdAt: { gte: startDate },
          amountCents: { lt: 0 }, // Only spending transactions
        },
        include: {
          envelope: { select: { name: true, category: true } }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Prepare transaction data for AI analysis
      const transactionSummary = transactions.map(t => ({
        merchant: t.merchant,
        amount: Math.abs(t.amountCents / 100),
        date: t.createdAt.toISOString().split('T')[0],
        envelope: t.envelope?.name || 'Uncategorized',
        mcc: t.mcc
      }));

      // AI analysis prompt
      const systemPrompt = `You are a financial AI assistant specialized in identifying recurring bills and expenses. 
      Analyze transaction patterns to identify monthly bills and calculate overhead.
      
      Focus on:
      - Recurring monthly expenses (rent, utilities, subscriptions, insurance, etc.)
      - Semi-regular bills (quarterly, annual divided by 12)
      - Suggest appropriate buffer percentage (5-15% based on income stability)
      
      Return analysis in JSON format with detected bills and recommendations.`;

      const userPrompt = `Analyze these ${transactionSummary.length} transactions from the last ${timeframeDays} days to identify recurring bills:

      ${JSON.stringify(transactionSummary.slice(0, 50), null, 2)}

      Please identify:
      1. Recurring monthly bills and their amounts
      2. Appropriate buffer percentage for this user
      3. Total recommended bills envelope amount
      4. Specific recommendations for bill management`;

      const analysisResponse = await createAgentResponse(
        systemPrompt,
        userPrompt,
        [],
        { temperature: 0.1, maxTokens: 2000, useAdvancedModel: true }
      );

      // Parse AI response (with fallback)
      let analysis: BillAnalysis;
      try {
        const parsed = JSON.parse(analysisResponse);
        analysis = {
          totalMonthlyBills: parsed.totalMonthlyBills || 0,
          suggestedBuffer: parsed.suggestedBuffer || 10,
          recommendedBillsEnvelopeAmount: parsed.recommendedBillsEnvelopeAmount || 0,
          detectedBills: parsed.detectedBills || [],
          recommendations: parsed.recommendations || []
        };
      } catch (parseError) {
        logger.warn({ parseError }, 'Failed to parse AI bill analysis, using fallback');
        
        // Simple fallback analysis
        const recurringPatterns = this.detectSimpleRecurringPatterns(transactions);
        analysis = {
          totalMonthlyBills: recurringPatterns.totalEstimated,
          suggestedBuffer: 10,
          recommendedBillsEnvelopeAmount: Math.round(recurringPatterns.totalEstimated * 1.1),
          detectedBills: recurringPatterns.bills,
          recommendations: ['Consider setting up auto-pay for recurring bills', 'Review bills quarterly for changes']
        };
      }

      logger.info({
        userId,
        totalBills: analysis.totalMonthlyBills,
        recommendedAmount: analysis.recommendedBillsEnvelopeAmount
      }, 'Bill analysis completed');

      return analysis;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to analyze bills');
      throw error;
    }
  }

  async checkFinancialHealthAndSuggestRebalancing(
    userId: string
  ): Promise<FinancialHealthCheck> {
    try {
      logger.info({ userId }, 'Checking financial health for rebalancing');

      // Get user's current envelope setup
      const envelopes = await db.envelope.findMany({
        where: { userId, isActive: true },
        include: {
          transactions: {
            where: {
              createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }
          }
        }
      });

      // Get recent income pattern
      const recentIncome = await db.transaction.findMany({
        where: {
          userId,
          amountCents: { gt: 0 }, // Income transactions
          createdAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Calculate spending patterns
      const spendingAnalysis = envelopes.map(env => {
        const monthlySpending = env.transactions.reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / 100;
        const budgetUtilization = env.targetAmount > 0 ? monthlySpending / env.targetAmount : 0;
        
        return {
          envelope: env,
          monthlySpending,
          budgetUtilization,
          balance: env.balanceCents / 100
        };
      });

      // AI analysis for rebalancing
      const systemPrompt = `You are a financial advisor AI. Analyze spending patterns and income changes to suggest budget rebalancing.
      
      Look for:
      - Envelopes consistently over/under budget
      - Income changes requiring allocation adjustments
      - Life events that might need budget changes
      - Opportunities for better financial health
      
      Return suggestions in JSON format.`;

      const userPrompt = `Analyze this user's financial situation:

      Envelopes and spending:
      ${JSON.stringify(spendingAnalysis.map(s => ({
        name: s.envelope.name,
        targetAmount: s.envelope.targetAmount,
        monthlySpending: s.monthlySpending,
        utilization: `${Math.round(s.budgetUtilization * 100)}%`,
        currentBalance: s.balance
      })), null, 2)}

      Recent income pattern:
      ${JSON.stringify(recentIncome.map(i => ({
        amount: i.amountCents / 100,
        date: i.createdAt.toISOString().split('T')[0],
        merchant: i.merchant
      })), null, 2)}

      Should this budget be rebalanced? What specific changes do you recommend?`;

      const rebalanceResponse = await createAgentResponse(
        systemPrompt,
        userPrompt,
        [],
        { temperature: 0.1, maxTokens: 1500, useAdvancedModel: true }
      );

      // Parse response with fallback logic
      const shouldRebalance = this.detectRebalanceNeeds(spendingAnalysis);
      
      return {
        shouldRebalance: shouldRebalance.needed,
        reasons: shouldRebalance.reasons,
        suggestedChanges: shouldRebalance.changes
      };

    } catch (error) {
      logger.error({ error, userId }, 'Failed to check financial health');
      throw error;
    }
  }

  private detectSimpleRecurringPatterns(transactions: any[]) {
    // Simple pattern detection as fallback
    const merchantCounts = new Map();
    const merchantAmounts = new Map();

    transactions.forEach(t => {
      const merchant = t.merchant;
      merchantCounts.set(merchant, (merchantCounts.get(merchant) || 0) + 1);
      
      if (!merchantAmounts.has(merchant)) {
        merchantAmounts.set(merchant, []);
      }
      merchantAmounts.get(merchant).push(Math.abs(t.amountCents / 100));
    });

    const bills = [];
    let totalEstimated = 0;

    merchantCounts.forEach((count, merchant) => {
      if (count >= 2) { // Appeared at least twice
        const amounts = merchantAmounts.get(merchant);
        const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
        
        if (avgAmount > 20) { // Likely a bill if over $20
          bills.push({
            name: merchant,
            amount: Math.round(avgAmount),
            frequency: 'monthly',
            confidence: Math.min(count / 3, 1)
          });
          totalEstimated += avgAmount;
        }
      }
    });

    return { bills, totalEstimated };
  }

  private detectRebalanceNeeds(spendingAnalysis: any[]) {
    const reasons = [];
    const changes = [];
    let needed = false;

    spendingAnalysis.forEach(analysis => {
      // Over-budget envelopes
      if (analysis.budgetUtilization > 1.2) {
        needed = true;
        reasons.push(`${analysis.envelope.name} is consistently over budget (${Math.round(analysis.budgetUtilization * 100)}% utilization)`);
        changes.push({
          envelopeId: analysis.envelope.id,
          envelopeName: analysis.envelope.name,
          currentAmount: analysis.envelope.targetAmount,
          suggestedAmount: Math.round(analysis.monthlySpending * 1.1),
          reason: 'Increase to cover actual spending with 10% buffer'
        });
      }

      // Under-utilized envelopes
      if (analysis.budgetUtilization < 0.5 && analysis.envelope.targetAmount > 50) {
        needed = true;
        reasons.push(`${analysis.envelope.name} is under-utilized (${Math.round(analysis.budgetUtilization * 100)}% utilization)`);
        changes.push({
          envelopeId: analysis.envelope.id,
          envelopeName: analysis.envelope.name,
          currentAmount: analysis.envelope.targetAmount,
          suggestedAmount: Math.max(50, Math.round(analysis.monthlySpending * 1.2)),
          reason: 'Reduce allocation and redirect to other priorities'
        });
      }
    });

    return { needed, reasons, changes };
  }

  async suggestBillsEnvelopeSetup(
    userId: string,
    billAnalysis: BillAnalysis
  ): Promise<{ envelopeId: string; setupSuccess: boolean }> {
    try {
      // Check if user already has a bills envelope
      const existingBillsEnvelope = await db.envelope.findFirst({
        where: {
          userId,
          name: { contains: 'Bills', mode: 'insensitive' }
        }
      });

      if (existingBillsEnvelope) {
        // Update existing envelope
        await db.envelope.update({
          where: { id: existingBillsEnvelope.id },
          data: {
            targetAmount: billAnalysis.recommendedBillsEnvelopeAmount,
            description: `Monthly bills with ${billAnalysis.suggestedBuffer}% buffer`,
          }
        });

        return { envelopeId: existingBillsEnvelope.id, setupSuccess: true };
      } else {
        // Create new bills envelope
        const billsEnvelope = await db.envelope.create({
          data: {
            userId,
            name: 'Bills & Overhead',
            icon: '🧾',
            color: 'blue',
            targetAmount: billAnalysis.recommendedBillsEnvelopeAmount,
            description: `Monthly bills with ${billAnalysis.suggestedBuffer}% buffer`,
            category: 'necessities',
            priority: 'essential',
          }
        });

        return { envelopeId: billsEnvelope.id, setupSuccess: true };
      }

    } catch (error) {
      logger.error({ error, userId }, 'Failed to set up bills envelope');
      return { envelopeId: '', setupSuccess: false };
    }
  }
}

export const billAnalyzer = new BillAnalyzer();
