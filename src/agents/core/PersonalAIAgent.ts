// Personal AI Agent - Per-user AI that learns from each interaction
import { logger } from '../../lib/logger.js';
import { openai } from '../../lib/openai.js';
import { db } from '../../lib/db.js';
import { SupabaseVectorStore } from '../../lib/vectorstore.js';
import { globalAIBrain } from '../../lib/ai/globalAIBrain.js';
import type { FinancialContext, AgentRole } from '../types.js';
import { createHash, randomBytes } from 'crypto';

interface PersonalAISession {
  sessionId: string;
  userId: number;
  isActive: boolean;
  currentContext: {
    topic: string;
    questionsAnswered: number;
    totalQuestions: number;
    userPreferences: Record<string, any>;
    financialGoals: string[];
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
    timeHorizon: 'short' | 'medium' | 'long';
  };
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    type: 'voice' | 'text';
    audioMetadata?: any;
    context?: string;
    metadata?: Record<string, any>;
  }>;
  learningInsights: Array<{
    type: 'spending_pattern' | 'goal_preference' | 'risk_tolerance' | 'communication_style';
    insight: string;
    confidence: number;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;
  budgetRecommendations?: any;
  onboardingComplete: boolean;
  createdAt: Date;
  lastActivity: Date;
}

interface UserLearningProfile {
  userId: number;
  spendingPersonality: 'conservative' | 'balanced' | 'aggressive';
  communicationStyle: 'direct' | 'conversational' | 'detailed';
  financialPriorities: string[];
  learningPreferences: {
    preferredFormat: 'voice' | 'text' | 'mixed';
    detailLevel: 'summary' | 'moderate' | 'comprehensive';
    frequency: 'daily' | 'weekly' | 'monthly';
  };
  interactionHistory: {
    totalInteractions: number;
    lastInteraction: Date;
    preferredTopics: string[];
    avoidedTopics: string[];
  };
  financialDNA: {
    incomePatterns: Record<string, any>;
    spendingCategories: Record<string, any>;
    savingsBehavior: Record<string, any>;
    debtAttitude: Record<string, any>;
  };
}

class PersonalAIAgent {
  private activeSessions = new Map<string, PersonalAISession>();
  private userProfiles = new Map<number, UserLearningProfile>();
  private readonly systemPrompt = `
You are a personalized AI financial coach that has learned the user's financial DNA through previous interactions.

Your role is to:
1. Provide personalized financial guidance based on the user's learning profile
2. Adapt your communication style to match their preferences
3. Reference their specific financial patterns and goals
4. Learn from each interaction to improve future responses
5. Integrate shared knowledge (budgeting playbooks, IRS docs) with personal insights

Personalization Guidelines:
- Use their preferred communication style (direct/conversational/detailed)
- Reference their specific financial patterns and goals
- Adapt complexity based on their learning preferences
- Build on previous conversations and insights
- Provide actionable advice tailored to their situation

Remember: You are learning and adapting with each interaction to become more personalized.
  `;

  // Initialize or retrieve user's personal AI profile
  async initializeUserProfile(userId: number): Promise<UserLearningProfile> {
    try {
      // Check if profile exists
      let profile = this.userProfiles.get(userId);

      if (!profile) {
        // Create new profile from user data
        profile = await this.createInitialProfile(userId);
        this.userProfiles.set(userId, profile);

        logger.info({ userId }, 'Created new personal AI profile');
      }

      return profile;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to initialize user profile');
      throw error;
    }
  }

  // Create initial profile from user's financial data
  private async createInitialProfile(userId: number): Promise<UserLearningProfile> {
    try {
      // Get user's financial data
      const userData = await db.user.findUnique({
        where: { id: userId },
        include: {
          transactions: {
            take: 100,
            orderBy: { createdAt: 'desc' },
            include: { envelope: true }
          },
          envelopes: {
            where: { isActive: true }
          },
          goals: true
        }
      });

      if (!userData) {
        throw new Error('User data not found');
      }

      // Analyze spending patterns
      const spendingPersonality = this.analyzeSpendingPersonality(userData.transactions);
      const financialPriorities = this.extractFinancialPriorities(userData.goals, userData.transactions);
      const communicationStyle = 'conversational'; // Default, will be learned over time

      const profile: UserLearningProfile = {
        userId,
        spendingPersonality,
        communicationStyle,
        financialPriorities,
        learningPreferences: {
          preferredFormat: 'mixed',
          detailLevel: 'moderate',
          frequency: 'weekly'
        },
        interactionHistory: {
          totalInteractions: 0,
          lastInteraction: new Date(),
          preferredTopics: [],
          avoidedTopics: []
        },
        financialDNA: {
          incomePatterns: this.analyzeIncomePatterns(userData.transactions),
          spendingCategories: this.analyzeSpendingCategories(userData.transactions),
          savingsBehavior: this.analyzeSavingsBehavior(userData.transactions),
          debtAttitude: this.analyzeDebtAttitude(userData.transactions)
        }
      };

      // Store initial profile in vector storage
      await this.storeUserProfile(userId, profile);

      return profile;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to create initial profile');
      throw error;
    }
  }

  // Analyze user's spending personality from transaction patterns
  private analyzeSpendingPersonality(transactions: any[]): 'conservative' | 'balanced' | 'aggressive' {
    const expenses = transactions.filter(t => t.amountCents < 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);
    const avgExpense = totalExpenses / expenses.length;

    // Calculate spending volatility
    const variance = expenses.reduce((sum, t) => {
      const diff = Math.abs(t.amountCents) - avgExpense;
      return sum + (diff * diff);
    }, 0) / expenses.length;

    const volatility = Math.sqrt(variance) / avgExpense;

    if (volatility < 0.5) return 'conservative';
    if (volatility < 1.0) return 'balanced';
    return 'aggressive';
  }

  // Extract financial priorities from goals and transactions
  private extractFinancialPriorities(goals: any[], transactions: any[]): string[] {
    const priorities: string[] = [];

    // Add goals as priorities
    goals.forEach(goal => {
      priorities.push(goal.description);
    });

    // Analyze transaction patterns for implicit priorities
    const categories = transactions.reduce((acc, t) => {
      const category = t.envelope?.name || 'Uncategorized';
      acc[category] = (acc[category] || 0) + Math.abs(t.amountCents);
      return acc;
    }, {} as Record<string, number>);

    // Add high-spending categories as priorities
    Object.entries(categories)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .forEach(([category]) => {
        if (!priorities.includes(category)) {
          priorities.push(category);
        }
      });

    return priorities;
  }

  // Analyze income patterns
  private analyzeIncomePatterns(transactions: any[]): Record<string, any> {
    const income = transactions.filter(t => t.amountCents > 0);
    const totalIncome = income.reduce((sum, t) => sum + t.amountCents, 0);
    const avgIncome = totalIncome / income.length;

    return {
      totalIncome: totalIncome / 100,
      averageIncome: avgIncome / 100,
      incomeFrequency: this.detectIncomeFrequency(income),
      incomeStability: this.calculateIncomeStability(income, avgIncome)
    };
  }

  // Analyze spending categories
  private analyzeSpendingCategories(transactions: any[]): Record<string, any> {
    const expenses = transactions.filter(t => t.amountCents < 0);
    const categories = expenses.reduce((acc, t) => {
      const category = t.envelope?.name || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = { total: 0, count: 0, average: 0 };
      }
      acc[category].total += Math.abs(t.amountCents);
      acc[category].count += 1;
      return acc;
    }, {} as Record<string, any>);

    // Calculate averages
    Object.values(categories).forEach((cat: any) => {
      cat.average = cat.total / cat.count;
      cat.total = cat.total / 100; // Convert to dollars
      cat.average = cat.average / 100;
    });

    return categories;
  }

  // Analyze savings behavior
  private analyzeSavingsBehavior(transactions: any[]): Record<string, any> {
    const income = transactions.filter(t => t.amountCents > 0);
    const expenses = transactions.filter(t => t.amountCents < 0);

    const totalIncome = income.reduce((sum, t) => sum + t.amountCents, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);

    const savings = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

    return {
      totalSavings: savings / 100,
      savingsRate,
      savingsConsistency: this.calculateSavingsConsistency(transactions),
      emergencyFundStatus: this.assessEmergencyFund(transactions)
    };
  }

  // Analyze debt attitude
  private analyzeDebtAttitude(transactions: any[]): Record<string, any> {
    // This would need to be enhanced with actual debt data
    // For now, analyze spending vs income patterns
    const income = transactions.filter(t => t.amountCents > 0);
    const expenses = transactions.filter(t => t.amountCents < 0);

    const totalIncome = income.reduce((sum, t) => sum + t.amountCents, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amountCents), 0);

    return {
      debtToIncomeRatio: totalExpenses / totalIncome,
      spendingDiscipline: totalExpenses <= totalIncome ? 'good' : 'needs_improvement',
      debtPriority: totalExpenses > totalIncome ? 'high' : 'low'
    };
  }

  // Detect income frequency
  private detectIncomeFrequency(income: any[]): string {
    if (income.length < 2) return 'unknown';

    const dates = income.map(t => new Date(t.createdAt)).sort();
    const intervals = [];

    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].getTime() - dates[i-1].getTime();
      intervals.push(diff / (1000 * 60 * 60 * 24)); // Convert to days
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

    if (avgInterval <= 7) return 'weekly';
    if (avgInterval <= 14) return 'biweekly';
    if (avgInterval <= 31) return 'monthly';
    return 'irregular';
  }

  // Calculate income stability
  private calculateIncomeStability(income: any[], avgIncome: number): number {
    if (income.length < 2) return 1.0;

    const variance = income.reduce((sum, t) => {
      const diff = t.amountCents - avgIncome;
      return sum + (diff * diff);
    }, 0) / income.length;

    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgIncome;

    // Return stability score (0-1, higher is more stable)
    return Math.max(0, 1 - coefficientOfVariation);
  }

  // Calculate savings consistency
  private calculateSavingsConsistency(transactions: any[]): number {
    // Group transactions by month and calculate monthly savings
    const monthlyData = transactions.reduce((acc, t) => {
      const month = new Date(t.createdAt).toISOString().substring(0, 7);
      if (!acc[month]) {
        acc[month] = { income: 0, expenses: 0 };
      }
      if (t.amountCents > 0) {
        acc[month].income += t.amountCents;
      } else {
        acc[month].expenses += Math.abs(t.amountCents);
      }
      return acc;
    }, {} as Record<string, any>);

    const monthlySavings = Object.values(monthlyData).map((month: any) => month.income - month.expenses);
    const positiveMonths = monthlySavings.filter(savings => savings > 0).length;

    return positiveMonths / monthlySavings.length;
  }

  // Assess emergency fund status
  private assessEmergencyFund(transactions: any[]): string {
    const expenses = transactions.filter(t => t.amountCents < 0);
    const monthlyExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / 100;

    // This is a simplified assessment - would need actual savings account data
    return monthlyExpenses > 0 ? 'unknown' : 'unknown';
  }

  // Store user profile in vector storage
  private async storeUserProfile(userId: number, profile: UserLearningProfile): Promise<void> {
    try {
      await SupabaseVectorStore.upsertEmbedding(
        userId,
        {
          content: JSON.stringify(profile),
          docType: 'user_profile',
          metadata: {
            profileType: 'personal_ai_profile',
            userId,
            lastUpdated: new Date().toISOString(),
            version: '1.0'
          }
        }
      );

      logger.debug({ userId }, 'User profile stored in vector storage');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to store user profile in vector storage');
    }
  }

  // Start a new personal AI session
  async startPersonalAISession(userId: number, topic: string): Promise<PersonalAISession> {
    try {
      // Initialize or get user profile
      const profile = await this.initializeUserProfile(userId);

      // Create new session
      const session: PersonalAISession = {
        sessionId: this.generateSessionId(),
        userId,
        isActive: true,
        currentContext: {
          topic,
          questionsAnswered: 0,
          totalQuestions: 5, // Default, will be adjusted based on topic
          userPreferences: profile.learningPreferences,
          financialGoals: profile.financialPriorities,
          riskTolerance: 'moderate', // Will be learned over time
          timeHorizon: 'medium'
        },
        conversationHistory: [],
        learningInsights: [],
        onboardingComplete: false,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      // Add initial greeting
      const greeting = await this.generatePersonalizedGreeting(profile, topic);
      session.conversationHistory.push({
        role: 'assistant',
        content: greeting,
        timestamp: new Date(),
        type: 'text',
        context: 'session_start'
      });

      this.activeSessions.set(session.sessionId, session);

      // Update interaction history
      profile.interactionHistory.totalInteractions++;
      profile.interactionHistory.lastInteraction = new Date();
      this.userProfiles.set(userId, profile);

      logger.info({ userId, sessionId: session.sessionId, topic }, 'Started personal AI session');
      return session;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to start personal AI session');
      throw error;
    }
  }

  // Generate personalized greeting based on user profile
  private async generatePersonalizedGreeting(profile: UserLearningProfile, topic: string): Promise<string> {
    const style = profile.communicationStyle;
    const name = `User ${profile.userId}`; // Would come from actual user data

    let greeting = '';

    switch (style) {
      case 'direct':
        greeting = `Hi ${name}, let's work on ${topic}. What's your main question?`;
        break;
      case 'conversational':
        greeting = `Hey ${name}! I'm excited to help you with ${topic}. How can I assist you today?`;
        break;
      case 'detailed':
        greeting = `Hello ${name}! I've been analyzing your financial patterns and I'm ready to help you with ${topic}. I noticed you're ${profile.spendingPersonality} with your spending and prioritize ${profile.financialPriorities.slice(0, 2).join(' and ')}. What would you like to focus on?`;
        break;
      default:
        greeting = `Hi ${name}, I'm here to help with ${topic}. What can I assist you with?`;
    }

    return greeting;
  }

  // Process user input and generate personalized response
  async processUserInput(
    sessionId: string,
    userInput: string,
    metadata?: Record<string, any>
  ): Promise<{
    response: string;
    shouldContinue: boolean;
    insights: any[];
    nextActions: string[];
  }> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Add user input to conversation history
      session.conversationHistory.push({
        role: 'user',
        content: userInput,
        timestamp: new Date(),
        type: 'text',
        metadata
      });

      // Get user profile
      const profile = this.userProfiles.get(session.userId);
      if (!profile) {
        throw new Error('User profile not found');
      }

      // Get relevant knowledge from Global AI Brain
      const relevantKnowledge = await globalAIBrain.getRelevantKnowledge(
        userInput,
        profile.spendingPersonality === 'conservative' ? 'consumer' : 'creator',
        undefined,
        3
      );

      // Generate personalized response
      const response = await this.generatePersonalizedResponse(
        userInput,
        profile,
        relevantKnowledge,
        session
      );

      // Add AI response to conversation history
      session.conversationHistory.push({
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        type: 'text',
        context: `response_to_${session.currentContext.questionsAnswered + 1}`
      });

      // Update session state
      session.currentContext.questionsAnswered++;
      session.lastActivity = new Date();

      // Store session in vector storage for learning
      await this.storeSessionData(session);

      // Generate learning insights
      const insights = await this.generateLearningInsights(session, userInput, response.response);
      session.learningInsights.push(...insights);

      logger.info({
        userId: session.userId,
        sessionId,
        questionsAnswered: session.currentContext.questionsAnswered
      }, 'Processed user input in personal AI session');

      return {
        response: response.response,
        shouldContinue: session.currentContext.questionsAnswered < session.currentContext.totalQuestions,
        insights: insights.map(i => ({ type: i.type, insight: i.insight })),
        nextActions: response.suggestedActions || []
      };

    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to process user input');
      throw error;
    }
  }

  // Generate personalized response using OpenAI
  private async generatePersonalizedResponse(
    userInput: string,
    profile: UserLearningProfile,
    relevantKnowledge: any[],
    session: PersonalAISession
  ): Promise<{
    response: string;
    suggestedActions: string[];
  }> {
    if (!openai) {
      // Fallback response
      return {
        response: "I'm here to help with your financial questions. What would you like to know?",
        suggestedActions: []
      };
    }

    try {
      const prompt = `
${this.systemPrompt}

User Profile:
- Spending Personality: ${profile.spendingPersonality}
- Communication Style: ${profile.communicationStyle}
- Financial Priorities: ${profile.financialPriorities.join(', ')}
- Learning Preferences: ${profile.learningPreferences.detailLevel} detail level

Current Session Context:
- Topic: ${session.currentContext.topic}
- Questions Answered: ${session.currentContext.questionsAnswered}/${session.currentContext.totalQuestions}

Relevant Knowledge:
${relevantKnowledge.map(k => `- ${k.title}: ${k.content.substring(0, 200)}...`).join('\n')}

User Input: "${userInput}"

Generate a personalized response that:
1. Matches their communication style (${profile.communicationStyle})
2. References their specific financial patterns and goals
3. Integrates relevant knowledge from the Global AI Brain
4. Provides actionable next steps
5. Adapts to their learning preferences

Response:`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a personalized AI financial coach. Provide helpful, personalized financial guidance.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const response = completion.choices[0]?.message?.content || 'I apologize, but I need more information to help you effectively.';

      // Extract suggested actions (simple parsing)
      const suggestedActions = this.extractSuggestedActions(response);

      return {
        response,
        suggestedActions
      };

    } catch (error) {
      logger.error({ error }, 'Failed to generate personalized response');
      return {
        response: "I'm having trouble processing your request right now. Let me try a different approach.",
        suggestedActions: []
      };
    }
  }

  // Extract suggested actions from response
  private extractSuggestedActions(response: string): string[] {
    const actions: string[] = [];

    // Simple pattern matching for action items
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

    return actions.slice(0, 3); // Limit to 3 actions
  }

  // Generate learning insights from interaction
  private async generateLearningInsights(
    session: PersonalAISession,
    userInput: string,
    aiResponse: string
  ): Promise<Array<{
    type: 'spending_pattern' | 'goal_preference' | 'risk_tolerance' | 'communication_style';
    insight: string;
    confidence: number;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>> {
    const insights: Array<{
      type: 'spending_pattern' | 'goal_preference' | 'risk_tolerance' | 'communication_style';
      insight: string;
      confidence: number;
      timestamp: Date;
      metadata?: Record<string, any>;
    }> = [];

    try {
      // Analyze user input for insights
      const inputLower = userInput.toLowerCase();

      // Spending pattern insights
      if (inputLower.includes('spend') || inputLower.includes('budget') || inputLower.includes('save')) {
        insights.push({
          type: 'spending_pattern',
          insight: 'User shows interest in spending control and budgeting',
          confidence: 0.8,
          timestamp: new Date(),
          metadata: { keywords: ['spend', 'budget', 'save'] }
        });
      }

      // Goal preference insights
      if (inputLower.includes('goal') || inputLower.includes('target') || inputLower.includes('plan')) {
        insights.push({
          type: 'goal_preference',
          insight: 'User demonstrates goal-oriented financial thinking',
          confidence: 0.7,
          timestamp: new Date(),
          metadata: { keywords: ['goal', 'target', 'plan'] }
        });
      }

      // Risk tolerance insights
      if (inputLower.includes('safe') || inputLower.includes('conservative') || inputLower.includes('risk')) {
        insights.push({
          type: 'risk_tolerance',
          insight: 'User shows conservative risk preferences',
          confidence: 0.6,
          timestamp: new Date(),
          metadata: { keywords: ['safe', 'conservative', 'risk'] }
        });
      }

      // Communication style insights
      const responseLength = aiResponse.length;
      if (responseLength > 200) {
        insights.push({
          type: 'communication_style',
          insight: 'User responds well to detailed explanations',
          confidence: 0.7,
          timestamp: new Date(),
          metadata: { responseLength, style: 'detailed' }
        });
      }

    } catch (error) {
      logger.error({ error }, 'Failed to generate learning insights');
    }

    return insights;
  }

  // Store session data in vector storage for learning
  private async storeSessionData(session: PersonalAISession): Promise<void> {
    try {
      // Store conversation history
      await SupabaseVectorStore.upsertEmbedding(
        session.userId,
        {
          content: JSON.stringify(session.conversationHistory),
          docType: 'conversation_history',
          metadata: {
            sessionId: session.sessionId,
            topic: session.currentContext.topic,
            questionsAnswered: session.currentContext.questionsAnswered,
            timestamp: new Date().toISOString()
          }
        }
      );

      // Store learning insights
      if (session.learningInsights.length > 0) {
        await SupabaseVectorStore.upsertEmbedding(
          session.userId,
          {
            content: JSON.stringify(session.learningInsights),
            docType: 'learning_insights',
            metadata: {
              sessionId: session.sessionId,
              insightCount: session.learningInsights.length,
              timestamp: new Date().toISOString()
            }
          }
        );
      }

      logger.debug({ userId: session.userId, sessionId: session.sessionId }, 'Session data stored in vector storage');
    } catch (error) {
      logger.error({ error, sessionId: session.sessionId }, 'Failed to store session data in vector storage');
    }
  }

  // Get user's learning profile
  async getUserProfile(userId: number): Promise<UserLearningProfile | null> {
    return this.userProfiles.get(userId) || null;
  }

  // Get active session
  async getSession(sessionId: string): Promise<PersonalAISession | null> {
    return this.activeSessions.get(sessionId) || null;
  }

  // End session
  async endSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.lastActivity = new Date();

      // Store final session data
      await this.storeSessionData(session);

      // Update user profile with final insights
      const profile = this.userProfiles.get(session.userId);
      if (profile) {
        profile.interactionHistory.lastInteraction = new Date();
        this.userProfiles.set(session.userId, profile);
        await this.storeUserProfile(session.userId, profile);
      }

      logger.info({ sessionId, userId: session.userId }, 'Personal AI session ended');
    }
  }

  // Generate session ID
  private generateSessionId(): string {
    return `session_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  // Get session statistics
  getSessionStats(): {
    activeSessions: number;
    totalUsers: number;
    totalInteractions: number;
  } {
    const activeSessions = Array.from(this.activeSessions.values()).filter(s => s.isActive).length;
    const totalUsers = this.userProfiles.size;
    const totalInteractions = Array.from(this.userProfiles.values())
      .reduce((sum, profile) => sum + profile.interactionHistory.totalInteractions, 0);

    return {
      activeSessions,
      totalUsers,
      totalInteractions
    };
  }
}

// Export singleton instance
export const personalAIAgent = new PersonalAIAgent();
