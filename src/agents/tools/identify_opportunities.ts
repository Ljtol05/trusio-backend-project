
import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/db.js';
import type { FinancialContext } from '../types.js';

// Identify opportunities schema
const identifyOpportunitiesSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  analysisType: z.enum([
    'savings_optimization',
    'budget_reallocation',
    'spending_reduction',
    'goal_acceleration',
    'envelope_consolidation',
    'all'
  ]).default('all'),
  timeframe: z.enum(['30_days', '90_days', '6_months', '1_year']).default('90_days'),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
});

export const identifyOpportunities = tool({
  name: 'identify_opportunities',
  description: 'Analyze financial data to identify savings and optimization opportunities',
  parameters: identifyOpportunitiesSchema,
  async execute(params, context) {
    try {
      logger.info({ params }, 'Executing identify opportunities tool');

      const { userId, analysisType, timeframe, riskTolerance } = params;

      // Calculate timeframe in days
      const timeframeDays = {
        '30_days': 30,
        '90_days': 90,
        '6_months': 180,
        '1_year': 365
      }[timeframe];

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

      // Get comprehensive financial data
      const [envelopes, transactions, transfers] = await Promise.all([
        prisma.envelope.findMany({
          where: { userId },
          include: {
            transactions: {
              where: { date: { gte: cutoffDate } },
              orderBy: { date: 'desc' }
            }
          }
        }),
        prisma.transaction.findMany({
          where: { 
            userId,
            date: { gte: cutoffDate }
          },
          orderBy: { date: 'desc' }
        }),
        prisma.transfer.findMany({
          where: { 
            userId,
            createdAt: { gte: cutoffDate }
          },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      const opportunities = [];

      // Savings optimization opportunities
      if (analysisType === 'savings_optimization' || analysisType === 'all') {
        // Find overfunded envelopes
        const overfundedEnvelopes = envelopes.filter(env => {
          if (env.budget <= 0) return false;
          const monthlySpending = env.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
          const avgMonthlySpending = monthlySpending / (timeframeDays / 30);
          return env.balance > (avgMonthlySpending * 3); // More than 3 months of spending
        });

        for (const envelope of overfundedEnvelopes) {
          const monthlySpending = envelope.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / (timeframeDays / 30);
          const excessAmount = envelope.balance - (monthlySpending * 2); // Keep 2 months buffer
          
          if (excessAmount > 50) { // Only suggest if meaningful amount
            opportunities.push({
              type: 'savings_optimization',
              priority: 'medium',
              title: `Optimize ${envelope.name} Envelope`,
              description: `You have excess funds in ${envelope.name}. Consider moving $${excessAmount.toFixed(2)} to savings or other goals.`,
              potentialSavings: excessAmount,
              action: 'transfer_excess_funds',
              envelope: envelope.name,
              envelopeId: envelope.id,
              recommendedAmount: excessAmount
            });
          }
        }
      }

      // Budget reallocation opportunities
      if (analysisType === 'budget_reallocation' || analysisType === 'all') {
        const budgetAnalysis = envelopes
          .filter(env => env.budget > 0)
          .map(env => {
            const actualSpending = env.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
            const avgMonthlySpending = actualSpending / (timeframeDays / 30);
            const budgetUtilization = avgMonthlySpending / env.budget;
            
            return {
              envelope: env,
              budgetUtilization,
              avgMonthlySpending,
              variance: env.budget - avgMonthlySpending
            };
          });

        // Find underutilized budgets
        const underutilized = budgetAnalysis.filter(item => item.budgetUtilization < 0.7 && item.variance > 20);
        const overutilized = budgetAnalysis.filter(item => item.budgetUtilization > 1.2);

        if (underutilized.length > 0 && overutilized.length > 0) {
          const totalUnderutilized = underutilized.reduce((sum, item) => sum + item.variance, 0);
          
          opportunities.push({
            type: 'budget_reallocation',
            priority: 'high',
            title: 'Rebalance Your Budget',
            description: `You could reallocate $${totalUnderutilized.toFixed(2)} from underused categories to areas where you're overspending.`,
            potentialSavings: totalUnderutilized * 0.1, // Assume 10% efficiency gain
            action: 'rebalance_budgets',
            underutilizedEnvelopes: underutilized.map(item => ({
              name: item.envelope.name,
              id: item.envelope.id,
              excessBudget: item.variance
            })),
            overutilizedEnvelopes: overutilized.map(item => ({
              name: item.envelope.name,
              id: item.envelope.id,
              shortfall: Math.abs(item.variance)
            }))
          });
        }
      }

      // Spending reduction opportunities
      if (analysisType === 'spending_reduction' || analysisType === 'all') {
        // Analyze transaction patterns for reduction opportunities
        const categorySpending = {};
        
        transactions.forEach(transaction => {
          const envelope = envelopes.find(env => env.id === transaction.envelopeId);
          const category = envelope?.category || 'uncategorized';
          
          if (!categorySpending[category]) {
            categorySpending[category] = { total: 0, count: 0, transactions: [] };
          }
          
          categorySpending[category].total += Math.abs(transaction.amount);
          categorySpending[category].count++;
          categorySpending[category].transactions.push(transaction);
        });

        // Find high-spending categories with reduction potential
        Object.entries(categorySpending).forEach(([category, data]) => {
          const avgTransactionAmount = data.total / data.count;
          const monthlySpending = data.total / (timeframeDays / 30);
          
          if (monthlySpending > 200 && category !== 'savings' && category !== 'investments') {
            const potentialReduction = monthlySpending * 0.15; // 15% reduction potential
            
            opportunities.push({
              type: 'spending_reduction',
              priority: 'medium',
              title: `Reduce ${category.charAt(0).toUpperCase() + category.slice(1)} Spending`,
              description: `You spend $${monthlySpending.toFixed(2)} monthly on ${category}. Consider reducing by 15% to save $${potentialReduction.toFixed(2)} per month.`,
              potentialSavings: potentialReduction * 12, // Annual savings
              action: 'reduce_category_spending',
              category,
              currentMonthlySpending: monthlySpending,
              recommendedReduction: potentialReduction,
              annualSavings: potentialReduction * 12
            });
          }
        });
      }

      // Goal acceleration opportunities
      if (analysisType === 'goal_acceleration' || analysisType === 'all') {
        const savingsEnvelopes = envelopes.filter(env => 
          env.category === 'savings' || env.name.toLowerCase().includes('goal') || env.name.toLowerCase().includes('save')
        );

        if (savingsEnvelopes.length > 0) {
          const totalMonthlySpending = transactions
            .filter(t => t.amount < 0) // Only expenses
            .reduce((sum, t) => sum + Math.abs(t.amount), 0) / (timeframeDays / 30);

          const potentialSavingsIncrease = totalMonthlySpending * 0.05; // 5% of spending could go to savings

          opportunities.push({
            type: 'goal_acceleration',
            priority: 'high',
            title: 'Accelerate Your Savings Goals',
            description: `By reducing spending by just 5%, you could add $${potentialSavingsIncrease.toFixed(2)} monthly to your savings goals.`,
            potentialSavings: potentialSavingsIncrease * 12,
            action: 'increase_savings_rate',
            currentMonthlySavings: savingsEnvelopes.reduce((sum, env) => sum + env.balance, 0),
            recommendedIncrease: potentialSavingsIncrease,
            annualImpact: potentialSavingsIncrease * 12
          });
        }
      }

      // Envelope consolidation opportunities
      if (analysisType === 'envelope_consolidation' || analysisType === 'all') {
        const lowActivityEnvelopes = envelopes.filter(env => {
          const transactionCount = env.transactions.length;
          const hasLowBalance = env.balance < 10;
          const hasLowActivity = transactionCount < 2;
          
          return hasLowBalance && hasLowActivity && env.category !== 'savings';
        });

        if (lowActivityEnvelopes.length >= 3) {
          opportunities.push({
            type: 'envelope_consolidation',
            priority: 'low',
            title: 'Simplify Your Envelope System',
            description: `You have ${lowActivityEnvelopes.length} envelopes with minimal activity. Consider consolidating them to simplify your system.`,
            potentialSavings: 0, // No direct savings, but improved organization
            action: 'consolidate_envelopes',
            envelopesToConsolidate: lowActivityEnvelopes.map(env => ({
              name: env.name,
              id: env.id,
              balance: env.balance,
              transactionCount: env.transactions.length
            }))
          });
        }
      }

      // Sort opportunities by priority and potential savings
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      opportunities.sort((a, b) => {
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return (b.potentialSavings || 0) - (a.potentialSavings || 0);
      });

      const result = {
        success: true,
        opportunities,
        summary: {
          totalOpportunities: opportunities.length,
          totalPotentialSavings: opportunities.reduce((sum, opp) => sum + (opp.potentialSavings || 0), 0),
          highPriorityCount: opportunities.filter(opp => opp.priority === 'high').length,
          analysisTimeframe: timeframe,
          riskTolerance
        }
      };

      logger.info({ 
        userId, 
        opportunityCount: opportunities.length,
        totalPotentialSavings: result.summary.totalPotentialSavings 
      }, 'Opportunity analysis completed');

      return JSON.stringify(result);

    } catch (error) {
      logger.error({ error: error.message, params }, 'Error identifying opportunities');
      return JSON.stringify({
        success: false,
        error: 'Failed to identify opportunities. Please try again.'
      });
    }
  }
});

export default identifyOpportunities;
