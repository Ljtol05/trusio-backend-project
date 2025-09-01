
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { db } from '../../lib/db.js';
import { onboardingAgent } from './OnboardingAgent.js';
import { billAnalyzer } from '../../lib/billAnalyzer.js';
import { globalAIBrain } from '../../lib/ai/globalAIBrain.js';
import { personalAIAgent } from './PersonalAIAgent.js';
import type { Agent } from '@openai/agents';
import { agentManager } from '../core/AgentManager.js';
import { handoffManager } from '../core/HandoffManager.js';
import { memoryManager } from '../core/MemoryManager.js';

export interface VoiceSession {
  sessionId: string;
  userId: string;
  stage: 'greeting' | 'financial_analysis' | 'questioning' | 'budget_creation' | 'review' | 'completed';
  isVoiceActive: boolean;
  currentQuestionIndex: number;
  responses: Record<string, any>;
  transactionAnalysis?: any;
  billAnalysis?: any;
  financialProfile?: any;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    audioData?: string;
  }>;
  createdAt: Date;
  lastActivity: Date;
  personalAIInsights?: any[];
  globalKnowledgeUsed?: any[];
}

export interface TransactionInsights {
  totalTransactions: number;
  averageMonthlySpending: number;
  averageMonthlyIncome: number;
  savingsRate: number;
  topSpendingCategories: Array<{
    category: string;
    amount: number;
    percentage: number;
    frequency: string;
  }>;
}

class VoiceKYCAgent {
  private sessions = new Map<string, VoiceSession>();
  private responseCache = new Map<string, { response: string; timestamp: number; ttl: number }>();
  private knowledgeCache = new Map<string, { knowledge: any[]; timestamp: number; ttl: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;
  private readonly systemPrompt = `
You are an expert financial voice coach specializing in personalized budgeting and envelope system design.

Your role is to:
1. Analyze the user's 120-day transaction history and financial patterns
2. Conduct a natural, conversational voice interview about their financial goals
3. Determine if they're a consumer, content creator, or hybrid user type
4. Create a personalized 10-envelope budget based on their actual spending patterns
5. Provide warm, encouraging guidance throughout the process
6. Integrate relevant financial knowledge and personalized insights

Voice Conversation Guidelines:
- Speak naturally and conversationally
- Keep responses concise but informative (2-3 sentences max)
- Ask one question at a time
- Reference their actual spending data when relevant
- Be encouraging and supportive
- Use their name when appropriate
- Transition smoothly between topics
- Incorporate relevant financial knowledge naturally

Financial Analysis Integration:
- Reference their actual monthly spending patterns
- Mention specific bills you've detected
- Comment on their spending personality based on transaction patterns
- Suggest envelope amounts based on their real expenses
- Use personalized insights from their learning profile
- Integrate relevant budgeting playbooks and IRS guidance

Remember: This is a VOICE conversation, so keep responses natural and spoken-friendly while being informative.
  `;

  // Cache management methods
  private getCachedResponse(cacheKey: string): string | null {
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.response;
    }
    return null;
  }

  private setCachedResponse(cacheKey: string, response: string, ttl: number = this.CACHE_TTL): void {
    // Implement LRU cache eviction
    if (this.responseCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.responseCache.keys().next().value;
      this.responseCache.delete(oldestKey);
    }

    this.responseCache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      ttl
    });
  }

  private getCachedKnowledge(cacheKey: string): any[] | null {
    const cached = this.knowledgeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.knowledge;
    }
    return null;
  }

  private setCachedKnowledge(cacheKey: string, knowledge: any[], ttl: number = this.CACHE_TTL): void {
    if (this.knowledgeCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.knowledgeCache.keys().next().value;
      this.knowledgeCache.delete(oldestKey);
    }

    this.knowledgeCache.set(cacheKey, {
      knowledge,
      timestamp: Date.now(),
      ttl
    });
  }

  async startVoiceKYCSession(userId: string): Promise<VoiceSession> {
    try {
      // Verify user has completed prerequisites
      const user = await db.user.findUnique({
        where: { id: parseInt(userId) },
        select: {
          emailVerified: true,
          phoneVerified: true,
          kycApproved: true,
          plaidConnected: true,
          transactionDataReady: true
        }
      });

      if (!user?.emailVerified || !user?.phoneVerified || !user?.kycApproved || !user?.plaidConnected || !user?.transactionDataReady) {
        throw new Error('User must complete email verification, phone verification, KYC, and bank connection before starting voice KYC');
      }

      // Initialize user's personal AI profile (with timeout)
      const profilePromise = personalAIAgent.initializeUserProfile(parseInt(userId));
      const profileTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile initialization timeout')), 10000)
      );

      await Promise.race([profilePromise, profileTimeout]);

      // Get transaction insights for analysis (with timeout)
      const insightsPromise = this.getTransactionInsights(userId);
      const insightsTimeout = new Promise<TransactionInsights | null>((resolve) =>
        setTimeout(() => resolve(null), 15000)
      );

      const transactionInsights = await Promise.race([insightsPromise, insightsTimeout]);

      // Get bill analysis and financial profile in parallel
      const [billAnalysis, financialProfile] = await Promise.all([
        this.analyzeUserBills(userId as string),
        this.buildFinancialProfile(userId as string)
      ]);

      // Create voice session
      const session: VoiceSession = {
        sessionId: this.generateSessionId(),
        userId,
        stage: 'greeting',
        isVoiceActive: true,
        currentQuestionIndex: 0,
        responses: {},
        transactionAnalysis: transactionInsights,
        billAnalysis,
        financialProfile,
        conversationHistory: [],
        createdAt: new Date(),
        lastActivity: new Date()
      };

      // Generate personalized greeting using Global AI Brain and Personal AI
      const greeting = await this.generatePersonalizedGreeting(userId, session);
      session.conversationHistory.push({
        role: 'assistant',
        content: greeting,
        timestamp: new Date()
      });

      this.sessions.set(session.sessionId, session);

      logger.info({ userId, sessionId: session.sessionId }, 'Voice KYC session started with AI integration');
      return session;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to start voice KYC session');

      // Provide user-friendly error message
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error('System is taking longer than expected to prepare your session. Please try again in a moment.');
      }

      throw error;
    }
  }

  // Generate personalized greeting using Global AI Brain and Personal AI
  private async generatePersonalizedGreeting(userId: string, session: VoiceSession): Promise<string> {
    try {
      // Check cache first
      const cacheKey = `greeting_${userId}`;
      const cachedGreeting = this.getCachedResponse(cacheKey);
      if (cachedGreeting) {
        return cachedGreeting;
      }

      // Get user's personal AI profile
      const userProfile = await personalAIAgent.getUserProfile(parseInt(userId));

      // Get relevant knowledge from Global AI Brain (with timeout)
      const knowledgePromise = globalAIBrain.getRelevantKnowledge(
        'voice onboarding greeting financial coaching',
        userProfile?.spendingPersonality === 'conservative' ? 'consumer' : 'creator',
        'budgeting',
        2
      );

      const knowledgeTimeout = new Promise<any[]>((resolve) =>
        setTimeout(() => resolve([]), 5000)
      );

      const relevantKnowledge = await Promise.race([knowledgePromise, knowledgeTimeout]);

      // Store knowledge used for tracking
      session.globalKnowledgeUsed = relevantKnowledge.map(k => ({ id: k.id, title: k.title }));

      // Build personalized greeting
      let greeting = '';

      if (userProfile) {
        const personality = userProfile.spendingPersonality;
        const priorities = userProfile.financialPriorities.slice(0, 2).join(' and ');

        greeting = `Hi there! I'm excited to help you create a personalized budget that fits your ${personality} spending style. I can see you're focused on ${priorities}, and I have some great strategies to share. Let's start with a few questions to tailor this perfectly for you. `;
      } else {
        greeting = `Hi there! I'm here to help you create a personalized budget that works for your unique financial situation. I have access to proven strategies and can analyze your spending patterns to make recommendations that fit your lifestyle. Let's start with a few questions to get to know your financial goals better. `;
      }

      // Add relevant knowledge snippet
      if (relevantKnowledge.length > 0) {
        const knowledge = relevantKnowledge[0];
        if (knowledge.title.includes('Envelope Budgeting')) {
          greeting += `I'll be using proven envelope budgeting methods to help you allocate your money effectively. `;
        }
      }

      greeting += `Ready to get started?`;

      // Cache the greeting
      this.setCachedResponse(cacheKey, greeting, 10 * 60 * 1000); // 10 minutes for greetings

      return greeting;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate personalized greeting');
      return "Hi there! I'm here to help you create a personalized budget. Let's start with a few questions to understand your financial goals.";
    }
  }

  async processVoiceInput(
    sessionId: string,
    transcription: string,
    audioMetadata?: any
  ): Promise<{
    response: string;
    shouldContinueVoice: boolean;
    onboardingComplete: boolean;
    nextAction: string;
    stage: string;
    progress: any;
    personalInsights?: any[];
    knowledgeUsed?: any[];
  }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Add user input to conversation history
      session.conversationHistory.push({
        role: 'user',
        content: transcription,
        timestamp: new Date(),
        audioData: audioMetadata ? JSON.stringify(audioMetadata) : undefined
      });

      // Check cache for similar responses
      const cacheKey = `response_${sessionId}_${transcription.substring(0, 50)}`;
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        // Use cached response but still update session
        session.currentQuestionIndex++;
        session.lastActivity = new Date();

        return {
          response: cachedResponse,
          shouldContinueVoice: session.currentQuestionIndex < 12,
          onboardingComplete: session.currentQuestionIndex >= 12,
          nextAction: session.currentQuestionIndex >= 12 ? 'budget_review' : 'continue_questions',
          stage: session.stage,
          progress: {
            questionsAnswered: session.currentQuestionIndex,
            totalQuestions: 12,
            stage: session.stage
          },
          personalInsights: [],
          knowledgeUsed: []
        };
      }

      // Get user's personal AI profile for enhanced context
      const userProfile = await personalAIAgent.getUserProfile(parseInt(session.userId));

      // Get relevant knowledge from Global AI Brain based on user input (with timeout)
      const knowledgePromise = globalAIBrain.getRelevantKnowledge(
        transcription,
        userProfile?.spendingPersonality === 'conservative' ? 'consumer' : 'creator',
        undefined,
        3
      );

      const knowledgeTimeout = new Promise<any[]>((resolve) =>
        setTimeout(() => resolve([]), 8000)
      );

      const relevantKnowledge = await Promise.race([knowledgePromise, knowledgeTimeout]);

      // Update session with knowledge used
      session.globalKnowledgeUsed = [
        ...(session.globalKnowledgeUsed || []),
        ...relevantKnowledge.map(k => ({ id: k.id, title: k.title }))
      ];

      // Generate enhanced response using Global AI Brain knowledge and Personal AI insights
      const response = await this.generateEnhancedResponse(
        transcription,
        session,
        relevantKnowledge,
        userProfile
      );

      // Add AI response to conversation history
      session.conversationHistory.push({
        role: 'assistant',
        content: response.response,
        timestamp: new Date()
      });

      // Update session state
      session.currentQuestionIndex++;
      session.lastActivity = new Date();

      // Check if onboarding is complete
      const onboardingComplete = session.currentQuestionIndex >= 12;
      if (onboardingComplete) {
        session.stage = 'completed';
        session.isVoiceActive = false;

        // Generate final budget recommendations using enhanced knowledge
        const budgetRecommendations = await this.generateFinalBudgetRecommendations(session, relevantKnowledge);
        session.responses.budgetRecommendations = budgetRecommendations;
      }

      // Generate personal insights for learning (non-blocking)
      const personalInsightsPromise = this.generatePersonalInsights(session, transcription, response.response);
      personalInsightsPromise.then(insights => {
        session.personalAIInsights = [
          ...(session.personalAIInsights || []),
          ...insights
        ];
      }).catch(error => {
        logger.error({ error }, 'Failed to generate personal insights (non-blocking)');
      });

      // Cache the response
      this.setCachedResponse(cacheKey, response.response);

      logger.info({
        sessionId,
        userId: session.userId,
        questionIndex: session.currentQuestionIndex,
        knowledgeUsed: relevantKnowledge.length
      }, 'Processed voice input with AI integration');

      return {
        response: response.response,
        shouldContinueVoice: !onboardingComplete,
        onboardingComplete,
        nextAction: onboardingComplete ? 'budget_review' : 'continue_questions',
        stage: session.stage,
        progress: {
          questionsAnswered: session.currentQuestionIndex,
          totalQuestions: 12,
          stage: session.stage
        },
        personalInsights: [],
        knowledgeUsed: relevantKnowledge.map(k => ({ id: k.id, title: k.title }))
      };

    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to process voice input');

      // Provide user-friendly error message
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          response: "I'm taking a bit longer than usual to process your request. Let me try a different approach.",
          shouldContinueVoice: true,
          onboardingComplete: false,
          nextAction: 'retry',
          stage: 'error_recovery',
          progress: { questionsAnswered: 0, totalQuestions: 12, stage: 'error_recovery' },
          personalInsights: [],
          knowledgeUsed: []
        };
      }

      throw error;
    }
  }

  // Generate enhanced response using Global AI Brain knowledge and Personal AI insights
  private async generateEnhancedResponse(
    userInput: string,
    session: VoiceSession,
    relevantKnowledge: any[],
    userProfile: any
  ): Promise<{
    response: string;
    suggestedActions: string[];
  }> {
    try {
      // Check cache for similar responses
      const cacheKey = `enhanced_response_${session.userId}_${userInput.substring(0, 50)}`;
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        return {
          response: cachedResponse,
          suggestedActions: []
        };
      }

      // Build enhanced context using Global AI Brain (with timeout)
      const contextPromise = globalAIBrain.buildEnhancedAgentContext(
        parseInt(session.userId),
        'voice_kyc' as any,
        userInput,
        {
          userId: session.userId,
          totalIncome: session.transactionAnalysis?.averageMonthlyIncome || 0,
          totalExpenses: session.transactionAnalysis?.averageMonthlySpending || 0,
          userType: userProfile?.spendingPersonality === 'conservative' ? 'consumer' : 'business',
          envelopes: [],
          transactions: [],
          goals: userProfile?.financialPriorities || []
        }
      );

      const contextTimeout = new Promise<any>((resolve) =>
        setTimeout(() => resolve({
          totalIncome: session.transactionAnalysis?.averageMonthlyIncome || 0,
          totalExpenses: session.transactionAnalysis?.averageMonthlySpending || 0,
          userType: 'consumer',
          enhancedKnowledge: []
        }), 10000)
      );

      const enhancedContext = await Promise.race([contextPromise, contextTimeout]);

      // Create enhanced prompt with knowledge integration
      const prompt = `
${this.systemPrompt}

User Profile Context:
- Spending Personality: ${userProfile?.spendingPersonality || 'unknown'}
- Financial Priorities: ${userProfile?.financialPriorities?.join(', ') || 'not specified'}
- Current Stage: ${session.stage}
- Questions Answered: ${session.currentQuestionIndex}/12

Transaction Analysis:
- Monthly Spending: $${session.transactionAnalysis?.averageMonthlySpending || 0}
- Monthly Income: $${session.transactionAnalysis?.averageMonthlyIncome || 0}
- Savings Rate: ${session.transactionAnalysis?.savingsRate || 0}%
- Top Categories: ${session.transactionAnalysis?.topSpendingCategories?.slice(0, 3).map((c: any) => c.category).join(', ') || 'none'}

Relevant Financial Knowledge:
${relevantKnowledge.map(k => `- ${k.title}: ${k.content.substring(0, 150)}...`).join('\n')}

Enhanced Context:
- Total Income: $${enhancedContext.totalIncome}
- Total Expenses: $${enhancedContext.totalExpenses}
- User Type: ${enhancedContext.userType}
- Enhanced Knowledge: ${enhancedContext.enhancedKnowledge?.length || 0} relevant items

User Input: "${userInput}"

Generate a voice-friendly response that:
1. Answers their question naturally and conversationally
2. References their specific financial data when relevant
3. Integrates relevant financial knowledge naturally
4. Provides encouraging, actionable guidance
5. Adapts to their spending personality and priorities
6. Moves the onboarding process forward appropriately

Response:`;

      // Use OpenAI to generate response (with timeout)
      const responsePromise = createAgentResponse(
        this.systemPrompt,
        prompt,
        [],
        { temperature: 0.7, maxTokens: 300 }
      );

      const responseTimeout = new Promise<string>((resolve) =>
        setTimeout(() => resolve('I understand your question. Let me help you with that.'), 15000)
      );

      const response = await Promise.race([responsePromise, responseTimeout]);

      // Extract suggested actions
      const suggestedActions = this.extractSuggestedActions(response);

      // Cache the response
      this.setCachedResponse(cacheKey, response);

      return {
        response,
        suggestedActions
      };

    } catch (error) {
      logger.error({ error }, 'Failed to generate enhanced response');
      return {
        response: "I'm having trouble processing your request right now. Let me try a different approach.",
        suggestedActions: []
      };
    }
  }

  // Generate final budget recommendations using enhanced knowledge
  private async generateFinalBudgetRecommendations(session: VoiceSession, relevantKnowledge: any[]): Promise<any> {
    try {
      const userProfile = await personalAIAgent.getUserProfile(parseInt(session.userId));

      // Get additional relevant knowledge for budget creation
      const budgetKnowledge = await globalAIBrain.getRelevantKnowledge(
        'envelope budget creation allocation strategy',
        userProfile?.spendingPersonality === 'conservative' ? 'consumer' : 'creator',
        'budgeting',
        5
      );

      // Combine all knowledge used
      const allKnowledge = [...relevantKnowledge, ...budgetKnowledge];
      session.globalKnowledgeUsed = [
        ...(session.globalKnowledgeUsed || []),
        ...budgetKnowledge.map(k => ({ id: k.id, title: k.title }))
      ];

      // Build comprehensive budget recommendations
      const recommendations = {
        userType: userProfile?.spendingPersonality === 'conservative' ? 'consumer' : 'creator',
        envelopeStructure: this.generateEnvelopeStructure(session, userProfile, allKnowledge),
        allocationStrategy: this.generateAllocationStrategy(session, userProfile, allKnowledge),
        knowledgeSources: allKnowledge.map(k => ({ id: k.id, title: k.title, category: k.category })),
        personalInsights: session.personalAIInsights || [],
        nextSteps: this.generateNextSteps(session, userProfile)
      };

      return recommendations;
    } catch (error) {
      logger.error({ error, sessionId: session.sessionId }, 'Failed to generate final budget recommendations');
      return { error: 'Failed to generate recommendations' };
    }
  }

  // Generate personalized envelope structure
  private generateEnvelopeStructure(session: VoiceSession, userProfile: any, knowledge: any[]): any[] {
    const baseEnvelopes = [
      { name: 'Housing', percentage: 25, priority: 'high' },
      { name: 'Transportation', percentage: 15, priority: 'high' },
      { name: 'Food & Groceries', percentage: 15, priority: 'high' },
      { name: 'Utilities', percentage: 10, priority: 'high' },
      { name: 'Emergency Fund', percentage: 20, priority: 'high' },
      { name: 'Debt Payment', percentage: 10, priority: 'medium' },
      { name: 'Entertainment', percentage: 5, priority: 'low' }
    ];

    // Adjust based on user profile and knowledge
    if (userProfile?.spendingPersonality === 'conservative') {
      baseEnvelopes.find(e => e.name === 'Emergency Fund')!.percentage = 25;
      baseEnvelopes.find(e => e.name === 'Entertainment')!.percentage = 3;
    }

    // Add creator-specific envelopes if applicable
    if (userProfile?.spendingPersonality !== 'conservative') {
      baseEnvelopes.push(
        { name: 'Equipment & Software', percentage: 8, priority: 'medium' },
        { name: 'Tax Savings', percentage: 12, priority: 'high' }
      );
    }

    return baseEnvelopes;
  }

  // Generate allocation strategy
  private generateAllocationStrategy(session: VoiceSession, userProfile: any, knowledge: any[]): any {
    const strategy = {
      approach: userProfile?.spendingPersonality === 'conservative' ? 'conservative' : 'balanced',
      automation: 'high',
      reviewFrequency: 'monthly',
      adjustmentStrategy: 'gradual',
      knowledgeBased: knowledge.filter(k => k.category === 'strategy').map(k => k.title)
    };

    return strategy;
  }

  // Generate next steps
  private generateNextSteps(session: VoiceSession, userProfile: any): string[] {
    const steps = [
      'Review your personalized envelope structure',
      'Set up automatic transfers for each envelope',
      'Track your spending for the first month',
      'Schedule a monthly budget review'
    ];

    if (userProfile?.spendingPersonality !== 'conservative') {
      steps.push('Set up quarterly tax savings plan');
      steps.push('Create business expense tracking system');
    }

    return steps;
  }

  // Generate personal insights for learning
  private async generatePersonalInsights(session: VoiceSession, userInput: string, aiResponse: string): Promise<any[]> {
    try {
      // Use Personal AI Agent to generate insights
      const insights = await personalAIAgent.processUserInput(
        session.sessionId,
        userInput,
        { sessionType: 'voice_kyc', stage: session.stage }
      );

      return insights.insights || [];
    } catch (error) {
      logger.error({ error }, 'Failed to generate personal insights');
      return [];
    }
  }

  // Extract suggested actions from response
  private extractSuggestedActions(response: string): string[] {
    const actions: string[] = [];

    const actionPatterns = [
      /consider\s+(.+?)(?:\.|$)/gi,
      /try\s+(.+?)(?:\.|$)/gi,
      /focus\s+on\s+(.+?)(?:\.|$)/gi,
      /review\s+(.+?)(?:\.|$)/gi
    ];

    actionPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const action = match.replace(/^(consider|try|focus on|review)\s+/i, '').replace(/\.$/, '');
          if (action && action.length > 10) {
            actions.push(action);
          }
        });
      }
    });

    return actions.slice(0, 3);
  }

  // Generate session ID
  private generateSessionId(): string {
    return `voice_kyc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Analyze user bills
  private async analyzeUserBills(userId: string): Promise<any> {
    try {
      return await billAnalyzer.analyzeBillsFromTransactions(userId, 120);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to analyze user bills');
      return { detectedBills: [], totalMonthlyBills: 0 };
    }
  }

  // Build financial profile
  private async buildFinancialProfile(userId: string): Promise<any> {
    try {
      const user = await db.user.findUnique({
        where: { id: parseInt(userId) },
        select: { id: true, name: true, email: true }
      });

      return {
        userId: user?.id,
        name: user?.name,
        email: user?.email,
        userType: 'consumer', // Default, will be refined during onboarding
        spendingPersonality: 'conservative', // Default, will be learned
        riskProfile: 'medium'
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to build financial profile');
      return {
        userType: 'consumer',
        spendingPersonality: 'conservative',
        riskProfile: 'medium'
      };
    }
  }

  // Get transaction insights
  async getTransactionInsights(userId: string): Promise<TransactionInsights | null> {
    try {
      const session = Array.from(this.sessions.values()).find(s => s.userId === userId);
      if (!session?.transactionAnalysis) {
        return null;
      }

      return {
        totalTransactions: session.transactionAnalysis.totalTransactions,
        averageMonthlySpending: session.transactionAnalysis.averageMonthlySpending,
        averageMonthlyIncome: session.transactionAnalysis.averageMonthlyIncome,
        savingsRate: session.transactionAnalysis.savingsRate,
        topSpendingCategories: session.transactionAnalysis.topSpendingCategories.slice(0, 5)
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get transaction insights');
      return null;
    }
  }

  /**
   * Orchestrate multi-agent analysis for comprehensive financial insights
   */
  async orchestrateMultiAgentAnalysis(userId: string, sessionId: string): Promise<{
    budgetCoach: any;
    transactionAnalyst: any;
    insightGenerator: any;
    financialAdvisor: any;
  }> {
    try {
      logger.info({ userId, sessionId }, 'Starting multi-agent orchestration for voice KYC');

      const context = {
        userId: userId,
        sessionId,
        timestamp: new Date(),
        previousInteractions: [],
        routingMetadata: {
          reason: 'voice_kyc_analysis',
          confidence: 0.95,
          originalAgent: 'voice_kyc',
        }
      };

      // Run all agents in parallel for comprehensive analysis
      const [budgetCoach, transactionAnalyst, insightGenerator, financialAdvisor] = await Promise.all([
        agentManager.runAgent('budget_coach', 'Analyze spending patterns and suggest envelope structure', context),
        agentManager.runAgent('transaction_analyst', 'Analyze transaction history and categorize spending', context),
        agentManager.runAgent('insight_generator', 'Generate personalized financial insights and recommendations', context),
        agentManager.runAgent('financial_advisor', 'Provide high-level financial guidance and goal setting', context)
      ]);

      // Store multi-agent results in memory for context preservation
      await memoryManager.storeInteraction(
        userId,
        'voice_kyc_orchestrator',
        sessionId,
        'Multi-agent analysis request',
        'Multi-agent analysis completed',
        {
          userId: userId,
          userType: 'consumer'
        },
        {
          agents: ['budget_coach', 'transaction_analyst', 'insight_generator', 'financial_advisor'],
          confidence: 0.95,
          orchestrationType: 'parallel',
          analysisResults: {
            budgetCoach,
            transactionAnalyst,
            insightGenerator,
            financialAdvisor,
            timestamp: new Date(),
            analysisId: `analysis_${Date.now()}`
          }
        }
      );

      logger.info({ userId, sessionId }, 'Multi-agent orchestration completed successfully');

      return {
        budgetCoach,
        transactionAnalyst,
        insightGenerator,
        financialAdvisor
      };

    } catch (error) {
      logger.error({ error, userId, sessionId }, 'Failed to orchestrate multi-agent analysis');
      throw error;
    }
  }

  // Get session status
  async getSessionStatus(sessionId: string, userId: string): Promise<VoiceSession | null> {
    const session = this.sessions.get(sessionId);
    if (session && session.userId === userId) {
      return session;
    }
    return null;
  }

  // Get all sessions for a user
  async getUserSessions(userId: string): Promise<VoiceSession[]> {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId);
  }

  // End session
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isVoiceActive = false;
      session.lastActivity = new Date();

      // End personal AI session
      await personalAIAgent.endSession(sessionId);

      logger.info({ sessionId, userId: session.userId }, 'Voice KYC session ended');
    }
  }

  // Get session statistics
  getSessionStats(): {
    activeSessions: number;
    totalSessions: number;
    totalUsers: number;
  } {
    const activeSessions = Array.from(this.sessions.values()).filter(s => s.isVoiceActive).length;
    const totalSessions = this.sessions.size;
    const uniqueUsers = new Set(Array.from(this.sessions.values()).map(s => s.userId)).size;

    return {
      activeSessions,
      totalSessions,
      totalUsers: uniqueUsers
    };
  }

  /**
   * Handoff to specialized agent for specific financial tasks
   */
  async handoffToSpecialist(
    fromStage: string,
    toAgent: string,
    userId: string,
    sessionId: string,
    reason: string,
    context: Record<string, any>
  ): Promise<{
    handoffId: string;
    targetAgent: string;
    response: string;
    contextPreserved: boolean;
  }> {
    try {
      logger.info({ fromStage, toAgent, userId, sessionId, reason }, 'Initiating specialist handoff');

      const handoffRequest = {
        fromAgent: 'voice_kyc',
        toAgent,
        userId: userId.toString(),
        sessionId,
        reason,
        priority: 'high' as const,
        context: {
          ...context,
          voiceStage: fromStage,
          originalSession: sessionId,
          userPreferences: await this.getUserPreferences(userId)
        },
        userMessage: `Handoff from voice KYC stage: ${fromStage}`,
        preserveHistory: true,
        escalationLevel: 0
      };

      const handoffResult = await handoffManager.executeHandoff(handoffRequest);

      logger.info({ handoffId: handoffResult.handoffId, toAgent }, 'Specialist handoff completed');

      return {
        handoffId: handoffResult.handoffId,
        targetAgent: handoffResult.toAgent,
        response: handoffResult.response,
        contextPreserved: handoffResult.contextPreserved
      };
    } catch (error) {
      logger.error({ error, userId, sessionId }, 'Specialist handoff failed');
      throw error;
    }
  }

  /**
   * Get user preferences for context preservation during handoffs
   */
  private async getUserPreferences(userId: string): Promise<Record<string, any>> {
    try {
      const user = await db.user.findUnique({
        where: { id: parseInt(userId) },
        select: {
          name: true,
          userType: true,
          transactionDataReady: true,
          plaidConnected: true
        }
      });

      return {
        name: user?.name,
        userType: user?.userType,
        transactionDataReady: user?.userType,
        plaidConnected: user?.plaidConnected
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user preferences');
      return {};
    }
  }
}

export const voiceKYCAgent = new VoiceKYCAgent();
