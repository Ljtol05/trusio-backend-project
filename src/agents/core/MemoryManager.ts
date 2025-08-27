
import { logger } from '../../lib/logger.js';
import { db } from '../../lib/db.js';
import type { FinancialContext, AgentMemoryContext, UserProfile } from '../types.js';

export interface MemoryEntry {
  id: string;
  userId: string;
  agentName: string;
  sessionId: string;
  type: 'interaction' | 'preference' | 'insight' | 'goal' | 'context';
  content: any;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMemoryProfile {
  userId: string;
  preferences: {
    budgetingStyle: 'strict' | 'flexible' | 'aggressive' | 'conservative';
    communicationStyle: 'detailed' | 'concise' | 'encouraging' | 'analytical';
    riskTolerance: 'low' | 'medium' | 'high';
    goalPriorities: string[];
    reminderFrequency: 'daily' | 'weekly' | 'monthly';
  };
  learnings: {
    spendingPatterns: Record<string, any>;
    successfulStrategies: string[];
    challenges: string[];
    improvements: string[];
  };
  context: {
    financialSituation: string;
    majorGoals: string[];
    currentFocus: string;
    lastInteraction: Date;
  };
}

export class MemoryManager {
  private memoryCache = new Map<string, MemoryEntry[]>();
  private profileCache = new Map<string, UserMemoryProfile>();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Store interaction memory for an agent
   */
  async storeInteraction(
    userId: string,
    agentName: string,
    sessionId: string,
    userMessage: string,
    agentResponse: string,
    context: Partial<FinancialContext> = {},
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const memoryEntry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        agentName,
        sessionId,
        type: 'interaction',
        content: {
          userMessage,
          agentResponse,
          context,
        },
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          responseLength: agentResponse.length,
          messageLength: userMessage.length,
        },
      };

      // Store in database
      await db.conversation.create({
        data: {
          userId,
          sessionId,
          role: 'user',
          content: userMessage,
          agentName,
          metadata: JSON.stringify(memoryEntry.metadata),
        },
      });

      await db.conversation.create({
        data: {
          userId,
          sessionId,
          role: 'assistant',
          content: agentResponse,
          agentName,
          metadata: JSON.stringify({
            ...memoryEntry.metadata,
            originalContext: context,
          }),
        },
      });

      // Update cache
      this.updateMemoryCache(userId, {
        id: `${sessionId}-${Date.now()}`,
        ...memoryEntry,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info({
        userId,
        agentName,
        sessionId,
        messageLength: userMessage.length,
        responseLength: agentResponse.length,
      }, 'Interaction stored in memory');

    } catch (error) {
      logger.error({ error, userId, agentName }, 'Failed to store interaction memory');
      throw new Error('Failed to store interaction memory');
    }
  }

  /**
   * Store user preference or learning
   */
  async storePreference(
    userId: string,
    key: string,
    value: any,
    agentName?: string,
    sessionId?: string
  ): Promise<void> {
    try {
      const memoryEntry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        agentName: agentName || 'system',
        sessionId: sessionId || 'preference',
        type: 'preference',
        content: {
          key,
          value,
          source: agentName,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          category: this.categorizePreference(key),
        },
      };

      // Store preference in user profile or custom table if needed
      // For now, using conversation table with special type
      await db.conversation.create({
        data: {
          userId,
          sessionId: sessionId || 'preferences',
          role: 'system',
          content: JSON.stringify({ key, value }),
          agentName: agentName || 'system',
          metadata: JSON.stringify(memoryEntry.metadata),
        },
      });

      // Update profile cache
      await this.updateUserProfile(userId, { [key]: value });

      logger.info({ userId, key, agentName }, 'Preference stored in memory');

    } catch (error) {
      logger.error({ error, userId, key }, 'Failed to store preference');
      throw new Error('Failed to store preference');
    }
  }

  /**
   * Store insights or learnings about the user
   */
  async storeInsight(
    userId: string,
    agentName: string,
    insight: string,
    category: string,
    confidence: number,
    sessionId?: string
  ): Promise<void> {
    try {
      const memoryEntry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        agentName,
        sessionId: sessionId || 'insights',
        type: 'insight',
        content: {
          insight,
          category,
          confidence,
          agentSource: agentName,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          confidence,
          category,
        },
      };

      // Store in database
      await db.conversation.create({
        data: {
          userId,
          sessionId: sessionId || 'insights',
          role: 'system',
          content: insight,
          agentName,
          metadata: JSON.stringify(memoryEntry.metadata),
        },
      });

      // Update cache
      this.updateMemoryCache(userId, {
        id: `insight-${Date.now()}`,
        ...memoryEntry,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info({ userId, agentName, category, confidence }, 'Insight stored in memory');

    } catch (error) {
      logger.error({ error, userId, agentName }, 'Failed to store insight');
      throw new Error('Failed to store insight');
    }
  }

  /**
   * Retrieve user's interaction history
   */
  async getInteractionHistory(
    userId: string,
    agentName?: string,
    sessionId?: string,
    limit = 20
  ): Promise<any[]> {
    try {
      const whereClause: any = { userId };
      
      if (agentName) whereClause.agentName = agentName;
      if (sessionId) whereClause.sessionId = sessionId;

      const interactions = await db.conversation.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          role: true,
          content: true,
          agentName: true,
          sessionId: true,
          createdAt: true,
          metadata: true,
        },
      });

      return interactions.reverse(); // Return chronological order

    } catch (error) {
      logger.error({ error, userId, agentName }, 'Failed to retrieve interaction history');
      return [];
    }
  }

  /**
   * Get user memory profile with preferences and learnings
   */
  async getUserMemoryProfile(userId: string): Promise<UserMemoryProfile | null> {
    try {
      // Check cache first
      if (this.profileCache.has(userId)) {
        const cached = this.profileCache.get(userId)!;
        return cached;
      }

      // Build profile from stored data
      const preferences = await this.getUserPreferences(userId);
      const insights = await this.getUserInsights(userId);
      const recentInteractions = await this.getInteractionHistory(userId, undefined, undefined, 5);

      const profile: UserMemoryProfile = {
        userId,
        preferences: {
          budgetingStyle: preferences.budgetingStyle || 'flexible',
          communicationStyle: preferences.communicationStyle || 'detailed',
          riskTolerance: preferences.riskTolerance || 'medium',
          goalPriorities: preferences.goalPriorities || [],
          reminderFrequency: preferences.reminderFrequency || 'weekly',
        },
        learnings: {
          spendingPatterns: this.extractSpendingPatterns(insights),
          successfulStrategies: this.extractSuccessfulStrategies(insights),
          challenges: this.extractChallenges(insights),
          improvements: this.extractImprovements(insights),
        },
        context: {
          financialSituation: this.inferFinancialSituation(insights, recentInteractions),
          majorGoals: this.extractMajorGoals(insights, recentInteractions),
          currentFocus: this.inferCurrentFocus(recentInteractions),
          lastInteraction: recentInteractions.length > 0 ? 
            new Date(recentInteractions[recentInteractions.length - 1].createdAt) : 
            new Date(),
        },
      };

      // Cache the profile
      this.profileCache.set(userId, profile);

      return profile;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user memory profile');
      return null;
    }
  }

  /**
   * Build enhanced context for agent execution
   */
  async buildAgentMemoryContext(
    userId: string,
    agentName: string,
    sessionId: string,
    includeHistory = true
  ): Promise<AgentMemoryContext> {
    try {
      const memoryProfile = await this.getUserMemoryProfile(userId);
      const recentHistory = includeHistory ? 
        await this.getInteractionHistory(userId, agentName, sessionId, 10) : [];
      const relevantInsights = await this.getRelevantInsights(userId, agentName);

      const context: AgentMemoryContext = {
        userId,
        agentName,
        sessionId,
        userProfile: memoryProfile,
        conversationHistory: recentHistory,
        relevantInsights,
        contextSummary: this.buildContextSummary(memoryProfile, recentHistory, relevantInsights),
        personalizations: this.buildPersonalizations(memoryProfile, agentName),
        timestamp: new Date(),
      };

      logger.info({ 
        userId, 
        agentName, 
        sessionId,
        historyLength: recentHistory.length,
        insightsCount: relevantInsights.length 
      }, 'Built agent memory context');

      return context;

    } catch (error) {
      logger.error({ error, userId, agentName }, 'Failed to build agent memory context');
      throw new Error('Failed to build agent memory context');
    }
  }

  /**
   * Update user profile based on new information
   */
  private async updateUserProfile(userId: string, updates: Record<string, any>): Promise<void> {
    try {
      const existingProfile = this.profileCache.get(userId);
      
      if (existingProfile) {
        // Update cached profile
        const updatedProfile = {
          ...existingProfile,
          preferences: {
            ...existingProfile.preferences,
            ...updates,
          },
        };
        this.profileCache.set(userId, updatedProfile);
      }

      // Note: In a production system, you'd want a dedicated user_profiles table
      // For now, we're storing in the conversation system with metadata

    } catch (error) {
      logger.error({ error, userId }, 'Failed to update user profile');
    }
  }

  /**
   * Get user preferences from stored data
   */
  private async getUserPreferences(userId: string): Promise<Record<string, any>> {
    try {
      const preferenceRecords = await db.conversation.findMany({
        where: {
          userId,
          sessionId: 'preferences',
          role: 'system',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const preferences: Record<string, any> = {};
      
      preferenceRecords.forEach(record => {
        try {
          const content = JSON.parse(record.content);
          if (content.key && content.value) {
            preferences[content.key] = content.value;
          }
        } catch (e) {
          // Skip malformed records
        }
      });

      return preferences;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user preferences');
      return {};
    }
  }

  /**
   * Get user insights from stored data
   */
  private async getUserInsights(userId: string): Promise<any[]> {
    try {
      const insightRecords = await db.conversation.findMany({
        where: {
          userId,
          sessionId: 'insights',
          role: 'system',
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return insightRecords.map(record => ({
        content: record.content,
        agentName: record.agentName,
        createdAt: record.createdAt,
        metadata: record.metadata ? JSON.parse(record.metadata) : {},
      }));

    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user insights');
      return [];
    }
  }

  /**
   * Get insights relevant to a specific agent
   */
  private async getRelevantInsights(userId: string, agentName: string): Promise<any[]> {
    try {
      const allInsights = await this.getUserInsights(userId);
      
      // Filter insights relevant to the current agent
      const relevantInsights = allInsights.filter(insight => {
        const category = insight.metadata?.category || '';
        
        switch (agentName) {
          case 'budget_coach':
            return category.includes('budget') || category.includes('allocation') || category.includes('envelope');
          case 'transaction_analyst':
            return category.includes('spending') || category.includes('transaction') || category.includes('pattern');
          case 'insight_generator':
            return category.includes('goal') || category.includes('trend') || category.includes('recommendation');
          case 'financial_advisor':
          default:
            return true; // Financial advisor gets all insights
        }
      });

      return relevantInsights.slice(0, 10); // Limit to most recent relevant insights

    } catch (error) {
      logger.error({ error, userId, agentName }, 'Failed to get relevant insights');
      return [];
    }
  }

  // Helper methods for extracting information from insights and history

  private extractSpendingPatterns(insights: any[]): Record<string, any> {
    const patterns: Record<string, any> = {};
    
    insights.forEach(insight => {
      if (insight.metadata?.category === 'spending_pattern') {
        const content = insight.content;
        if (typeof content === 'string' && content.includes('pattern')) {
          // Extract pattern information (simplified)
          patterns[insight.agentName] = content;
        }
      }
    });

    return patterns;
  }

  private extractSuccessfulStrategies(insights: any[]): string[] {
    return insights
      .filter(insight => insight.metadata?.category === 'success' || 
                       insight.content.includes('success') || 
                       insight.content.includes('achieved'))
      .map(insight => insight.content)
      .slice(0, 5);
  }

  private extractChallenges(insights: any[]): string[] {
    return insights
      .filter(insight => insight.metadata?.category === 'challenge' || 
                       insight.content.includes('challenge') || 
                       insight.content.includes('difficulty'))
      .map(insight => insight.content)
      .slice(0, 5);
  }

  private extractImprovements(insights: any[]): string[] {
    return insights
      .filter(insight => insight.metadata?.category === 'improvement' || 
                       insight.content.includes('improve') || 
                       insight.content.includes('better'))
      .map(insight => insight.content)
      .slice(0, 5);
  }

  private inferFinancialSituation(insights: any[], interactions: any[]): string {
    // Simple inference based on recent insights and interactions
    if (insights.some(i => i.content.includes('emergency') || i.content.includes('debt'))) {
      return 'needs_attention';
    }
    if (insights.some(i => i.content.includes('goal') && i.content.includes('progress'))) {
      return 'on_track';
    }
    return 'stable';
  }

  private extractMajorGoals(insights: any[], interactions: any[]): string[] {
    const goals = new Set<string>();
    
    [...insights, ...interactions].forEach(item => {
      const content = item.content || '';
      if (content.includes('goal') || content.includes('save for') || content.includes('target')) {
        // Simple goal extraction (would be more sophisticated in production)
        if (content.includes('house') || content.includes('home')) goals.add('homeownership');
        if (content.includes('emergency')) goals.add('emergency_fund');
        if (content.includes('retirement')) goals.add('retirement');
        if (content.includes('vacation')) goals.add('vacation');
        if (content.includes('debt')) goals.add('debt_payoff');
      }
    });

    return Array.from(goals);
  }

  private inferCurrentFocus(interactions: any[]): string {
    if (interactions.length === 0) return 'getting_started';
    
    const recentContent = interactions.slice(-3).map(i => i.content).join(' ').toLowerCase();
    
    if (recentContent.includes('budget') || recentContent.includes('envelope')) return 'budgeting';
    if (recentContent.includes('spending') || recentContent.includes('transaction')) return 'expense_analysis';
    if (recentContent.includes('goal') || recentContent.includes('progress')) return 'goal_tracking';
    if (recentContent.includes('save') || recentContent.includes('emergency')) return 'savings';
    
    return 'general_management';
  }

  private buildContextSummary(
    profile: UserMemoryProfile | null, 
    history: any[], 
    insights: any[]
  ): string {
    if (!profile) return 'New user with limited context available.';

    const parts: string[] = [];

    // User preferences summary
    parts.push(`User prefers ${profile.preferences.communicationStyle} communication and ${profile.preferences.budgetingStyle} budgeting approach.`);

    // Recent focus
    if (profile.context.currentFocus) {
      parts.push(`Currently focused on ${profile.context.currentFocus.replace('_', ' ')}.`);
    }

    // Goals summary
    if (profile.context.majorGoals.length > 0) {
      parts.push(`Main goals include: ${profile.context.majorGoals.join(', ')}.`);
    }

    // Recent insights
    if (insights.length > 0) {
      parts.push(`Recent insights available from ${insights.map(i => i.agentName).join(', ')}.`);
    }

    return parts.join(' ');
  }

  private buildPersonalizations(
    profile: UserMemoryProfile | null, 
    agentName: string
  ): Record<string, any> {
    if (!profile) return {};

    const personalizations: Record<string, any> = {
      communicationStyle: profile.preferences.communicationStyle,
      riskTolerance: profile.preferences.riskTolerance,
      preferredApproach: profile.preferences.budgetingStyle,
    };

    // Agent-specific personalizations
    switch (agentName) {
      case 'budget_coach':
        personalizations.budgetingStyle = profile.preferences.budgetingStyle;
        personalizations.reminderFrequency = profile.preferences.reminderFrequency;
        break;
      case 'transaction_analyst':
        personalizations.focusAreas = profile.learnings.challenges;
        break;
      case 'insight_generator':
        personalizations.goalPriorities = profile.preferences.goalPriorities;
        personalizations.successfulStrategies = profile.learnings.successfulStrategies;
        break;
    }

    return personalizations;
  }

  // Cache management methods

  private updateMemoryCache(userId: string, entry: MemoryEntry): void {
    try {
      if (!this.memoryCache.has(userId)) {
        this.memoryCache.set(userId, []);
      }

      const userMemories = this.memoryCache.get(userId)!;
      userMemories.unshift(entry); // Add to beginning

      // Limit cache size
      if (userMemories.length > 50) {
        userMemories.splice(50);
      }

      // Clean old cache if total size exceeds limit
      if (this.memoryCache.size > this.MAX_CACHE_SIZE) {
        const oldestKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(oldestKey);
      }

    } catch (error) {
      logger.error({ error, userId }, 'Failed to update memory cache');
    }
  }

  private categorizePreference(key: string): string {
    if (key.includes('budget') || key.includes('envelope')) return 'budgeting';
    if (key.includes('communication') || key.includes('style')) return 'communication';
    if (key.includes('goal') || key.includes('priority')) return 'goals';
    if (key.includes('risk') || key.includes('tolerance')) return 'risk_management';
    return 'general';
  }

  /**
   * Clear memory cache for a user (useful for testing or user data deletion)
   */
  clearUserCache(userId: string): void {
    this.memoryCache.delete(userId);
    this.profileCache.delete(userId);
    logger.info({ userId }, 'Cleared user memory cache');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { memoryCacheSize: number; profileCacheSize: number } {
    return {
      memoryCacheSize: this.memoryCache.size,
      profileCacheSize: this.profileCache.size,
    };
  }
}

// Export singleton instance
export const memoryManager = new MemoryManager();
