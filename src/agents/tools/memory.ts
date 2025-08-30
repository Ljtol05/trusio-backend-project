import { z } from 'zod';
import { logger } from '../../lib/logger.ts';
import { memoryManager } from '../core/MemoryManager.ts';
import { goalTracker } from '../core/GoalTracker.ts';
import type { ToolFunction, FinancialContext } from './types.ts';

// Store user preference tool
export const storeUserPreference: ToolFunction = {
  name: 'store_user_preference',
  description: 'Store a user preference or learning for future personalization',
  category: 'memory',
  riskLevel: 'low',
  requiresAuth: true,
  estimatedDuration: 500,
  schema: z.object({
    userId: z.string().min(1, 'User ID is required'),
    preferenceKey: z.string().min(1, 'Preference key is required'),
    preferenceValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    category: z.enum(['budgeting', 'communication', 'goals', 'risk_management', 'general']).optional(),
    confidence: z.number().min(0).max(1).default(0.8),
  }),
  execute: async (params, context) => {
    try {
      const { userId, preferenceKey, preferenceValue, category, confidence } = params;

      await memoryManager.storePreference(
        userId,
        preferenceKey,
        preferenceValue,
        context.agentName,
        context.sessionId
      );

      logger.info({
        userId,
        preferenceKey,
        category: category || 'general',
        agentName: context.agentName
      }, 'User preference stored');

      return {
        success: true,
        message: `Preference "${preferenceKey}" stored successfully`,
        storedValue: preferenceValue,
        category: category || 'general',
      };

    } catch (error: any) {
      logger.error({
        error: error.message,
        userId: params.userId,
        preferenceKey: params.preferenceKey
      }, 'Failed to store user preference');

      return {
        success: false,
        error: error.message,
        message: 'Failed to store user preference',
      };
    }
  },
};

// Store insight tool
export const storeInsight: ToolFunction = {
  name: 'store_insight',
  description: 'Store an insight or learning about the user for future reference',
  category: 'memory',
  riskLevel: 'low',
  requiresAuth: true,
  estimatedDuration: 500,
  schema: z.object({
    userId: z.string().min(1, 'User ID is required'),
    insight: z.string().min(10, 'Insight must be at least 10 characters'),
    category: z.string().min(1, 'Category is required'),
    confidence: z.number().min(0).max(1).default(0.8),
    tags: z.array(z.string()).optional(),
  }),
  execute: async (params, context) => {
    try {
      const { userId, insight, category, confidence, tags } = params;

      await memoryManager.storeInsight(
        userId,
        context.agentName || 'unknown',
        insight,
        category,
        confidence,
        context.sessionId
      );

      logger.info({
        userId,
        category,
        confidence,
        agentName: context.agentName,
        insightLength: insight.length
      }, 'Insight stored in memory');

      return {
        success: true,
        message: 'Insight stored successfully',
        category,
        confidence,
        tags: tags || [],
      };

    } catch (error: any) {
      logger.error({
        error: error.message,
        userId: params.userId,
        category: params.category
      }, 'Failed to store insight');

      return {
        success: false,
        error: error.message,
        message: 'Failed to store insight',
      };
    }
  },
};

// Get user memory profile tool
export const getUserMemoryProfile: ToolFunction = {
  name: 'get_user_memory_profile',
  description: 'Retrieve user memory profile with preferences and learnings',
  category: 'memory',
  riskLevel: 'low',
  requiresAuth: true,
  estimatedDuration: 300,
  schema: z.object({
    userId: z.string().min(1, 'User ID is required'),
    includeHistory: z.boolean().default(false),
  }),
  execute: async (params, context) => {
    try {
      const { userId, includeHistory } = params;

      const memoryProfile = await memoryManager.getUserMemoryProfile(userId);

      if (!memoryProfile) {
        return {
          success: true,
          message: 'No memory profile found - new user',
          profile: null,
          isNewUser: true,
        };
      }

      let interactionHistory: any[] = [];
      if (includeHistory) {
        interactionHistory = await memoryManager.getInteractionHistory(
          userId,
          context.agentName,
          undefined,
          10
        );
      }

      logger.info({
        userId,
        agentName: context.agentName,
        profileFound: true,
        historyLength: interactionHistory.length
      }, 'User memory profile retrieved');

      return {
        success: true,
        profile: memoryProfile,
        interactionHistory: includeHistory ? interactionHistory : undefined,
        lastInteraction: memoryProfile.context.lastInteraction,
        currentFocus: memoryProfile.context.currentFocus,
      };

    } catch (error: any) {
      logger.error({
        error: error.message,
        userId: params.userId
      }, 'Failed to get user memory profile');

      return {
        success: false,
        error: error.message,
        message: 'Failed to retrieve user memory profile',
      };
    }
  },
};

// Track goal progress tool
export const trackGoalProgress: ToolFunction = {
  name: 'track_goal_progress',
  description: 'Track and analyze progress for user financial goals',
  category: 'memory',
  riskLevel: 'low',
  requiresAuth: true,
  estimatedDuration: 1000,
  schema: z.object({
    userId: z.string().min(1, 'User ID is required'),
    goalId: z.string().optional(),
    generateRecommendations: z.boolean().default(true),
  }),
  execute: async (params, context) => {
    try {
      const { userId, goalId, generateRecommendations } = params;

      // Build financial context for goal tracking
      const financialContext = context as FinancialContext;

      if (!financialContext.goals || financialContext.goals.length === 0) {
        return {
          success: true,
          message: 'No goals found to track',
          goalCount: 0,
          tracking: [],
        };
      }

      // Track progress for all goals or specific goal
      const goalsToTrack = goalId 
        ? financialContext.goals.filter(g => g.id === goalId)
        : financialContext.goals;

      const trackingResults = await goalTracker.trackGoalProgress(userId, {
        ...financialContext,
        goals: goalsToTrack,
      });

      // Get goal summary
      const goalSummary = await goalTracker.getGoalSummary(userId);

      logger.info({
        userId,
        goalId: goalId || 'all',
        trackedGoals: trackingResults.length,
        onTrack: goalSummary.onTrack,
        needsAttention: goalSummary.needsAttention
      }, 'Goal progress tracked');

      return {
        success: true,
        goalCount: trackingResults.length,
        tracking: trackingResults,
        summary: goalSummary,
        recommendations: generateRecommendations ? 
          trackingResults.flatMap(t => t.recommendations) : undefined,
      };

    } catch (error: any) {
      logger.error({
        error: error.message,
        userId: params.userId,
        goalId: params.goalId
      }, 'Failed to track goal progress');

      return {
        success: false,
        error: error.message,
        message: 'Failed to track goal progress',
      };
    }
  },
};

// Get contextual recommendations tool
export const getContextualRecommendations: ToolFunction = {
  name: 'get_contextual_recommendations',
  description: 'Get personalized recommendations based on user memory and context',
  category: 'memory',
  riskLevel: 'low',
  requiresAuth: true,
  estimatedDuration: 800,
  schema: z.object({
    userId: z.string().min(1, 'User ID is required'),
    focus: z.enum(['budgeting', 'goals', 'spending', 'general']).default('general'),
    limit: z.number().min(1).max(10).default(5),
  }),
  execute: async (params, context) => {
    try {
      const { userId, focus, limit } = params;

      // Get user memory profile
      const memoryProfile = await memoryManager.getUserMemoryProfile(userId);

      if (!memoryProfile) {
        return {
          success: true,
          message: 'No user history available for personalized recommendations',
          recommendations: [],
          isNewUser: true,
        };
      }

      // Generate contextual recommendations based on memory profile
      const recommendations = await this.generatePersonalizedRecommendations(
        memoryProfile,
        focus,
        context as FinancialContext,
        limit
      );

      logger.info({
        userId,
        focus,
        recommendationCount: recommendations.length,
        currentFocus: memoryProfile.context.currentFocus
      }, 'Contextual recommendations generated');

      return {
        success: true,
        recommendations,
        userFocus: memoryProfile.context.currentFocus,
        preferences: {
          budgetingStyle: memoryProfile.preferences.budgetingStyle,
          communicationStyle: memoryProfile.preferences.communicationStyle,
          riskTolerance: memoryProfile.preferences.riskTolerance,
        },
      };

    } catch (error: any) {
      logger.error({
        error: error.message,
        userId: params.userId,
        focus: params.focus
      }, 'Failed to get contextual recommendations');

      return {
        success: false,
        error: error.message,
        message: 'Failed to generate contextual recommendations',
      };
    }
  },

  // Helper method for generating personalized recommendations
  async generatePersonalizedRecommendations(
    profile: any,
    focus: string,
    context: FinancialContext,
    limit: number
  ): Promise<Array<{
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    category: string;
    actionable: boolean;
  }>> {
    const recommendations: any[] = [];

    // Focus-specific recommendations
    switch (focus) {
      case 'budgeting':
        if (profile.preferences.budgetingStyle === 'flexible' && profile.learnings.challenges.length > 0) {
          recommendations.push({
            title: 'Consider a Stricter Budgeting Approach',
            description: 'Based on your recent challenges, a more structured approach might help.',
            priority: 'medium',
            category: 'budgeting',
            actionable: true,
          });
        }
        break;

      case 'goals':
        if (profile.context.majorGoals.length > 0) {
          recommendations.push({
            title: `Focus on ${profile.context.majorGoals[0]}`,
            description: 'Prioritizing your main goal can lead to faster progress.',
            priority: 'high',
            category: 'goals',
            actionable: true,
          });
        }
        break;

      case 'spending':
        if (profile.learnings.spendingPatterns && Object.keys(profile.learnings.spendingPatterns).length > 0) {
          recommendations.push({
            title: 'Review Your Spending Patterns',
            description: 'We\'ve identified some patterns that might benefit from optimization.',
            priority: 'medium',
            category: 'spending',
            actionable: true,
          });
        }
        break;
    }

    // General recommendations based on successful strategies
    if (profile.learnings.successfulStrategies.length > 0) {
      recommendations.push({
        title: 'Build on Your Successes',
        description: `Continue using strategies that have worked: ${profile.learnings.successfulStrategies[0]}`,
        priority: 'medium',
        category: 'general',
        actionable: true,
      });
    }

    return recommendations.slice(0, limit);
  },
};

// Export all memory tools
export const memoryTools = {
  store_user_preference: storeUserPreference,
  store_insight: storeInsight,
  get_user_memory_profile: getUserMemoryProfile,
  track_goal_progress: trackGoalProgress,
  get_contextual_recommendations: getContextualRecommendations,
};