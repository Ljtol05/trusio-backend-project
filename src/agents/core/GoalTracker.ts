
import { logger } from '../../lib/logger.js';
import { db } from '../../lib/db.js';
import { memoryManager } from './MemoryManager.js';
import type { GoalTrackingContext, FinancialContext } from '../types.js';

export interface GoalProgress {
  goalId: string;
  previousAmount: number;
  currentAmount: number;
  progressChange: number;
  trend: 'improving' | 'stable' | 'declining';
  timeToTarget: number | null;
  achievementRate: number;
}

export interface GoalMilestone {
  goalId: string;
  description: string;
  targetAmount: number;
  achievedAt?: Date;
  celebrationMessage?: string;
}

export class GoalTracker {
  private readonly MILESTONE_PERCENTAGES = [25, 50, 75, 90, 100];

  /**
   * Track progress for all user goals and generate insights
   */
  async trackGoalProgress(
    userId: string,
    context: FinancialContext
  ): Promise<GoalTrackingContext[]> {
    try {
      if (!context.goals || context.goals.length === 0) {
        return [];
      }

      const progressData: GoalTrackingContext[] = [];

      for (const goal of context.goals) {
        const trackingContext = await this.analyzeGoalProgress(userId, goal, context);
        progressData.push(trackingContext);

        // Store progress insights
        await this.storeGoalInsights(userId, goal.id, trackingContext);
      }

      logger.info({
        userId,
        goalCount: progressData.length,
        onTrackCount: progressData.filter(g => g.progress.trend === 'improving').length,
      }, 'Goal progress tracking completed');

      return progressData;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to track goal progress');
      throw new Error('Failed to track goal progress');
    }
  }

  /**
   * Analyze individual goal progress
   */
  private async analyzeGoalProgress(
    userId: string,
    goal: any,
    context: FinancialContext
  ): Promise<GoalTrackingContext> {
    try {
      const currentProgress = goal.targetAmount > 0 ? 
        (goal.currentAmount / goal.targetAmount) * 100 : 0;

      // Get historical progress data
      const historicalProgress = await this.getHistoricalProgress(userId, goal.id);
      const trend = this.determineTrend(historicalProgress, goal.currentAmount);

      // Calculate time to target
      const timeToTarget = this.calculateTimeToTarget(goal, historicalProgress);

      // Generate milestones
      const milestones = this.generateMilestones(goal, currentProgress);

      // Find next milestone
      const nextMilestone = milestones.find(m => 
        (goal.currentAmount / goal.targetAmount) * 100 < this.MILESTONE_PERCENTAGES[milestones.indexOf(m)]
      );

      // Generate insights and recommendations
      const insights = await this.generateGoalInsights(goal, trend, timeToTarget, context);
      const recommendations = this.generateGoalRecommendations(goal, trend, context);

      const trackingContext: GoalTrackingContext = {
        goalId: goal.id,
        description: goal.description,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        deadline: goal.deadline,
        progress: {
          percentage: Math.round(currentProgress * 100) / 100,
          trend,
          milestones,
          nextMilestone: nextMilestone || undefined,
        },
        insights,
        recommendations,
      };

      return trackingContext;

    } catch (error) {
      logger.error({ error, userId, goalId: goal.id }, 'Failed to analyze goal progress');
      throw new Error('Failed to analyze goal progress');
    }
  }

  /**
   * Get historical progress data for a goal
   */
  private async getHistoricalProgress(userId: string, goalId: string): Promise<GoalProgress[]> {
    try {
      // In a production system, you'd have a dedicated goal_progress table
      // For now, we'll get goal data from recent snapshots
      const goal = await db.goal.findUnique({
        where: { id: goalId },
        select: {
          id: true,
          currentAmount: true,
          updatedAt: true,
        },
      });

      if (!goal) return [];

      // Simulate historical data for now
      // In production, you'd store goal progress snapshots regularly
      return [{
        goalId,
        previousAmount: goal.currentAmount * 0.9, // Simulate 10% less previous amount
        currentAmount: goal.currentAmount,
        progressChange: goal.currentAmount * 0.1,
        trend: 'improving' as const,
        timeToTarget: null,
        achievementRate: 0.1, // 10% per period
      }];

    } catch (error) {
      logger.error({ error, userId, goalId }, 'Failed to get historical progress');
      return [];
    }
  }

  /**
   * Determine progress trend based on historical data
   */
  private determineTrend(
    historicalProgress: GoalProgress[],
    currentAmount: number
  ): 'improving' | 'stable' | 'declining' {
    if (historicalProgress.length === 0) return 'stable';

    const recent = historicalProgress[0];
    const progressChange = currentAmount - recent.previousAmount;

    if (progressChange > recent.previousAmount * 0.05) return 'improving'; // 5% improvement
    if (progressChange < -recent.previousAmount * 0.02) return 'declining'; // 2% decline
    return 'stable';
  }

  /**
   * Calculate estimated time to reach target
   */
  private calculateTimeToTarget(
    goal: any,
    historicalProgress: GoalProgress[]
  ): number | null {
    try {
      if (historicalProgress.length === 0 || goal.currentAmount >= goal.targetAmount) {
        return null;
      }

      const recent = historicalProgress[0];
      const achievementRate = recent.achievementRate || 0.1; // Default 10% per period

      const remaining = goal.targetAmount - goal.currentAmount;
      const periodsToComplete = remaining / (goal.targetAmount * achievementRate);

      // Convert to days (assuming monthly periods)
      return Math.ceil(periodsToComplete * 30);

    } catch (error) {
      return null;
    }
  }

  /**
   * Generate milestone descriptions for the goal
   */
  private generateMilestones(goal: any, currentProgress: number): string[] {
    const milestones: string[] = [];

    this.MILESTONE_PERCENTAGES.forEach(percentage => {
      const amount = (goal.targetAmount * percentage) / 100;
      const achieved = currentProgress >= percentage;
      const status = achieved ? '✅' : '⏳';
      
      milestones.push(
        `${status} ${percentage}% - $${amount.toFixed(2)} ${achieved ? '(Achieved)' : ''}`
      );
    });

    return milestones;
  }

  /**
   * Generate insights about goal progress
   */
  private async generateGoalInsights(
    goal: any,
    trend: 'improving' | 'stable' | 'declining',
    timeToTarget: number | null,
    context: FinancialContext
  ): Promise<string[]> {
    const insights: string[] = [];

    // Progress trend insights
    switch (trend) {
      case 'improving':
        insights.push(`Great progress! You're moving steadily toward your ${goal.description} goal.`);
        break;
      case 'stable':
        insights.push(`Your progress toward ${goal.description} has been consistent but steady.`);
        break;
      case 'declining':
        insights.push(`Your progress toward ${goal.description} has slowed. Consider reviewing your strategy.`);
        break;
    }

    // Time to target insights
    if (timeToTarget) {
      const months = Math.ceil(timeToTarget / 30);
      if (goal.deadline) {
        const deadline = new Date(goal.deadline);
        const timeRemaining = deadline.getTime() - Date.now();
        const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
        
        if (timeToTarget > daysRemaining) {
          insights.push(`You may need to increase contributions to reach your goal by the deadline.`);
        } else {
          insights.push(`You're on track to reach your goal ${Math.ceil((daysRemaining - timeToTarget) / 30)} months ahead of schedule!`);
        }
      } else {
        insights.push(`At current rate, you'll reach your goal in approximately ${months} months.`);
      }
    }

    // Contextual insights based on financial situation
    if (context.totalIncome && context.totalExpenses) {
      const availableForGoals = context.totalIncome - context.totalExpenses;
      const goalContributionNeeded = (goal.targetAmount - goal.currentAmount) / 12; // Monthly

      if (goalContributionNeeded > availableForGoals * 0.5) {
        insights.push(`This goal requires ${((goalContributionNeeded / availableForGoals) * 100).toFixed(0)}% of your available funds. Consider adjusting your budget or timeline.`);
      }
    }

    return insights;
  }

  /**
   * Generate actionable recommendations for goal achievement
   */
  private generateGoalRecommendations(
    goal: any,
    trend: 'improving' | 'stable' | 'declining',
    context: FinancialContext
  ): string[] {
    const recommendations: string[] = [];

    // Trend-based recommendations
    if (trend === 'declining') {
      recommendations.push(`Review your budget to find additional funds for ${goal.description}`);
      recommendations.push(`Consider automating transfers to make progress more consistent`);
    }

    if (trend === 'stable') {
      recommendations.push(`Look for opportunities to increase contributions through expense optimization`);
    }

    // Progress-based recommendations
    const progressPercentage = (goal.currentAmount / goal.targetAmount) * 100;
    
    if (progressPercentage < 25) {
      recommendations.push(`Set up automatic transfers to build momentum toward your goal`);
      recommendations.push(`Start with small, consistent contributions to establish the habit`);
    } else if (progressPercentage >= 75) {
      recommendations.push(`You're almost there! Consider a final push to reach your target`);
      recommendations.push(`Review if you can temporarily increase contributions to finish strong`);
    }

    // Context-based recommendations
    if (context.envelopes && context.envelopes.length > 0) {
      const overFundedEnvelopes = context.envelopes.filter(env => 
        env.target > 0 && env.balance > env.target * 1.2
      );

      if (overFundedEnvelopes.length > 0) {
        recommendations.push(`Consider redirecting excess funds from over-allocated envelopes to accelerate this goal`);
      }
    }

    return recommendations.slice(0, 3); // Limit to top 3 recommendations
  }

  /**
   * Store goal insights in memory system
   */
  private async storeGoalInsights(
    userId: string,
    goalId: string,
    trackingContext: GoalTrackingContext
  ): Promise<void> {
    try {
      // Store progress insight
      await memoryManager.storeInsight(
        userId,
        'goal_tracker',
        `Goal "${trackingContext.description}" is ${trackingContext.progress.percentage.toFixed(1)}% complete with ${trackingContext.progress.trend} trend`,
        'goal_progress',
        0.9, // High confidence for factual progress data
        `goal_${goalId}`
      );

      // Store recommendations as insights
      for (const recommendation of trackingContext.recommendations) {
        await memoryManager.storeInsight(
          userId,
          'goal_tracker',
          recommendation,
          'goal_recommendation',
          0.8,
          `goal_${goalId}`
        );
      }

      logger.info({
        userId,
        goalId,
        insightsStored: 1 + trackingContext.recommendations.length
      }, 'Goal insights stored in memory');

    } catch (error) {
      logger.error({ error, userId, goalId }, 'Failed to store goal insights');
    }
  }

  /**
   * Check for milestone achievements and trigger celebrations
   */
  async checkMilestoneAchievements(
    userId: string,
    goalId: string,
    previousAmount: number,
    currentAmount: number,
    targetAmount: number
  ): Promise<GoalMilestone[]> {
    try {
      const achievements: GoalMilestone[] = [];
      
      const previousProgress = (previousAmount / targetAmount) * 100;
      const currentProgress = (currentAmount / targetAmount) * 100;

      for (const milestone of this.MILESTONE_PERCENTAGES) {
        if (previousProgress < milestone && currentProgress >= milestone) {
          const achievement: GoalMilestone = {
            goalId,
            description: `${milestone}% Progress Milestone`,
            targetAmount: (targetAmount * milestone) / 100,
            achievedAt: new Date(),
            celebrationMessage: this.generateCelebrationMessage(milestone, targetAmount),
          };

          achievements.push(achievement);

          // Store achievement as insight
          await memoryManager.storeInsight(
            userId,
            'goal_tracker',
            achievement.celebrationMessage || `Reached ${milestone}% of goal!`,
            'milestone_achievement',
            1.0, // Certain achievement
            `goal_${goalId}`
          );
        }
      }

      if (achievements.length > 0) {
        logger.info({
          userId,
          goalId,
          achievementsCount: achievements.length,
          milestones: achievements.map(a => a.description)
        }, 'Goal milestones achieved');
      }

      return achievements;

    } catch (error) {
      logger.error({ error, userId, goalId }, 'Failed to check milestone achievements');
      return [];
    }
  }

  /**
   * Generate celebration message for milestone achievement
   */
  private generateCelebrationMessage(milestone: number, targetAmount: number): string {
    const amount = (targetAmount * milestone) / 100;
    
    const messages: Record<number, string> = {
      25: `🎉 Fantastic start! You've saved $${amount.toFixed(2)} - that's 25% of your goal!`,
      50: `🌟 Halfway there! You've reached $${amount.toFixed(2)} - keep up the excellent work!`,
      75: `🚀 Amazing progress! At $${amount.toFixed(2)}, you're 75% of the way to your goal!`,
      90: `🏆 So close! You've saved $${amount.toFixed(2)} - just one final push to the finish line!`,
      100: `🎊 GOAL ACHIEVED! Congratulations on reaching $${amount.toFixed(2)}! You did it!`,
    };

    return messages[milestone] || `Great job reaching ${milestone}% of your goal!`;
  }

  /**
   * Get goal tracking summary for a user
   */
  async getGoalSummary(userId: string): Promise<{
    totalGoals: number;
    onTrack: number;
    needsAttention: number;
    completed: number;
    totalProgress: number;
  }> {
    try {
      const goals = await db.goal.findMany({
        where: { userId },
        select: {
          id: true,
          targetAmount: true,
          currentAmount: true,
          deadline: true,
        },
      });

      if (goals.length === 0) {
        return { totalGoals: 0, onTrack: 0, needsAttention: 0, completed: 0, totalProgress: 0 };
      }

      let onTrack = 0;
      let needsAttention = 0;
      let completed = 0;
      let totalProgress = 0;

      goals.forEach(goal => {
        const progress = goal.targetAmount > 0 ? 
          (goal.currentAmount / goal.targetAmount) : 0;
        
        totalProgress += progress;

        if (progress >= 1.0) {
          completed++;
        } else if (progress >= 0.5) {
          onTrack++;
        } else {
          needsAttention++;
        }
      });

      const averageProgress = (totalProgress / goals.length) * 100;

      return {
        totalGoals: goals.length,
        onTrack,
        needsAttention,
        completed,
        totalProgress: Math.round(averageProgress * 100) / 100,
      };

    } catch (error) {
      logger.error({ error, userId }, 'Failed to get goal summary');
      throw new Error('Failed to get goal summary');
    }
  }
}

// Export singleton instance
export const goalTracker = new GoalTracker();
