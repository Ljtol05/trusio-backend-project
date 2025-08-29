
import { logger } from '../../lib/logger.js';
import { createAgentResponse } from '../../lib/openai.js';
import { db } from '../../lib/db.js';
import { onboardingAgent } from './OnboardingAgent.js';
import { billAnalyzer } from '../../lib/billAnalyzer.js';
import type { Agent } from '@openai/agents';
import { createAgent } from '@openai/agents-openai';

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
}

export interface TransactionInsights {
  totalTransactions: number;
  billCount: number;
  averageMonthlySpending: number;
  averageMonthlyIncome: number;
  topSpendingCategories: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
  spendingPersonality: 'analytical' | 'emotional' | 'impulsive' | 'conservative';
  userType: 'consumer' | 'creator' | 'hybrid';
  riskProfile: 'low' | 'medium' | 'high';
  savingsRate: number;
  detectedBills: Array<{
    name: string;
    amount: number;
    frequency: string;
  }>;
}

class VoiceKYCAgent {
  private sessions = new Map<string, VoiceSession>();
  private readonly systemPrompt = `
You are an expert financial voice coach specializing in personalized budgeting and envelope system design.

Your role is to:
1. Analyze the user's 120-day transaction history and financial patterns
2. Conduct a natural, conversational voice interview about their financial goals
3. Determine if they're a consumer, content creator, or hybrid user type
4. Create a personalized 10-envelope budget based on their actual spending patterns
5. Provide warm, encouraging guidance throughout the process

Voice Conversation Guidelines:
- Speak naturally and conversationally 
- Keep responses concise but informative (2-3 sentences max)
- Ask one question at a time
- Reference their actual spending data when relevant
- Be encouraging and supportive
- Use their name when appropriate
- Transition smoothly between topics

Financial Analysis Integration:
- Reference their actual monthly spending patterns
- Mention specific bills you've detected
- Comment on their spending personality based on transaction patterns
- Suggest envelope amounts based on their real expenses

Remember: This is a VOICE conversation, so keep responses natural and spoken-friendly.
  `;

  async startVoiceKYCSession(userId: string): Promise<VoiceSession> {
    try {
      logger.info({ userId }, 'Starting voice KYC onboarding session');

      // Check if user has completed auth flow and Plaid connection
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { 
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          phoneVerified: true,
          kycApproved: true,
          plaidConnected: true,
          transactionDataReady: true
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.emailVerified || !user.phoneVerified || !user.kycApproved) {
        throw new Error('User must complete email, phone, and KYC verification before voice onboarding');
      }

      if (!user.plaidConnected || !user.transactionDataReady) {
        throw new Error('User must connect bank accounts and complete transaction sync before voice onboarding');
      }

      const sessionId = `voice_kyc_${userId}_${Date.now()}`;
      
      // Perform comprehensive financial analysis
      const transactionAnalysis = await this.performTransactionAnalysis(userId);
      const billAnalysis = await billAnalyzer.analyzeBillsFromTransactions(userId, 120);
      const financialProfile = await this.generateFinancialProfile(userId, transactionAnalysis, billAnalysis);

      // Generate personalized greeting
      const greetingPrompt = `
        Create a warm, personalized greeting for ${user.name} based on their financial analysis:

        Financial Profile:
        - Total transactions: ${transactionAnalysis.totalTransactions}
        - Monthly spending: $${transactionAnalysis.averageMonthlySpending.toFixed(2)}
        - Monthly income: $${transactionAnalysis.averageMonthlyIncome.toFixed(2)}
        - Detected bills: ${billAnalysis.detectedBills.length}
        - Savings rate: ${transactionAnalysis.savingsRate.toFixed(1)}%
        - User type: ${financialProfile.userType}

        Greet them by name, acknowledge their financial journey, and explain that you've analyzed their 120 days of transactions to create a personalized budget. Keep it under 3 sentences and voice-friendly.
      `;

      const greeting = await createAgentResponse(
        this.systemPrompt,
        greetingPrompt,
        [],
        { temperature: 0.7, maxTokens: 150 }
      );

      const session: VoiceSession = {
        sessionId,
        userId,
        stage: 'greeting',
        isVoiceActive: true,
        currentQuestionIndex: 0,
        responses: {},
        transactionAnalysis,
        billAnalysis,
        financialProfile,
        conversationHistory: [
          {
            role: 'assistant',
            content: greeting,
            timestamp: new Date()
          }
        ],
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.sessions.set(sessionId, session);

      logger.info({
        userId,
        sessionId,
        transactionCount: transactionAnalysis.totalTransactions,
        billCount: billAnalysis.detectedBills.length,
        userType: financialProfile.userType
      }, 'Voice KYC session initialized with financial analysis');

      return session;

    } catch (error) {
      logger.error({ error, userId }, 'Failed to start voice KYC session');
      throw error;
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
    nextAction?: string;
    stage: string;
    progress: {
      questionsAnswered: number;
      totalQuestions: number;
    };
  }> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Update conversation history
      session.conversationHistory.push({
        role: 'user',
        content: transcription,
        timestamp: new Date()
      });
      session.lastActivity = new Date();

      let response = '';
      let shouldContinueVoice = true;
      let onboardingComplete = false;
      let nextAction = '';

      switch (session.stage) {
        case 'greeting':
          response = await this.handleGreetingResponse(session, transcription);
          session.stage = 'financial_analysis';
          break;

        case 'financial_analysis':
          response = await this.handleFinancialAnalysisStage(session, transcription);
          session.stage = 'questioning';
          break;

        case 'questioning':
          const questionResult = await this.handleQuestioningStage(session, transcription);
          response = questionResult.response;
          if (questionResult.moveToNextStage) {
            session.stage = 'budget_creation';
          }
          break;

        case 'budget_creation':
          response = await this.handleBudgetCreation(session, transcription);
          session.stage = 'review';
          shouldContinueVoice = false; // Switch to text for budget review
          nextAction = 'switch_to_text_review';
          break;

        case 'review':
          // This shouldn't happen as we switch to text mode
          response = "Let's switch to text mode to review your personalized budget.";
          shouldContinueVoice = false;
          nextAction = 'switch_to_text_review';
          break;

        case 'completed':
          response = "Your personalized budget has been created! You can now start using your envelope system.";
          onboardingComplete = true;
          shouldContinueVoice = false;
          break;
      }

      // Add assistant response to history
      session.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });

      // Calculate progress
      const totalQuestions = 12;
      const questionsAnswered = Object.keys(session.responses).length;

      return {
        response,
        shouldContinueVoice,
        onboardingComplete,
        nextAction,
        stage: session.stage,
        progress: {
          questionsAnswered,
          totalQuestions
        }
      };

    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to process voice input');
      throw error;
    }
  }

  private async performTransactionAnalysis(userId: string): Promise<any> {
    try {
      // Analyze 120 days of transactions
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 120);
      
      const transactions = await db.transaction.findMany({
        where: {
          userId,
          createdAt: { 
            gte: startDate,
            lte: endDate 
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (transactions.length === 0) {
        // Return default analysis for users with no transactions yet
        return {
          totalTransactions: 0,
          totalSpending: 0,
          totalIncome: 0,
          averageMonthlySpending: 0,
          averageMonthlyIncome: 0,
          savingsRate: 0,
          topSpendingCategories: [],
          dateRange: { start: startDate, end: endDate }
        };
      }

      // Calculate comprehensive metrics
      const totalTransactions = transactions.length;
      
      // In Plaid, positive amounts are debits (money spent), negative amounts are credits (money received)
      const spendingTransactions = transactions.filter(t => t.amountCents > 0);
      const incomeTransactions = transactions.filter(t => t.amountCents < 0);
      
      const totalSpending = spendingTransactions.reduce((sum, t) => sum + t.amountCents, 0) / 100;
      const totalIncome = Math.abs(incomeTransactions.reduce((sum, t) => sum + t.amountCents, 0)) / 100;

      const averageMonthlySpending = totalSpending / 4; // 120 days = ~4 months
      const averageMonthlyIncome = totalIncome / 4;
      const savingsRate = totalIncome > 0 ? ((totalIncome - totalSpending) / totalIncome) * 100 : 0;

      // Categorize spending using MCC codes and merchant names
      const categorySpending: Record<string, number> = {};
      spendingTransactions.forEach(transaction => {
        let category = 'Other';
        
        // Categorize based on MCC code
        if (transaction.mcc) {
          if (transaction.mcc.startsWith('54')) category = 'Gas & Transportation';
          else if (transaction.mcc.startsWith('58') || transaction.mcc.startsWith('57')) category = 'Dining & Entertainment';
          else if (transaction.mcc.startsWith('53') || transaction.mcc.startsWith('52')) category = 'Retail & Shopping';
          else if (transaction.mcc.startsWith('49')) category = 'Bills & Utilities';
          else if (transaction.mcc === '5411' || transaction.mcc === '5499') category = 'Groceries';
        }
        
        // Override with merchant-based categorization if more specific
        const merchant = (transaction.merchant || '').toLowerCase();
        if (merchant.includes('grocery') || merchant.includes('market') || merchant.includes('safeway')) {
          category = 'Groceries';
        } else if (merchant.includes('gas') || merchant.includes('shell') || merchant.includes('chevron')) {
          category = 'Gas & Transportation';
        } else if (merchant.includes('restaurant') || merchant.includes('coffee') || merchant.includes('starbucks')) {
          category = 'Dining & Entertainment';
        }
        
        categorySpending[category] = (categorySpending[category] || 0) + (transaction.amountCents / 100);
      });

      const topSpendingCategories = Object.entries(categorySpending)
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: totalSpending > 0 ? (amount / totalSpending) * 100 : 0
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

      return {
        totalTransactions,
        totalSpending,
        totalIncome,
        averageMonthlySpending,
        averageMonthlyIncome,
        savingsRate,
        topSpendingCategories,
        dateRange: { start: startDate, end: endDate }
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to perform transaction analysis');
      // Return safe defaults if analysis fails
      return {
        totalTransactions: 0,
        totalSpending: 0,
        totalIncome: 0,
        averageMonthlySpending: 0,
        averageMonthlyIncome: 0,
        savingsRate: 0,
        topSpendingCategories: [],
        dateRange: { start: new Date(), end: new Date() }
      };
    }
  }

  private async generateFinancialProfile(userId: string, transactionAnalysis: any, billAnalysis: any): Promise<any> {
    // Determine user type based on transaction patterns
    let userType: 'consumer' | 'creator' | 'hybrid' = 'consumer';
    
    // Look for creator indicators
    const creatorIndicators = transactionAnalysis.topSpendingCategories.filter(cat => 
      cat.category.toLowerCase().includes('business') ||
      cat.category.toLowerCase().includes('equipment') ||
      cat.category.toLowerCase().includes('software') ||
      cat.category.toLowerCase().includes('subscription')
    );

    const irregularIncomePattern = transactionAnalysis.savingsRate < 10 || 
      transactionAnalysis.averageMonthlyIncome < transactionAnalysis.averageMonthlySpending * 1.2;

    if (creatorIndicators.length > 2) {
      userType = irregularIncomePattern ? 'creator' : 'hybrid';
    }

    // Determine spending personality
    let spendingPersonality: 'analytical' | 'emotional' | 'impulsive' | 'conservative' = 'conservative';
    
    if (transactionAnalysis.totalTransactions > 200) {
      spendingPersonality = 'analytical';
    } else if (transactionAnalysis.savingsRate < 5) {
      spendingPersonality = 'impulsive';
    } else if (transactionAnalysis.topSpendingCategories.find(cat => 
      cat.category.toLowerCase().includes('entertainment') || 
      cat.category.toLowerCase().includes('dining')
    )?.percentage > 15) {
      spendingPersonality = 'emotional';
    }

    return {
      userType,
      spendingPersonality,
      riskProfile: transactionAnalysis.savingsRate > 15 ? 'low' : 
                   transactionAnalysis.savingsRate > 5 ? 'medium' : 'high',
      monthlyBudgetCapacity: transactionAnalysis.averageMonthlyIncome,
      fixedExpenses: billAnalysis.totalMonthlyBills,
      discretionarySpending: transactionAnalysis.averageMonthlySpending - billAnalysis.totalMonthlyBills
    };
  }

  private async handleGreetingResponse(session: VoiceSession, transcription: string): Promise<string> {
    const analysisPrompt = `
      The user responded: "${transcription}"
      
      Based on their financial analysis:
      - Monthly spending: $${session.transactionAnalysis.averageMonthlySpending.toFixed(2)}
      - Monthly income: $${session.transactionAnalysis.averageMonthlyIncome.toFixed(2)}
      - Detected ${session.billAnalysis.detectedBills.length} recurring bills
      - User type appears to be: ${session.financialProfile.userType}

      Transition to explaining what you found in their spending patterns and ask if they're ready to dive into creating their personalized budget. Keep it conversational and under 3 sentences.
    `;

    return await createAgentResponse(
      this.systemPrompt,
      analysisPrompt,
      session.conversationHistory.slice(-4),
      { temperature: 0.7, maxTokens: 150 }
    );
  }

  private async handleFinancialAnalysisStage(session: VoiceSession, transcription: string): Promise<string> {
    const analysisPrompt = `
      The user responded: "${transcription}"
      
      Share 2-3 key insights from their financial analysis:
      - Top spending category: ${session.transactionAnalysis.topSpendingCategories[0]?.category} ($${session.transactionAnalysis.topSpendingCategories[0]?.amount.toFixed(2)}/month)
      - Detected bills: ${session.billAnalysis.detectedBills.slice(0, 3).map(b => b.name).join(', ')}
      - Savings rate: ${session.transactionAnalysis.savingsRate.toFixed(1)}%
      
      Then ask the first onboarding question about their primary financial goal. Keep it conversational.
    `;

    return await createAgentResponse(
      this.systemPrompt,
      analysisPrompt,
      session.conversationHistory.slice(-4),
      { temperature: 0.7, maxTokens: 200 }
    );
  }

  private async handleQuestioningStage(session: VoiceSession, transcription: string): Promise<{
    response: string;
    moveToNextStage: boolean;
  }> {
    // Get onboarding questions
    const questions = await onboardingAgent.getOnboardingQuestions();
    const currentQuestion = questions[session.currentQuestionIndex];

    if (currentQuestion) {
      // Store response
      session.responses[currentQuestion.id] = transcription;
      session.currentQuestionIndex++;
    }

    // Check if we have all responses
    if (session.currentQuestionIndex >= questions.length) {
      const finalPrompt = `
        Great! I have all the information I need. Based on our conversation and your spending patterns, I'm going to create your personalized 10-envelope budget. 
        
        Your responses: ${JSON.stringify(session.responses)}
        Your spending analysis: Monthly spending $${session.transactionAnalysis.averageMonthlySpending.toFixed(2)}, Bills: ${session.billAnalysis.detectedBills.length}
        
        Let me create your budget now. This will take just a moment.
      `;

      return {
        response: await createAgentResponse(
          this.systemPrompt,
          finalPrompt,
          session.conversationHistory.slice(-2),
          { temperature: 0.7, maxTokens: 100 }
        ),
        moveToNextStage: true
      };
    }

    // Ask next question
    const nextQuestion = questions[session.currentQuestionIndex];
    const questionPrompt = `
      The user answered: "${transcription}" for ${currentQuestion?.question}
      
      Now ask this question naturally: "${nextQuestion.question}"
      
      Make it conversational and reference their spending data when relevant. Keep it under 2 sentences.
    `;

    return {
      response: await createAgentResponse(
        this.systemPrompt,
        questionPrompt,
        session.conversationHistory.slice(-4),
        { temperature: 0.7, maxTokens: 150 }
      ),
      moveToNextStage: false
    };
  }

  private async handleBudgetCreation(session: VoiceSession, transcription: string): Promise<string> {
    try {
      // Create comprehensive onboarding profile
      const onboardingResult = await onboardingAgent.processOnboarding(
        session.userId,
        session.responses,
        {
          userId: session.userId,
          transactions: [],
          envelopes: [],
          monthlyIncome: session.transactionAnalysis.averageMonthlyIncome,
          totalSpent: session.transactionAnalysis.averageMonthlySpending
        }
      );

      // Store the budget recommendations in session
      session.responses.budgetRecommendations = onboardingResult;

      return `Perfect! I've created your personalized budget with ${onboardingResult.recommendedEnvelopes.length} envelopes based on your actual spending patterns. Let's switch to text mode so you can review the details and make any adjustments you'd like.`;

    } catch (error) {
      logger.error({ error, sessionId: session.sessionId }, 'Failed to create budget');
      return "I encountered an issue creating your budget. Let me try again, or we can switch to text mode to continue.";
    }
  }

  async getSessionStatus(sessionId: string, userId: string): Promise<VoiceSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      return null;
    }
    return session;
  }

  async endSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isVoiceActive = false;
      session.stage = 'completed';
      session.lastActivity = new Date();
      
      // Optionally persist session data to database for analytics
      try {
        await db.userMemory.create({
          data: {
            userId: session.userId,
            type: 'voice_onboarding_session',
            content: JSON.stringify({
              sessionId,
              responses: session.responses,
              transactionInsights: {
                totalTransactions: session.transactionAnalysis.totalTransactions,
                monthlySpending: session.transactionAnalysis.averageMonthlySpending,
                monthlyIncome: session.transactionAnalysis.averageMonthlyIncome,
                savingsRate: session.transactionAnalysis.savingsRate,
                userType: session.financialProfile.userType
              },
              duration: new Date().getTime() - session.createdAt.getTime(),
              completedAt: new Date()
            }),
            metadata: JSON.stringify({
              sessionType: 'voice_kyc_onboarding',
              stage: session.stage,
              questionCount: Object.keys(session.responses).length
            })
          }
        });
      } catch (error) {
        logger.error({ error, sessionId }, 'Failed to persist session data');
      }

      this.sessions.delete(sessionId);
      return true;
    }
    return false;
  }

  async getTransactionInsights(userId: string): Promise<TransactionInsights | null> {
    try {
      const session = Array.from(this.sessions.values()).find(s => s.userId === userId);
      if (!session) return null;

      return {
        totalTransactions: session.transactionAnalysis.totalTransactions,
        billCount: session.billAnalysis.detectedBills.length,
        averageMonthlySpending: session.transactionAnalysis.averageMonthlySpending,
        averageMonthlyIncome: session.transactionAnalysis.averageMonthlyIncome,
        topSpendingCategories: session.transactionAnalysis.topSpendingCategories.slice(0, 5),
        spendingPersonality: session.financialProfile.spendingPersonality,
        userType: session.financialProfile.userType,
        riskProfile: session.financialProfile.riskProfile,
        savingsRate: session.transactionAnalysis.savingsRate,
        detectedBills: session.billAnalysis.detectedBills.slice(0, 10)
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get transaction insights');
      return null;
    }
  }
}

export const voiceKYCAgent = new VoiceKYCAgent();
