
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { db } from '../../lib/db.js';
import { Agent } from '@openai/agents';
import { globalAIBrain, getUserContext, storeUserContext } from '../../lib/vectorstore.js';
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
    // Implementation for transaction pattern analysis
    return {};
  }

  private async analyzeUserBillPatterns(userId: string) {
    // Implementation for bill pattern analysis
    return {};
  }

  private inferSpendingPersonality(analysis: any): 'analytical' | 'emotional' | 'impulsive' | 'conservative' {
    // Logic to infer personality from transaction patterns
    return 'conservative';
  }

  private async getUserName(userId: string): Promise<string> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, firstName: true }
    });
    return user?.firstName || user?.name || 'User';
  }

  // Additional helper methods...
  private async analyzeSpendingPatterns(transactions: any[]) {
    // Implementation
    return { averageMonthly: 0, trends: [] };
  }

  private async analyzeCategorySpending(transactions: any[]) {
    // Implementation
    return [];
  }

  private async extractBehavioralInsights(transactions: any[]) {
    // Implementation
    return { riskFactors: [] };
  }

  private async processWithPersonalizedContext(session: PersonalAISession, input: string, agent: Agent) {
    // Implementation for processing with personalized context
    return "Personalized response";
  }

  private async generateFinalBudgetRecommendations(session: PersonalAISession) {
    // Implementation for generating final budget
    return {};
  }

  // Storage methods
  private async getUserAIDNA(userId: string): Promise<UserAIDNA | null> {
    // Implementation for retrieving encrypted DNA
    return null;
  }

  private async storeUserAIDNA(dna: UserAIDNA): Promise<void> {
    // Implementation for storing encrypted DNA
  }
}

export const personalAI = new PersonalAI();
