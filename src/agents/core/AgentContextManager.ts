
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { db } from '../../lib/db.js';
import type { FinancialContext, AgentInteraction } from '../types.js';

// Context schema for validation
export const AgentContextSchema = z.object({
  userId: z.number(),
  sessionId: z.string(),
  agentName: z.string(),
  timestamp: z.date(),
  financialContext: z.object({
    totalIncome: z.number().optional(),
    totalExpenses: z.number().optional(),
    envelopes: z.array(z.object({
      id: z.string(),
      name: z.string(),
      balance: z.number(),
      target: z.number(),
      category: z.string(),
    })).optional(),
    transactions: z.array(z.object({
      id: z.string(),
      amount: z.number(),
      description: z.string(),
      category: z.string(),
      date: z.string(),
    })).optional(),
    goals: z.array(z.object({
      id: z.string(),
      description: z.string(),
      targetAmount: z.number(),
      currentAmount: z.number(),
      deadline: z.string().optional(),
    })).optional(),
  }).optional(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.string(),
    agentName: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
  userProfile: z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().optional(),
    isNewUser: z.boolean().optional(),
    preferences: z.record(z.unknown()).optional(),
    financialGoals: z.array(z.string()).optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AgentContext = z.infer<typeof AgentContextSchema>;

export class AgentContextManager {
  private contextCache: Map<string, AgentContext> = new Map();
  private readonly maxCacheSize = 1000;
  private readonly cacheTtlMs = 3600000; // 1 hour

  /**
   * Build comprehensive financial context for an agent
   */
  async buildFinancialContext(userId: string): Promise<FinancialContext> {
    try {
      logger.debug({ userId }, 'Building financial context for agent');

      // Get user's envelopes
      const envelopes = await db.envelope.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          balance: true,
          targetAmount: true,
          category: true,
        }
      });

      // Get recent transactions (last 100)
      const transactions = await db.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          amount: true,
          description: true,
          category: true,
          createdAt: true,
        }
      });

      // Get user's financial goals
      const goals = await db.goal.findMany({
        where: { userId },
        select: {
          id: true,
          description: true,
          targetAmount: true,
          currentAmount: true,
          targetDate: true,
        }
      });

      // Calculate financial summary
      const totalIncome = transactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);

      const totalExpenses = transactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const financialContext: FinancialContext = {
        userId,
        totalIncome,
        totalExpenses,
        envelopes: envelopes.map(e => ({
          id: e.id,
          name: e.name,
          balance: e.balance,
          target: e.targetAmount || 0,
          category: e.category || 'general',
        })),
        transactions: transactions.map(t => ({
          id: t.id,
          amount: t.amount,
          description: t.description,
          category: t.category || 'uncategorized',
          date: t.createdAt.toISOString(),
        })),
        goals: goals.map(g => ({
          id: g.id,
          description: g.description,
          targetAmount: g.targetAmount,
          currentAmount: g.currentAmount || 0,
          deadline: g.targetDate?.toISOString(),
        })),
      };

      logger.debug({
        userId,
        envelopeCount: envelopes.length,
        transactionCount: transactions.length,
        goalCount: goals.length
      }, 'Financial context built successfully');

      return financialContext;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to build financial context');
      return { userId }; // Return minimal context on error
    }
  }

  /**
   * Get conversation history for a session
   */
  async getConversationHistory(
    userId: string,
    sessionId: string,
    limit: number = 20
  ): Promise<AgentInteraction[]> {
    try {
      const conversations = await db.conversation.findMany({
        where: { userId, sessionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          role: true,
          content: true,
          agentName: true,
          createdAt: true,
        }
      });

      return conversations.reverse().map(conv => ({
        role: conv.role as 'user' | 'assistant' | 'system',
        content: conv.content,
        timestamp: conv.createdAt.toISOString(),
        agentName: conv.agentName || undefined,
      }));

    } catch (error) {
      logger.error({ error, userId, sessionId }, 'Failed to get conversation history');
      return [];
    }
  }

  /**
   * Create full agent context
   */
  async createAgentContext(
    userId: string,
    sessionId: string,
    agentName: string,
    includeHistory: boolean = true,
    maxHistory: number = 20
  ): Promise<AgentContext> {
    try {
      const cacheKey = `${userId}:${sessionId}:${agentName}`;

      // Check cache first
      const cached = this.contextCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTtlMs) {
        logger.debug({ userId, sessionId, agentName }, 'Using cached agent context');
        return cached;
      }

      // Build financial context
      const financialContext = await this.buildFinancialContext(userId);

      // Get conversation history if requested
      let conversationHistory: AgentInteraction[] = [];
      if (includeHistory) {
        conversationHistory = await this.getConversationHistory(userId, sessionId, maxHistory);
      }

      // Get user profile
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        }
      });

      const context: AgentContext = {
        userId,
        sessionId,
        agentName,
        timestamp: new Date(),
        financialContext,
        conversationHistory,
        userProfile: user ? {
          id: user.id,
          name: user.name || undefined,
          email: user.email || undefined,
          isNewUser: Date.now() - user.createdAt.getTime() < 86400000, // 24 hours
        } : undefined,
        metadata: {
          contextBuiltAt: new Date().toISOString(),
          version: '1.0',
        }
      };

      // Cache the context
      this.cacheContext(cacheKey, context);

      logger.debug({
        userId,
        sessionId,
        agentName,
        historyCount: conversationHistory.length
      }, 'Agent context created successfully');

      return context;

    } catch (error) {
      logger.error({ error, userId, sessionId, agentName }, 'Failed to create agent context');
      throw new Error('Failed to create agent context');
    }
  }

  /**
   * Save interaction to conversation history
   */
  async saveInteraction(
    userId: string,
    sessionId: string,
    agentName: string,
    userMessage: string,
    agentResponse: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await db.conversation.createMany({
        data: [
          {
            userId,
            sessionId,
            role: 'user',
            content: userMessage,
            agentName,
            metadata: metadata?.userMetadata,
          },
          {
            userId,
            sessionId,
            role: 'assistant',
            content: agentResponse,
            agentName,
            metadata: metadata?.agentMetadata,
          }
        ]
      });

      // Invalidate cache for this session
      this.invalidateSessionCache(userId, sessionId);

      logger.debug({ userId, sessionId, agentName }, 'Interaction saved to conversation history');

    } catch (error) {
      logger.error({ error, userId, sessionId, agentName }, 'Failed to save interaction');
    }
  }

  /**
   * Cache management
   */
  private cacheContext(key: string, context: AgentContext): void {
    // Implement LRU cache behavior
    if (this.contextCache.size >= this.maxCacheSize) {
      const firstKey = this.contextCache.keys().next().value;
      this.contextCache.delete(firstKey);
    }

    this.contextCache.set(key, context);
  }

  private invalidateSessionCache(userId: string, sessionId: string): void {
    const keysToDelete = Array.from(this.contextCache.keys())
      .filter(key => key.startsWith(`${userId}:${sessionId}:`));

    keysToDelete.forEach(key => this.contextCache.delete(key));
  }

  /**
   * Cleanup expired cache entries
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, context] of this.contextCache.entries()) {
      if (now - context.timestamp.getTime() > this.cacheTtlMs) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.contextCache.delete(key));

    if (expiredKeys.length > 0) {
      logger.debug({ expiredCount: expiredKeys.length }, 'Cleaned up expired context cache entries');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.contextCache.size,
      maxSize: this.maxCacheSize,
      ttlMs: this.cacheTtlMs,
    };
  }
}

// Export singleton instance
export const agentContextManager = new AgentContextManager();

// Setup cleanup interval
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    agentContextManager.cleanup();
  }, 300000); // Cleanup every 5 minutes
}
