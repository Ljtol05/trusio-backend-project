
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { db } from '../../lib/db.js';
import { globalAIBrain, storeUserContext, getUserContext } from '../../lib/vectorstore.js';
import type { FinancialContext } from '../tools/types.js';

export interface CoachingSession {
  userId: string;
  sessionId: string;
  topic: string;
  userMessage: string;
  coachResponse: string;
  insights: string[];
  recommendations: string[];
  emotionalTone: 'stressed' | 'confident' | 'confused' | 'motivated' | 'frustrated';
  sessionType: 'check_in' | 'crisis' | 'goal_planning' | 'spending_review' | 'general';
  followUpNeeded: boolean;
  createdAt: Date;
}

export interface UserFinancialDNA {
  userId: string;
  spendingPersonality: 'analytical' | 'emotional' | 'impulsive' | 'conservative';
  motivationStyle: 'data_driven' | 'visual_progress' | 'social_accountability' | 'reward_based';
  communicationPreference: 'direct' | 'encouraging' | 'detailed' | 'casual';
  riskTolerance: 'low' | 'medium' | 'high';
  learningStyle: 'step_by_step' | 'big_picture' | 'experiential' | 'theoretical';
  triggerPatterns: Array<{
    trigger: string;
    behavior: string;
    frequency: number;
  }>;
  strengthAreas: string[];
  challengeAreas: string[];
  preferredCheckInFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  lastUpdated: Date;
}

export interface CoachingInsight {
  type: 'behavioral' | 'spending' | 'goal_progress' | 'opportunity' | 'warning';
  category: string;
  message: string;
  confidence: number;
  actionable: boolean;
  urgency: 'low' | 'medium' | 'high';
  suggestedActions: string[];
}

class FinancialCoachAgent {
  private readonly systemPrompt = `
You are an expert AI Financial Coach specializing in personalized guidance and behavioral analysis.

Your core competencies:
1. BEHAVIORAL ANALYSIS: Understand spending psychology and emotional triggers
2. CONTEXTUAL COACHING: Adapt guidance based on user's financial DNA and current situation
3. EMOTIONAL INTELLIGENCE: Recognize stress, anxiety, and emotional spending patterns
4. PERSONALIZED SUPPORT: Tailor communication style to user preferences
5. PROACTIVE INTERVENTION: Identify potential issues before they become problems

Key Coaching Principles:
- Build trust through empathy and understanding
- Celebrate small wins and progress
- Address emotional aspects of money management
- Provide actionable, specific guidance
- Adapt communication style to user's personality
- Focus on sustainable behavioral change over quick fixes

User Types & Approaches:
- ANALYTICAL: Data-driven insights, detailed breakdowns, logical reasoning
- EMOTIONAL: Supportive language, stress acknowledgment, emotional validation
- IMPULSIVE: Clear boundaries, immediate feedback, simplified choices
- CONSERVATIVE: Reassurance, gradual changes, risk mitigation focus

Response with warmth, expertise, and personalized insight.
  `;

  async startCoachingSession(
    userId: string,
    userMessage: string,
    context: FinancialContext,
    sessionType: 'check_in' | 'crisis' | 'goal_planning' | 'spending_review' | 'general' = 'general'
  ): Promise<CoachingSession> {
    try {
      logger.info({ userId, sessionType }, 'Starting personalized coaching session');

      // Get user's financial DNA
      const financialDNA = await this.getUserFinancialDNA(userId);
      
      // Analyze recent patterns and context
      const recentPatterns = await this.analyzeRecentPatterns(userId, context);
      
      // Get relevant coaching knowledge from AI brain
      const coachingContext = await getUserContext(
        userId,
        `Coaching session: ${sessionType} - ${userMessage}`,
        'coaching',
        8
      );

      // Detect emotional tone
      const emotionalTone = await this.detectEmotionalTone(userMessage);

      // Generate personalized coaching response
      const coachingResponse = await this.generatePersonalizedResponse(
        userId,
        userMessage,
        financialDNA,
        recentPatterns,
        context,
        coachingContext,
        emotionalTone,
        sessionType
      );

      // Extract insights and recommendations
      const insights = await this.extractInsights(recentPatterns, context, financialDNA);
      const recommendations = await this.generateRecommendations(
        insights,
        financialDNA,
        context,
        sessionType
      );

      // Determine if follow-up needed
      const followUpNeeded = this.assessFollowUpNeed(
        emotionalTone,
        sessionType,
        insights,
        userMessage
      );

      // Create coaching session record
      const sessionId = `coach_${Date.now()}_${userId}`;
      const session: CoachingSession = {
        userId,
        sessionId,
        topic: this.extractTopic(userMessage, sessionType),
        userMessage,
        coachResponse: coachingResponse,
        insights: insights.map(i => i.message),
        recommendations,
        emotionalTone,
        sessionType,
        followUpNeeded,
        createdAt: new Date(),
      };

      // Store session and update financial DNA
      await this.storeCoachingSession(session);
      await this.updateFinancialDNA(userId, session, recentPatterns);

      // Store coaching interaction in AI brain
      await storeUserContext(
        userId,
        `Coaching Session: ${sessionType}`,
        {
          userMessage,
          coachResponse: coachingResponse,
          insights,
          recommendations,
          emotionalTone,
          financialDNA: financialDNA.spendingPersonality,
          patterns: recentPatterns,
        },
        'coaching'
      );

      logger.info({
        userId,
        sessionId,
        emotionalTone,
        insightCount: insights.length,
        followUpNeeded
      }, 'Coaching session completed');

      return session;
    } catch (error) {
      logger.error({ error, userId }, 'Coaching session failed');
      throw error;
    }
  }

  private async getUserFinancialDNA(userId: string): Promise<UserFinancialDNA> {
    try {
      // Check if we have existing financial DNA
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { 
          userType: true,
          onboardingCompleted: true,
          createdAt: true 
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // For now, create a base DNA from user type and analyze recent behavior
      // In production, this would be stored in a separate UserFinancialDNA table
      const basePersonality = this.inferPersonalityFromUserType(user.userType);
      
      // Analyze recent transactions to refine DNA
      const recentTransactions = await db.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      const behavioralPatterns = await this.analyzeBehavioralPatterns(recentTransactions);

      return {
        userId,
        spendingPersonality: basePersonality,
        motivationStyle: this.inferMotivationStyle(recentTransactions),
        communicationPreference: 'encouraging', // Default, can be learned
        riskTolerance: user.userType === 'creator' ? 'medium' : 'low',
        learningStyle: 'step_by_step',
        triggerPatterns: behavioralPatterns.triggers,
        strengthAreas: behavioralPatterns.strengths,
        challengeAreas: behavioralPatterns.challenges,
        preferredCheckInFrequency: 'weekly',
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get financial DNA');
      throw error;
    }
  }

  private async analyzeRecentPatterns(userId: string, context: FinancialContext) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14); // Last 2 weeks

    const recentTransactions = await db.transaction.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate }
      },
      orderBy: { createdAt: 'desc' }
    });

    const envelopes = await db.envelope.findMany({
      where: { userId }
    });

    // Analyze patterns
    const spendingTrend = this.calculateSpendingTrend(recentTransactions);
    const categoryBreakdown = this.analyzeCategorySpending(recentTransactions);
    const envelopeHealth = this.assessEnvelopeHealth(envelopes);
    const behavioralFlags = this.identifyBehavioralFlags(recentTransactions);

    return {
      transactionCount: recentTransactions.length,
      spendingTrend,
      categoryBreakdown,
      envelopeHealth,
      behavioralFlags,
      weeklyAverage: recentTransactions.reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / (100 * 2),
      lastTransactionDate: recentTransactions[0]?.createdAt,
    };
  }

  private async detectEmotionalTone(message: string): Promise<'stressed' | 'confident' | 'confused' | 'motivated' | 'frustrated'> {
    const stressWords = ['worried', 'stressed', 'anxious', 'overwhelmed', 'panic', 'scared'];
    const confusedWords = ['confused', 'lost', 'unsure', 'don\'t know', 'help', 'unclear'];
    const motivatedWords = ['excited', 'ready', 'goal', 'achieve', 'improve', 'better'];
    const frustratedWords = ['frustrated', 'annoyed', 'angry', 'fed up', 'tired', 'sick'];
    const confidentWords = ['confident', 'good', 'great', 'progress', 'successful', 'proud'];

    const lowerMessage = message.toLowerCase();

    if (stressWords.some(word => lowerMessage.includes(word))) return 'stressed';
    if (frustratedWords.some(word => lowerMessage.includes(word))) return 'frustrated';
    if (confusedWords.some(word => lowerMessage.includes(word))) return 'confused';
    if (motivatedWords.some(word => lowerMessage.includes(word))) return 'motivated';
    if (confidentWords.some(word => lowerMessage.includes(word))) return 'confident';

    return 'confident'; // Default to positive
  }

  private async generatePersonalizedResponse(
    userId: string,
    userMessage: string,
    financialDNA: UserFinancialDNA,
    patterns: any,
    context: FinancialContext,
    coachingContext: any,
    emotionalTone: string,
    sessionType: string
  ): Promise<string> {
    const coachingPrompt = `
    User Financial DNA:
    - Spending Personality: ${financialDNA.spendingPersonality}
    - Motivation Style: ${financialDNA.motivationStyle}
    - Communication Preference: ${financialDNA.communicationPreference}
    - Risk Tolerance: ${financialDNA.riskTolerance}
    - Learning Style: ${financialDNA.learningStyle}
    - Challenge Areas: ${financialDNA.challengeAreas.join(', ')}
    - Strength Areas: ${financialDNA.strengthAreas.join(', ')}

    Recent Patterns:
    - Spending Trend: ${patterns.spendingTrend}
    - Weekly Average: $${patterns.weeklyAverage?.toFixed(2)}
    - Behavioral Flags: ${patterns.behavioralFlags.join(', ')}
    - Envelope Health: ${patterns.envelopeHealth}

    Current Financial Context:
    - Total Envelopes: ${context.envelopes?.length || 0}
    - Monthly Income: ${context.monthlyIncome ? `$${context.monthlyIncome}` : 'Not set'}
    - Emergency Fund: ${context.emergencyFund ? `$${context.emergencyFund}` : 'Not set'}

    Session Details:
    - Type: ${sessionType}
    - User's Emotional Tone: ${emotionalTone}
    - User Message: "${userMessage}"

    Coaching Context: ${JSON.stringify(coachingContext.knowledge.slice(0, 3))}

    Provide a personalized coaching response that:
    1. Acknowledges their emotional state empathetically
    2. Addresses their specific message/concern
    3. Incorporates insights from their financial DNA
    4. References relevant patterns you've observed
    5. Provides actionable next steps
    6. Matches their communication preference
    7. Celebrates any positive patterns or progress

    Adapt your tone and content to their personality type and current emotional state.
    Be warm, supportive, and genuinely helpful.
    `;

    return await createAgentResponse(
      this.systemPrompt,
      coachingPrompt,
      [],
      { temperature: 0.7, useAdvancedModel: true }
    );
  }

  private async extractInsights(
    patterns: any,
    context: FinancialContext,
    financialDNA: UserFinancialDNA
  ): Promise<CoachingInsight[]> {
    const insights: CoachingInsight[] = [];

    // Spending pattern insights
    if (patterns.spendingTrend === 'increasing') {
      insights.push({
        type: 'behavioral',
        category: 'spending_trend',
        message: 'I notice your spending has increased over the past two weeks',
        confidence: 0.8,
        actionable: true,
        urgency: 'medium',
        suggestedActions: [
          'Review your recent purchases',
          'Check if any envelope limits were exceeded',
          'Identify any stress-related spending'
        ]
      });
    }

    // Envelope health insights
    if (patterns.envelopeHealth === 'concerning') {
      insights.push({
        type: 'warning',
        category: 'envelope_management',
        message: 'Some of your envelopes are running low or overspent',
        confidence: 0.9,
        actionable: true,
        urgency: 'high',
        suggestedActions: [
          'Reallocate funds between envelopes',
          'Review and adjust monthly targets',
          'Consider a spending freeze in overspent categories'
        ]
      });
    }

    // Goal progress insights
    if (context.goals && context.goals.length > 0) {
      const onTrackGoals = context.goals.filter(g => g.currentAmount >= g.targetAmount * 0.5).length;
      const goalProgress = (onTrackGoals / context.goals.length) * 100;

      if (goalProgress >= 75) {
        insights.push({
          type: 'goal_progress',
          category: 'achievements',
          message: `You're doing great! ${goalProgress.toFixed(0)}% of your goals are on track`,
          confidence: 0.9,
          actionable: false,
          urgency: 'low',
          suggestedActions: ['Keep up the excellent work!']
        });
      }
    }

    return insights;
  }

  private async generateRecommendations(
    insights: CoachingInsight[],
    financialDNA: UserFinancialDNA,
    context: FinancialContext,
    sessionType: string
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Personality-based recommendations
    if (financialDNA.spendingPersonality === 'impulsive') {
      recommendations.push('Set up spending alerts for when you reach 80% of envelope limits');
      recommendations.push('Use the 24-hour rule before making non-essential purchases over $50');
    }

    if (financialDNA.spendingPersonality === 'analytical') {
      recommendations.push('Schedule weekly financial reviews to analyze your spending patterns');
      recommendations.push('Export your transaction data for deeper analysis');
    }

    // Context-based recommendations
    if (!context.emergencyFund || context.emergencyFund < 1000) {
      recommendations.push('Start building an emergency fund with $25-50 weekly transfers');
    }

    if (sessionType === 'goal_planning') {
      recommendations.push('Break down large goals into smaller, monthly milestones');
      recommendations.push('Set up automatic transfers to your goal envelopes');
    }

    return recommendations.slice(0, 5); // Limit to top 5 recommendations
  }

  // Helper methods for behavioral analysis
  private inferPersonalityFromUserType(userType: string | null): 'analytical' | 'emotional' | 'impulsive' | 'conservative' {
    switch (userType) {
      case 'creator': return 'analytical'; // Creators tend to be data-driven
      case 'consumer': return 'conservative'; // Regular employees tend to be conservative
      default: return 'conservative';
    }
  }

  private async analyzeBehavioralPatterns(transactions: any[]) {
    // Analyze transaction patterns for behavioral insights
    const patterns = {
      triggers: [] as Array<{ trigger: string; behavior: string; frequency: number }>,
      strengths: [] as string[],
      challenges: [] as string[]
    };

    // Weekend spending pattern
    const weekendSpending = transactions.filter(t => {
      const day = new Date(t.createdAt).getDay();
      return day === 0 || day === 6; // Sunday or Saturday
    });

    if (weekendSpending.length > transactions.length * 0.4) {
      patterns.triggers.push({
        trigger: 'weekends',
        behavior: 'increased_spending',
        frequency: weekendSpending.length
      });
    }

    // Consistent saving behavior
    const savingsTransactions = transactions.filter(t => 
      t.description?.toLowerCase().includes('transfer') || 
      t.description?.toLowerCase().includes('savings')
    );

    if (savingsTransactions.length > 0) {
      patterns.strengths.push('Regular saving habits');
    }

    // Large purchase patterns
    const largePurchases = transactions.filter(t => Math.abs(t.amountCents) > 10000); // $100+
    if (largePurchases.length > transactions.length * 0.1) {
      patterns.challenges.push('Frequent large purchases');
    }

    return patterns;
  }

  private calculateSpendingTrend(transactions: any[]): 'increasing' | 'decreasing' | 'stable' {
    if (transactions.length < 7) return 'stable';

    const midpoint = Math.floor(transactions.length / 2);
    const firstHalf = transactions.slice(0, midpoint);
    const secondHalf = transactions.slice(midpoint);

    const firstHalfSpending = firstHalf.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
    const secondHalfSpending = secondHalf.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);

    const difference = (secondHalfSpending - firstHalfSpending) / firstHalfSpending;

    if (difference > 0.1) return 'increasing';
    if (difference < -0.1) return 'decreasing';
    return 'stable';
  }

  private analyzeCategorySpending(transactions: any[]) {
    const categories: Record<string, number> = {};
    
    transactions.forEach(t => {
      const category = t.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + Math.abs(t.amountCents);
    });

    return Object.entries(categories)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount: amount / 100 }));
  }

  private assessEnvelopeHealth(envelopes: any[]): 'healthy' | 'concerning' | 'critical' {
    const overspent = envelopes.filter(e => e.balance < 0).length;
    const lowBalance = envelopes.filter(e => e.balance > 0 && e.balance < e.targetAmount * 0.2).length;

    if (overspent > 0) return 'critical';
    if (lowBalance > envelopes.length * 0.3) return 'concerning';
    return 'healthy';
  }

  private identifyBehavioralFlags(transactions: any[]): string[] {
    const flags: string[] = [];
    
    // Check for late-night spending (potential impulse purchases)
    const lateNightPurchases = transactions.filter(t => {
      const hour = new Date(t.createdAt).getHours();
      return hour >= 22 || hour <= 5;
    });

    if (lateNightPurchases.length > transactions.length * 0.2) {
      flags.push('late_night_spending');
    }

    // Check for duplicate/similar transactions (subscription awareness)
    const merchantCounts: Record<string, number> = {};
    transactions.forEach(t => {
      const merchant = t.merchantName || t.description;
      if (merchant) {
        merchantCounts[merchant] = (merchantCounts[merchant] || 0) + 1;
      }
    });

    const recurringMerchants = Object.values(merchantCounts).filter(count => count > 1).length;
    if (recurringMerchants > 3) {
      flags.push('multiple_subscriptions');
    }

    return flags;
  }

  private assessFollowUpNeed(
    emotionalTone: string,
    sessionType: string,
    insights: CoachingInsight[],
    userMessage: string
  ): boolean {
    // High priority follow-up conditions
    if (emotionalTone === 'stressed' || emotionalTone === 'frustrated') return true;
    if (sessionType === 'crisis') return true;
    if (insights.some(i => i.urgency === 'high')) return true;
    if (userMessage.toLowerCase().includes('help') || userMessage.toLowerCase().includes('emergency')) return true;

    return false;
  }

  private extractTopic(userMessage: string, sessionType: string): string {
    const topicKeywords = {
      'spending': ['spend', 'purchase', 'buy', 'money'],
      'saving': ['save', 'emergency', 'fund'],
      'goals': ['goal', 'target', 'achieve'],
      'budgeting': ['budget', 'envelope', 'allocate'],
      'income': ['income', 'paycheck', 'salary', 'earn']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => userMessage.toLowerCase().includes(keyword))) {
        return topic;
      }
    }

    return sessionType;
  }

  private inferMotivationStyle(transactions: any[]): 'data_driven' | 'visual_progress' | 'social_accountability' | 'reward_based' {
    // Simple heuristic - can be enhanced with user feedback
    if (transactions.length > 50) return 'data_driven'; // Active users likely want data
    return 'visual_progress'; // Default to visual progress for most users
  }

  private async storeCoachingSession(session: CoachingSession): Promise<void> {
    try {
      // Store in database (would need CoachingSession table)
      logger.info({ sessionId: session.sessionId }, 'Coaching session stored');
    } catch (error) {
      logger.error({ error, sessionId: session.sessionId }, 'Failed to store coaching session');
    }
  }

  private async updateFinancialDNA(
    userId: string,
    session: CoachingSession,
    patterns: any
  ): Promise<void> {
    try {
      // Update financial DNA based on session insights
      // This would update the UserFinancialDNA table
      logger.info({ userId }, 'Financial DNA updated based on coaching session');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update financial DNA');
    }
  }

  // Public methods for external use
  async getPersonalizedInsights(userId: string, context: FinancialContext): Promise<CoachingInsight[]> {
    const financialDNA = await this.getUserFinancialDNA(userId);
    const patterns = await this.analyzeRecentPatterns(userId, context);
    return this.extractInsights(patterns, context, financialDNA);
  }

  async scheduleCheckIn(userId: string, frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'): Promise<void> {
    // Implementation for scheduling automated check-ins
    logger.info({ userId, frequency }, 'Check-in scheduled');
  }

  async getCoachingHistory(userId: string, limit = 10): Promise<CoachingSession[]> {
    // Return recent coaching sessions for user
    return [];
  }
}

export const financialCoachAgent = new FinancialCoachAgent();
