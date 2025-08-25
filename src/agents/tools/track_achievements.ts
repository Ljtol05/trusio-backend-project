
import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/db.js';
import type { FinancialContext } from '../types.js';

// Track achievements schema
const trackAchievementsSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  achievementType: z.enum([
    'savings_milestone',
    'budget_adherence',
    'debt_reduction',
    'spending_goal',
    'envelope_funding',
    'transfer_efficiency'
  ]).optional(),
  timeframe: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
  includeProgress: z.boolean().default(true),
});

export const trackAchievements = tool({
  name: 'track_achievements',
  description: 'Track and analyze user financial achievements and milestones',
  parameters: trackAchievementsSchema,
  async execute(params, context) {
    try {
      logger.info({ params }, 'Executing track achievements tool');

      const { userId, achievementType, timeframe, includeProgress } = params;

      // Get user's financial data
      const [envelopes, transactions, transfers] = await Promise.all([
        prisma.envelope.findMany({
          where: { userId },
          orderBy: { balance: 'desc' }
        }),
        prisma.transaction.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          take: 100
        }),
        prisma.transfer.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 50
        })
      ]);

      const achievements = [];
      const progress = [];

      // Calculate savings milestones
      const totalSavings = envelopes.reduce((sum, env) => sum + env.balance, 0);
      const savingsMilestones = [1000, 5000, 10000, 25000, 50000, 100000];
      
      for (const milestone of savingsMilestones) {
        if (totalSavings >= milestone) {
          achievements.push({
            type: 'savings_milestone',
            title: `Savings Milestone: $${milestone.toLocaleString()}`,
            description: `Congratulations! You've saved $${totalSavings.toLocaleString()}`,
            achieved: true,
            achievedDate: new Date(),
            value: milestone
          });
        } else if (includeProgress) {
          const progressPercent = Math.round((totalSavings / milestone) * 100);
          progress.push({
            type: 'savings_milestone',
            title: `Next Milestone: $${milestone.toLocaleString()}`,
            description: `You're ${progressPercent}% of the way to your next savings milestone`,
            progress: progressPercent,
            current: totalSavings,
            target: milestone
          });
          break; // Only show next milestone
        }
      }

      // Budget adherence analysis
      const budgetEnvelopes = envelopes.filter(env => env.budget > 0);
      let budgetAdherenceCount = 0;
      
      for (const envelope of budgetEnvelopes) {
        const monthlySpending = transactions
          .filter(t => t.envelopeId === envelope.id)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
        if (monthlySpending <= envelope.budget) {
          budgetAdherenceCount++;
        }
      }

      if (budgetEnvelopes.length > 0) {
        const adherenceRate = Math.round((budgetAdherenceCount / budgetEnvelopes.length) * 100);
        
        if (adherenceRate >= 90) {
          achievements.push({
            type: 'budget_adherence',
            title: 'Budget Master',
            description: `Stayed within budget for ${adherenceRate}% of your envelopes this month`,
            achieved: true,
            achievedDate: new Date(),
            value: adherenceRate
          });
        } else if (includeProgress) {
          progress.push({
            type: 'budget_adherence',
            title: 'Budget Adherence Progress',
            description: `You're on track with ${adherenceRate}% of your budgets`,
            progress: adherenceRate,
            current: budgetAdherenceCount,
            target: budgetEnvelopes.length
          });
        }
      }

      // Transfer efficiency (smart fund management)
      if (transfers.length >= 5) {
        achievements.push({
          type: 'transfer_efficiency',
          title: 'Smart Money Manager',
          description: `You've made ${transfers.length} strategic transfers to optimize your finances`,
          achieved: true,
          achievedDate: new Date(),
          value: transfers.length
        });
      }

      // Envelope funding consistency
      const fundedEnvelopes = envelopes.filter(env => env.balance > 0).length;
      const totalEnvelopes = envelopes.length;
      
      if (totalEnvelopes > 0) {
        const fundingRate = Math.round((fundedEnvelopes / totalEnvelopes) * 100);
        
        if (fundingRate >= 80) {
          achievements.push({
            type: 'envelope_funding',
            title: 'Envelope Organizer',
            description: `You have funds in ${fundingRate}% of your envelopes - great organization!`,
            achieved: true,
            achievedDate: new Date(),
            value: fundingRate
          });
        } else if (includeProgress) {
          progress.push({
            type: 'envelope_funding',
            title: 'Envelope Funding Progress',
            description: `Fund more envelopes to improve your organization`,
            progress: fundingRate,
            current: fundedEnvelopes,
            target: totalEnvelopes
          });
        }
      }

      const result = {
        success: true,
        achievements,
        progress: includeProgress ? progress : undefined,
        summary: {
          totalAchievements: achievements.length,
          totalSavings,
          budgetAdherenceRate: budgetEnvelopes.length > 0 ? Math.round((budgetAdherenceCount / budgetEnvelopes.length) * 100) : 0,
          activeEnvelopes: fundedEnvelopes,
          totalTransfers: transfers.length
        }
      };

      logger.info({ 
        userId, 
        achievementCount: achievements.length,
        progressItems: progress.length 
      }, 'Achievement tracking completed');

      return JSON.stringify(result);

    } catch (error) {
      logger.error({ error: error.message, params }, 'Error tracking achievements');
      return JSON.stringify({
        success: false,
        error: 'Failed to track achievements. Please try again.'
      });
    }
  }
});

export default trackAchievements;
