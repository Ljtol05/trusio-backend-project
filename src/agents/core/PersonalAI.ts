import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { db } from '../../lib/db.js';
import { Agent } from '@openai/agents';
import { globalAIBrain } from '../../lib/ai/globalAIBrain.js';
import { onboardingAgent } from './OnboardingAgent.js';
import { financialCoachAgent } from './FinancialCoachAgent.js';
import crypto from 'crypto';

export interface UserAIDNA {
  userId: string;
  spendingPersonality: 'analytical' | 'emotional' | 'impulsive' | 'conservative';
  communicationStyle: 'encouraging' | 'direct' | 'analytical' | 'casual';
  preferredInteractionMode: 'voice' | 'text' | 'mixed';
  learningPreferences: string[];
  financialGoals: string[];
  riskTolerance: 'low' | 'medium' | 'high';
  motivationTriggers: string[];
  stressIndicators: string[];
  successPatterns: string[];
  encryptedData: string;
  lastUpdated: Date;
}

export interface PersonalAISession {
  sessionId: string;
  userId: string;
  isVoiceActive: boolean;
  onboardingComplete: boolean;
  currentContext: any;
  conversationHistory: any[];
  transactionInsights: any;
  budgetRecommendations: any;
  encryptedSessionData: string;
}

class PersonalAI {
  private readonly encryptionKey: Buffer;
  private userAgents: Map<string, Agent> = new Map();
  private activeSessions: Map<string, PersonalAISession> = new Map();

  constructor() {
    // Initialize encryption key from environment or generate
    this.encryptionKey = Buffer.from(process.env.PERSONAL_AI_ENCRYPTION_KEY || crypto.randomBytes(32));
  }

  private encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipherGCM('aes-256-gcm', this.encryptionKey);
    cipher.setAAD(Buffer.from('personal-ai-data'));

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipherGCM('aes-256-gcm', this.encryptionKey);
    decipher.setAAD(Buffer.from('personal-ai-data'));
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async initializePersonalAI(userId: string): Promise<UserAIDNA> {
    try {
      logger.info({ userId }, 'Initializing personal AI for user');

      // Check if user already has AI DNA
      const existingDNA = await this.getUserAIDNA(userId);
      if (existingDNA) {
        return existingDNA;
      }

      // Analyze user's transaction data for initial DNA
      const transactionAnalysis = await this.analyzeUserTransactionPatterns(userId);
      const billAnalysis = await this.analyzeUserBillPatterns(userId);

      // Create initial AI DNA profile
      const initialDNA: UserAIDNA = {
        userId,
        spendingPersonality: this.inferSpendingPersonality(transactionAnalysis),
        communicationStyle: 'encouraging', // Default, will be learned
        preferredInteractionMode: 'voice', // Start with voice for onboarding
        learningPreferences: [],
        financialGoals: [],
        riskTolerance: 'medium',
        motivationTriggers: [],
        stressIndicators: [],
        successPatterns: [],
        encryptedData: this.encrypt(JSON.stringify({
          transactionAnalysis,
          billAnalysis,
          createdAt: new Date(),
          version: '1.0'
        })),
        lastUpdated: new Date(),
      };

      // Store encrypted DNA
      await this.storeUserAIDNA(initialDNA);

      // Create personalized agent for this user
      await this.createPersonalizedAgent(userId, initialDNA);

      logger.info({ userId, personality: initialDNA.spendingPersonality }, 'Personal AI initialized');
      return initialDNA;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to initialize personal AI');
      throw error;
    }
  }

  async startVoiceOnboarding(userId: string): Promise<PersonalAISession> {
    try {
      const userDNA = await this.initializePersonalAI(userId);
      const sessionId = `voice_onboard_${userId}_${Date.now()}`;

      // Pre-analyze user's financial data
      const comprehensiveAnalysis = await this.performComprehensivePreAnalysis(userId);

      const session: PersonalAISession = {
        sessionId,
        userId,
        isVoiceActive: true,
        onboardingComplete: false,
        currentContext: {
          stage: 'greeting',
          comprehensiveAnalysis,
          questionsAnswered: 0,
          totalQuestions: 12,
        },
        conversationHistory: [],
        transactionInsights: comprehensiveAnalysis.transactionInsights,
        budgetRecommendations: null,
        encryptedSessionData: this.encrypt(JSON.stringify({
          startedAt: new Date(),
          userDNA,
          comprehensiveAnalysis
        }))
      };

      this.activeSessions.set(sessionId, session);

      // Generate personalized greeting based on analysis
      const greeting = await this.generatePersonalizedGreeting(userId, comprehensiveAnalysis);

      session.conversationHistory.push({
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
        type: 'voice',
        context: 'onboarding_start'
      });

      logger.info({ userId, sessionId }, 'Voice onboarding session started');
      return session;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to start voice onboarding');
      throw error;
    }
  }

  async processVoiceInput(
    sessionId: string,
    voiceInput: string,
    audioMetadata?: any
  ): Promise<{
    response: string;
    shouldContinueVoice: boolean;
    onboardingComplete: boolean;
    nextAction: string;
  }> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Add user input to conversation history
      session.conversationHistory.push({
        role: 'user',
        content: voiceInput,
        timestamp: new Date(),
        type: 'voice',
        audioMetadata
      });

      // Get user's personal agent
      const personalAgent = this.userAgents.get(session.userId);
      if (!personalAgent) {
        throw new Error('Personal agent not found');
      }

      // Process with personalized context
      const response = await this.processWithPersonalizedContext(
        session,
        voiceInput,
        personalAgent
      );

      // Update session state
      session.currentContext.questionsAnswered++;

      // Check if onboarding is complete
      const onboardingComplete = session.currentContext.questionsAnswered >= session.currentContext.totalQuestions;

      if (onboardingComplete && !session.onboardingComplete) {
        // Generate final budget recommendations
        session.budgetRecommendations = await this.generateFinalBudgetRecommendations(session);
        session.onboardingComplete = true;
        session.isVoiceActive = false; // Switch to text mode for budget review
      }

      // Add AI response to history
      session.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        type: 'voice',
        context: `onboarding_q${session.currentContext.questionsAnswered}`
      });

      // Update encrypted session data
      session.encryptedSessionData = this.encrypt(JSON.stringify({
        conversationHistory: session.conversationHistory,
        currentContext: session.currentContext,
        updatedAt: new Date()
      }));

      return {
        response,
        shouldContinueVoice: !onboardingComplete,
        onboardingComplete,
        nextAction: onboardingComplete ? 'budget_review' : 'continue_onboarding'
      };

    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to process voice input');
      throw error;
    }
  }

  private async performComprehensivePreAnalysis(userId: string) {
    try {
      // Get user's transaction data
      const transactions = await db.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1000 // Last 1000 transactions or 120 days worth
      });

      // Comprehensive analysis
      const { billAnalyzer } = await import('../../lib/billAnalyzer.js');
      const { transactionIntelligence } = await import('../../lib/transactionIntelligence.js');

      const billAnalysis = await billAnalyzer.analyzeBillsFromTransactions(userId, 120);
      const spendingPatterns = await this.analyzeSpendingPatterns(transactions);
      const categoryBreakdown = await this.analyzeCategorySpending(transactions);
      const behavioralInsights = await this.extractBehavioralInsights(transactions);

      return {
        transactionCount: transactions.length,
        dateRange: {
          start: transactions[transactions.length - 1]?.createdAt,
          end: transactions[0]?.createdAt
        },
        billAnalysis,
        spendingPatterns,
        categoryBreakdown,
        behavioralInsights,
        transactionInsights: {
          averageMonthlySpending: spendingPatterns.averageMonthly,
          topCategories: categoryBreakdown.slice(0, 5),
          spendingTrends: spendingPatterns.trends,
          riskFactors: behavioralInsights.riskFactors
        }
      };

    } catch (error) {
      logger.error({ error, userId }, 'Failed to perform comprehensive pre-analysis');
      return null;
    }
  }

  private async generatePersonalizedGreeting(userId: string, analysis: any): Promise<string> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, firstName: true }
    });

    const userName = user?.firstName || user?.name || 'there';

    if (!analysis) {
      return `Hi ${userName}! I'm your personal AI financial coach. I'm excited to help you create a budget that works perfectly for your lifestyle. Let's start by getting to know each other better. What would you like me to call you?`;
    }

    const insights = analysis.transactionInsights;
    const billCount = analysis.billAnalysis?.detectedBills?.length || 0;
    const monthlySpending = insights?.averageMonthlySpending || 0;

    return `Hi ${userName}! I'm your personal AI financial coach, and I've already been getting to know your financial habits. I can see you have ${billCount} recurring bills and spend about $${monthlySpending.toFixed(0)} monthly on average. I'm excited to help you create a personalized budget that works with your specific spending patterns. Shall we start building your perfect financial plan together?`;
  }

  private async createPersonalizedAgent(userId: string, dna: UserAIDNA): Promise<void> {
    const personalizedPrompt = `
    You are ${await this.getUserName(userId)}'s personal AI financial coach and companion.

    User's Financial DNA:
    - Spending Personality: ${dna.spendingPersonality}
    - Communication Style: ${dna.communicationStyle}
    - Risk Tolerance: ${dna.riskTolerance}

    Your personality and approach:
    - Warm, encouraging, and deeply personal
    - Remember every conversation and build on previous insights
    - Adapt your communication style to match their preferences
    - Be proactive in identifying opportunities and risks
    - Celebrate their wins and support them through challenges

    You have access to their complete financial history and can reference specific transactions,
    patterns, and behaviors. Always speak as their dedicated personal coach who knows them well.
    `;

    const personalAgent = new Agent({
      name: `Personal AI for ${userId}`,
      instructions: personalizedPrompt,
      model: 'gpt-4o',
      temperature: 0.7,
      tools: [
        // Add relevant tools for this user's agent
      ]
    });

    this.userAgents.set(userId, personalAgent);
  }

  // Helper methods for analysis
  private async analyzeUserTransactionPatterns(userId: string) {
    const transactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    if (transactions.length === 0) return {};

    const totalSpending = transactions
      .filter(t => t.amountCents > 0)
      .reduce((sum, t) => sum + t.amountCents, 0) / 100;

    const categories = transactions.reduce((acc, t) => {
      const category = t.mcc || 'unknown';
      acc[category] = (acc[category] || 0) + Math.abs(t.amountCents) / 100;
      return acc;
    }, {} as Record<string, number>);

    const frequentMerchants = transactions.reduce((acc, t) => {
      acc[t.merchant] = (acc[t.merchant] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTransactions: transactions.length,
      totalSpending,
      averageTransaction: totalSpending / transactions.length,
      topCategories: Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      frequentMerchants: Object.entries(frequentMerchants)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      dateRange: {
        start: transactions[transactions.length - 1]?.createdAt,
        end: transactions[0]?.createdAt
      }
    };
  }

  private async analyzeUserBillPatterns(userId: string) {
    try {
      const { billAnalyzer } = await import('../../lib/billAnalyzer.js');
      return await billAnalyzer.analyzeBillsFromTransactions(userId, 90);
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to analyze bill patterns');
      return {};
    }
  }

  private inferSpendingPersonality(analysis: any): 'analytical' | 'emotional' | 'impulsive' | 'conservative' {
    if (!analysis.totalTransactions) return 'conservative';

    const avgTransaction = analysis.averageTransaction || 0;
    const transactionCount = analysis.totalTransactions || 0;

    // High frequency, low amounts = impulsive
    if (transactionCount > 100 && avgTransaction < 50) return 'impulsive';

    // High amounts, low frequency = analytical
    if (transactionCount < 50 && avgTransaction > 100) return 'analytical';

    // Medium patterns with emotional spending indicators
    const hasEmotionalMerchants = analysis.frequentMerchants?.some(([merchant]: [string, number]) =>
      merchant.toLowerCase().includes('amazon') ||
      merchant.toLowerCase().includes('starbucks') ||
      merchant.toLowerCase().includes('target')
    );

    if (hasEmotionalMerchants) return 'emotional';

    return 'conservative';
  }

  private async getUserName(userId: string): Promise<string> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, firstName: true }
    });
    return user?.firstName || user?.name || 'User';
  }

  private async analyzeSpendingPatterns(transactions: any[]) {
    if (transactions.length === 0) return { averageMonthly: 0, trends: [] };

    const monthlySpending = transactions.reduce((acc, t) => {
      const month = new Date(t.createdAt).toISOString().slice(0, 7);
      acc[month] = (acc[month] || 0) + Math.abs(t.amountCents) / 100;
      return acc;
    }, {} as Record<string, number>);

    const months = Object.keys(monthlySpending);
    const averageMonthly = months.length > 0
      ? Object.values(monthlySpending).reduce((a, b) => a + b, 0) / months.length
      : 0;

    const trends = months.sort().map(month => ({
      month,
      amount: monthlySpending[month]
    }));

    return { averageMonthly, trends };
  }

  private async analyzeCategorySpending(transactions: any[]) {
    const categories = transactions.reduce((acc, t) => {
      const category = this.getCategoryFromMCC(t.mcc) || 'Other';
      const existing = acc.find(c => c.category === category);
      if (existing) {
        existing.amount += Math.abs(t.amountCents) / 100;
        existing.count += 1;
      } else {
        acc.push({
          category,
          amount: Math.abs(t.amountCents) / 100,
          count: 1
        });
      }
      return acc;
    }, [] as Array<{ category: string; amount: number; count: number }>);

    return categories.sort((a, b) => b.amount - a.amount);
  }

  private getCategoryFromMCC(mcc: string): string {
    const mccMap: Record<string, string> = {
      '5411': 'Groceries',
      '5814': 'Fast Food',
      '5812': 'Dining',
      '5541': 'Gas',
      '4900': 'Utilities',
      '4814': 'Telecom',
      '5999': 'Retail'
    };
    return mccMap[mcc] || 'Other';
  }

  private async extractBehavioralInsights(transactions: any[]) {
    const riskFactors = [];

    // High frequency spending
    if (transactions.length > 200) {
      riskFactors.push('High transaction frequency may indicate impulsive spending');
    }

    // Late night purchases
    const lateNightPurchases = transactions.filter(t => {
      const hour = new Date(t.createdAt).getHours();
      return hour >= 22 || hour <= 6;
    });

    if (lateNightPurchases.length > transactions.length * 0.1) {
      riskFactors.push('Frequent late-night purchases detected');
    }

    // Large purchases
    const largePurchases = transactions.filter(t =>
      Math.abs(t.amountCents) > 50000 // > $500
    );

    if (largePurchases.length > 10) {
      riskFactors.push('Multiple large purchases detected');
    }

    return { riskFactors };
  }

  private async processWithPersonalizedContext(session: PersonalAISession, input: string, agent: Agent) {
    const context = session.currentContext;
    const questionNumber = context.questionsAnswered + 1;

    // Predefined onboarding questions with personalized context
    const questions = [
      "What would you like me to call you?",
      "What are your main financial goals right now?",
      "How do you typically handle unexpected expenses?",
      "What's your biggest financial challenge?",
      "How do you prefer to save money?",
      "What motivates you to stick to a budget?",
      "How do you feel about your current spending habits?",
      "What's your approach to financial planning?",
      "How important is it for you to track every expense?",
      "What would financial success look like to you?",
      "How do you handle financial stress?",
      "What's your experience with budgeting apps or tools?"
    ];

    if (questionNumber <= questions.length) {
      const insights = session.transactionInsights;
      let personalizedQuestion = questions[questionNumber - 1];

      // Add context based on their transaction data
      if (questionNumber === 4 && insights?.topCategories?.length > 0) {
        const topCategory = insights.topCategories[0].category;
        personalizedQuestion += ` I notice you spend quite a bit on ${topCategory} - is managing that spending part of what you'd like help with?`;
      }

      return personalizedQuestion;
    }

    return "Thank you for sharing that with me. Let me prepare your personalized budget recommendations based on everything you've told me and your spending patterns.";
  }

  private async generateFinalBudgetRecommendations(session: PersonalAISession) {
    const analysis = session.currentContext.comprehensiveAnalysis;
    const conversationInsights = this.extractInsightsFromConversation(session.conversationHistory);

    return {
      personalizedMessage: "Based on our conversation and your spending patterns, here are my recommendations for your envelope budget.",
      recommendedEnvelopes: await this.generatePersonalizedEnvelopes(session),
      budgetingTips: this.generatePersonalizedTips(analysis, conversationInsights),
      nextSteps: [
        "Review and adjust the recommended envelope allocations",
        "Set up automatic routing rules for your most frequent spending categories",
        "Schedule weekly check-ins to track your progress",
        "Consider linking a savings goal to your emergency fund envelope"
      ]
    };
  }

  private extractInsightsFromConversation(history: any[]) {
    const userResponses = history.filter(msg => msg.role === 'user');
    return {
      mentionedGoals: userResponses.some(msg =>
        msg.content.toLowerCase().includes('save') ||
        msg.content.toLowerCase().includes('goal')
      ),
      expressedStress: userResponses.some(msg =>
        msg.content.toLowerCase().includes('stress') ||
        msg.content.toLowerCase().includes('worry')
      ),
      prefersSimplicity: userResponses.some(msg =>
        msg.content.toLowerCase().includes('simple') ||
        msg.content.toLowerCase().includes('easy')
      )
    };
  }

  private async generatePersonalizedEnvelopes(session: PersonalAISession) {
    // This would integrate with the onboarding agent's envelope recommendations
    const { onboardingAgent } = await import('./OnboardingAgent.js');

    // Mock profile based on session data
    const mockProfile = {
      userId: session.userId,
      userType: 'consumer' as const,
      spendingPersonality: 'conservative' as const,
      needsTitheEnvelope: false,
      monthlyIncome: session.transactionInsights?.averageMonthlySpending * 1.2
    };

    return onboardingAgent.generateEnvelopeRecommendations(mockProfile, [], session.currentContext.comprehensiveAnalysis?.billAnalysis);
  }

  private generatePersonalizedTips(analysis: any, insights: any) {
    const tips = [];

    if (insights.expressedStress) {
      tips.push("Start with just 3-4 envelopes to keep things simple and reduce financial stress");
    }

    if (analysis?.transactionInsights?.topCategories?.length > 0) {
      const topCategory = analysis.transactionInsights.topCategories[0];
      tips.push(`Your highest spending category is ${topCategory.category} - consider setting a specific envelope for this`);
    }

    tips.push("Review your envelopes weekly rather than daily to avoid overthinking");
    tips.push("Celebrate small wins - every dollar saved is progress toward your goals");

    return tips;
  }

  // Storage methods
  private async getUserAIDNA(userId: string): Promise<UserAIDNA | null> {
    try {
      // In a real implementation, this would query a secure database
      // For now, return null to always create fresh DNA
      return null;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to retrieve user AI DNA');
      return null;
    }
  }

  private async storeUserAIDNA(dna: UserAIDNA): Promise<void> {
    try {
      // In a real implementation, this would store encrypted DNA in database
      // For now, we'll store in memory
      logger.info({ userId: dna.userId, personality: dna.spendingPersonality }, 'AI DNA stored (memory only)');
    } catch (error) {
      logger.error({ error, userId: dna.userId }, 'Failed to store user AI DNA');
    }
  }

  async getSessionStatus(sessionId: string, userId: string): Promise<PersonalAISession | null> {
    try {
      const session = this.activeSessions.get(sessionId);

      if (!session || session.userId !== userId) {
        return null;
      }

      return {
        ...session,
        isActive: true, // Session exists so it's active
      };
    } catch (error) {
      logger.error({ error, sessionId, userId }, 'Failed to get session status');
      return null;
    }
  }

  async endSession(sessionId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        // Store final session data if needed
        logger.info({ sessionId, userId: session.userId }, 'Voice onboarding session ended');
        this.activeSessions.delete(sessionId);
      }
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to end session');
    }
  }
}

export const personalAI = new PersonalAI();
