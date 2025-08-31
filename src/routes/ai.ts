import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { createAgentResponse } from '../lib/openai.js';
import { db } from '../lib/db.js';
import { financialCoachAgent } from '../agents/core/FinancialCoachAgent.js';
import { contentCreatorAgent } from '../agents/core/ContentCreatorAgent.js';
import type { FinancialContext } from '../agents/tools/types.js';

const router = Router();

// Validation schemas
const CoachingSessionSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionType: z.enum(['check_in', 'crisis', 'goal_planning', 'spending_review', 'general']).optional(),
  context: z.object({
    currentLocation: z.string().optional(),
    timeOfDay: z.string().optional(),
    recentTransaction: z.object({
      amount: z.number(),
      merchant: z.string(),
      category: z.string().optional(),
    }).optional(),
  }).optional(),
});

const InsightRequestSchema = z.object({
  includeRecommendations: z.boolean().default(true),
  analysisDepth: z.enum(['basic', 'detailed', 'comprehensive']).default('detailed'),
  focusArea: z.enum(['spending', 'saving', 'goals', 'overall']).optional(),
});

const CheckInScheduleSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
  preferredTime: z.string().optional(), // "09:00" format
  timezone: z.string().optional(),
});

// GET /api/ai/coach/insights - Get personalized financial insights
router.get('/coach/insights', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = InsightRequestSchema.parse(req.query);

    logger.info({ userId, query }, 'Fetching personalized financial insights');

    // Build financial context
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true, onboardingCompleted: true }
    });

    const envelopes = await db.envelope.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        balance: true,
        targetAmount: true,
        category: true,
        createdAt: true,
      }
    });

    const recentTransactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        amountCents: true,
        description: true,
        merchantName: true,
        category: true,
        createdAt: true,
      }
    });

    const goals = await db.envelope.findMany({
      where: { 
        userId,
        category: 'savings'
      },
      select: {
        name: true,
        balance: true,
        targetAmount: true,
      }
    });

    const context: FinancialContext = {
      user: {
        id: userId,
        type: user?.userType as any,
        onboardingCompleted: user?.onboardingCompleted || false,
      },
      envelopes,
      transactions: recentTransactions,
      goals: goals.map(g => ({
        name: g.name,
        currentAmount: g.balance,
        targetAmount: g.targetAmount,
      })),
      monthlyIncome: undefined, // Would be calculated from transactions
      emergencyFund: envelopes.find(e => e.name.toLowerCase().includes('emergency'))?.balance,
    };

    // Get personalized insights (route to creator agent if user is a creator)
    let insights;
    if (user?.userType === 'creator') {
      insights = await contentCreatorAgent.getCreatorInsights(userId, context);
    } else {
      insights = await financialCoachAgent.getPersonalizedInsights(userId, context);
    }

    // Calculate financial health score
    const healthScore = calculateFinancialHealthScore(context);

    // Get spending trends
    const spendingTrends = analyzeSpendingTrends(recentTransactions);

    // Get goal progress
    const goalProgress = calculateGoalProgress(goals);

    res.json({
      ok: true,
      insights: insights.map(insight => ({
        type: insight.type,
        category: insight.category,
        message: insight.message,
        confidence: insight.confidence,
        urgency: insight.urgency,
        actionable: insight.actionable,
        suggestedActions: insight.suggestedActions,
      })),
      healthScore,
      spendingTrends,
      goalProgress,
      summary: {
        totalEnvelopes: envelopes.length,
        totalBalance: envelopes.reduce((sum, e) => sum + e.balance, 0),
        recentTransactionCount: recentTransactions.length,
        activeGoals: goals.filter(g => g.targetAmount > g.balance).length,
      },
      lastUpdated: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to fetch financial insights');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid request parameters',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to fetch financial insights',
      code: 'INSIGHTS_ERROR'
    });
  }
});

// POST /api/ai/coach/session - Start a coaching session
router.post('/coach/session', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { message, sessionType, context: sessionContext } = CoachingSessionSchema.parse(req.body);

    logger.info({ 
      userId, 
      sessionType: sessionType || 'general',
      messageLength: message.length 
    }, 'Starting AI coaching session');

    // Build comprehensive financial context
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true, onboardingCompleted: true }
    });

    const envelopes = await db.envelope.findMany({
      where: { userId }
    });

    const recentTransactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const goals = await db.envelope.findMany({
      where: { 
        userId,
        category: 'savings'
      }
    });

    const context: FinancialContext = {
      user: {
        id: userId,
        type: user?.userType as any,
        onboardingCompleted: user?.onboardingCompleted || false,
      },
      envelopes,
      transactions: recentTransactions,
      goals: goals.map(g => ({
        name: g.name,
        currentAmount: g.balance,
        targetAmount: g.targetAmount,
      })),
      monthlyIncome: estimateMonthlyIncome(recentTransactions),
      emergencyFund: envelopes.find(e => e.name.toLowerCase().includes('emergency'))?.balance,
      sessionContext,
    };

    // Start coaching session
    const session = await financialCoachAgent.startCoachingSession(
      userId,
      message,
      context,
      sessionType || 'general'
    );

    res.json({
      ok: true,
      session: {
        sessionId: session.sessionId,
        coachResponse: session.coachResponse,
        insights: session.insights,
        recommendations: session.recommendations,
        emotionalTone: session.emotionalTone,
        followUpNeeded: session.followUpNeeded,
        topic: session.topic,
      },
      context: {
        financialHealthScore: calculateFinancialHealthScore(context),
        spendingTrend: getSpendingTrend(recentTransactions),
        envelopeStatus: getEnvelopeStatus(envelopes),
      },
      nextSteps: session.recommendations.slice(0, 3),
      timestamp: session.createdAt.toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Coaching session failed');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid session parameters',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to start coaching session',
      code: 'COACHING_ERROR'
    });
  }
});

// POST /api/ai/coach/check-in/schedule - Schedule regular check-ins
router.post('/coach/check-in/schedule', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { frequency, preferredTime, timezone } = CheckInScheduleSchema.parse(req.body);

    logger.info({ userId, frequency, preferredTime }, 'Scheduling coaching check-ins');

    // Schedule check-ins (would integrate with a job scheduler)
    await financialCoachAgent.scheduleCheckIn(userId, frequency);

    // Store user preferences
    await db.user.update({
      where: { id: userId },
      data: {
        // Would store in user preferences table
      }
    });

    res.json({
      ok: true,
      message: `Check-ins scheduled ${frequency}`,
      schedule: {
        frequency,
        preferredTime,
        timezone: timezone || 'UTC',
        nextCheckIn: calculateNextCheckIn(frequency, preferredTime),
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to schedule check-ins');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid schedule parameters',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to schedule check-ins',
      code: 'SCHEDULE_ERROR'
    });
  }
});

// GET /api/ai/coach/history - Get coaching session history
router.get('/coach/history', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    logger.info({ userId, limit }, 'Fetching coaching history');

    const sessions = await financialCoachAgent.getCoachingHistory(userId, limit);

    res.json({
      ok: true,
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        topic: session.topic,
        sessionType: session.sessionType,
        emotionalTone: session.emotionalTone,
        insightCount: session.insights.length,
        recommendationCount: session.recommendations.length,
        followUpNeeded: session.followUpNeeded,
        createdAt: session.createdAt,
      })),
      totalSessions: sessions.length,
      lastSession: sessions[0]?.createdAt,
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to fetch coaching history');
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch coaching history',
      code: 'HISTORY_ERROR'
    });
  }
});

// Helper methods
function calculateFinancialHealthScore(context: FinancialContext): number {
  let score = 0;
  let factors = 0;

  // Emergency fund factor (30 points)
  if (context.emergencyFund) {
    factors++;
    if (context.emergencyFund >= 1000) score += 30;
    else if (context.emergencyFund >= 500) score += 20;
    else if (context.emergencyFund >= 100) score += 10;
  }

  // Envelope balance factor (25 points)
  if (context.envelopes && context.envelopes.length > 0) {
    factors++;
    const healthyEnvelopes = context.envelopes.filter(e => e.balance >= 0).length;
    const healthRatio = healthyEnvelopes / context.envelopes.length;
    score += Math.round(healthRatio * 25);
  }

  // Goal progress factor (25 points)
  if (context.goals && context.goals.length > 0) {
    factors++;
    const goalsOnTrack = context.goals.filter(g => g.currentAmount >= g.targetAmount * 0.5).length;
    const goalRatio = goalsOnTrack / context.goals.length;
    score += Math.round(goalRatio * 25);
  }

  // Transaction consistency factor (20 points)
  if (context.transactions && context.transactions.length > 0) {
    factors++;
    const recentDays = 7;
    const hasRecentActivity = context.transactions.some(t => 
      new Date(t.createdAt) > new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000)
    );
    if (hasRecentActivity) score += 20;
  }

  return factors > 0 ? Math.round(score / factors) : 0;
}

function analyzeSpendingTrends(transactions: any[]) {
  if (transactions.length < 7) return { trend: 'insufficient_data', change: 0 };

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const thisWeek = transactions.filter(t => 
    new Date(t.createdAt) >= oneWeekAgo && t.amountCents > 0
  ).reduce((sum, t) => sum + t.amountCents, 0);

  const lastWeek = transactions.filter(t => 
    new Date(t.createdAt) >= twoWeeksAgo && 
    new Date(t.createdAt) < oneWeekAgo && 
    t.amountCents > 0
  ).reduce((sum, t) => sum + t.amountCents, 0);

  if (lastWeek === 0) return { trend: 'insufficient_data', change: 0 };

  const change = ((thisWeek - lastWeek) / lastWeek) * 100;
  let trend = 'stable';

  if (change > 10) trend = 'increasing';
  else if (change < -10) trend = 'decreasing';

  return { trend, change: Math.round(change) };
}

function calculateGoalProgress(goals: any[]) {
  if (goals.length === 0) return { total: 0, onTrack: 0, completed: 0, averageProgress: 0 };

  const completed = goals.filter(g => g.balance >= g.targetAmount).length;
  const onTrack = goals.filter(g => g.balance >= g.targetAmount * 0.5 && g.balance < g.targetAmount).length;
  const totalProgress = goals.reduce((sum, g) => sum + (g.balance / g.targetAmount), 0);
  const averageProgress = Math.round((totalProgress / goals.length) * 100);

  return {
    total: goals.length,
    onTrack,
    completed,
    averageProgress,
  };
}

function estimateMonthlyIncome(transactions: any[]): number | undefined {
  const income = transactions
    .filter(t => t.amountCents < 0) // Negative amounts are deposits in Plaid
    .filter(t => Math.abs(t.amountCents) > 50000) // Likely income, not small transfers
    .slice(0, 3); // Last 3 income transactions

  if (income.length === 0) return undefined;

  const averageIncome = income.reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / income.length;
  return Math.round(averageIncome / 100); // Convert to dollars
}

function getSpendingTrend(transactions: any[]): string {
  const trends = analyzeSpendingTrends(transactions);
  return trends.trend;
}

function getEnvelopeStatus(envelopes: any[]) {
  const total = envelopes.length;
  const healthy = envelopes.filter(e => e.balance >= 0).length;
  const overspent = envelopes.filter(e => e.balance < 0).length;
  const low = envelopes.filter(e => e.balance > 0 && e.balance < e.targetAmount * 0.2).length;

  return { total, healthy, overspent, low };
}

function calculateNextCheckIn(frequency: string, preferredTime?: string): string {
  const now = new Date();
  let nextDate = new Date(now);

  switch (frequency) {
    case 'daily':
      nextDate.setDate(now.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(now.getDate() + 7);
      break;
    case 'biweekly':
      nextDate.setDate(now.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(now.getMonth() + 1);
      break;
  }

  if (preferredTime) {
    const [hours, minutes] = preferredTime.split(':').map(Number);
    nextDate.setHours(hours, minutes, 0, 0);
  }

  return nextDate.toISOString();
}

// POST /api/ai/chat - General AI chat endpoint
router.post('/chat', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { message, agentName, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: 'Message is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Use financial coach agent as default
    const agent = agentName || 'financial_advisor';
    
    // Build financial context
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true, onboardingCompleted: true }
    });

    const envelopes = await db.envelope.findMany({
      where: { userId }
    });

    const recentTransactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Create a simple chat response
    const response = await createAgentResponse(
      message,
      {
        role: 'assistant',
        content: `Hello! I'm your ${agent.replace('_', ' ')}. How can I help you with your finances today?`
      }
    );

    res.json({
      ok: true,
      response: response.content,
      agentName: agent,
      sessionId: sessionId || `session_${Date.now()}`,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'AI chat failed');
    res.status(500).json({
      ok: false,
      error: 'AI chat failed',
      code: 'CHAT_ERROR'
    });
  }
});

// POST /api/ai/handoff - Agent handoff endpoint
router.post('/handoff', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { fromAgent, toAgent, message, reason, priority } = req.body;

    if (!fromAgent || !toAgent || !message) {
      return res.status(400).json({
        ok: false,
        error: 'fromAgent, toAgent, and message are required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Log the handoff
    logger.info({ 
      userId, 
      fromAgent, 
      toAgent, 
      reason: reason || 'User requested handoff',
      priority: priority || 'normal'
    }, 'Agent handoff requested');

    // Simple handoff response
    const handoffResponse = `Transferring you from ${fromAgent.replace('_', ' ')} to ${toAgent.replace('_', ' ')}. ${toAgent.replace('_', ' ')} will help you with: ${message}`;

    res.json({
      ok: true,
      handoff: {
        fromAgent,
        toAgent,
        message: handoffResponse,
        reason: reason || 'User requested handoff',
        priority: priority || 'normal',
        timestamp: new Date().toISOString(),
        sessionId: `handoff_${Date.now()}`,
      },
      nextSteps: [`Continue conversation with ${toAgent.replace('_', ' ')}`],
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Agent handoff failed');
    res.status(500).json({
      ok: false,
      error: 'Agent handoff failed',
      code: 'HANDOFF_ERROR'
    });
  }
});

// GET /api/ai/agents - List available agents
router.get('/agents', auth, async (req, res) => {
  try {
    const agents = [
      {
        name: 'financial_advisor',
        displayName: 'Financial Advisor',
        description: 'Provides comprehensive financial advice and planning',
        capabilities: ['investment_advice', 'retirement_planning', 'financial_analysis'],
        available: true,
        toolCount: 8,
      },
      {
        name: 'budget_coach',
        displayName: 'Budget Coach',
        description: 'Helps with budgeting and expense management',
        capabilities: ['budget_creation', 'expense_tracking', 'savings_goals'],
        available: true,
        toolCount: 6,
      },
      {
        name: 'transaction_analyst',
        displayName: 'Transaction Analyst',
        description: 'Analyzes spending patterns and transaction data',
        capabilities: ['spending_analysis', 'categorization', 'trend_detection'],
        available: true,
        toolCount: 5,
      },
      {
        name: 'goal_tracker',
        displayName: 'Goal Tracker',
        description: 'Tracks financial goals and milestones',
        capabilities: ['goal_setting', 'progress_tracking', 'milestone_celebration'],
        available: true,
        toolCount: 4,
      },
    ];

    res.json({
      ok: true,
      agents,
      totalAgents: agents.length,
      availableAgents: agents.filter(a => a.available).length,
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to list agents');
    res.status(500).json({
      ok: false,
      error: 'Failed to list agents',
      code: 'AGENTS_ERROR'
    });
  }
});

// POST /api/ai/tools/execute - Execute specific tools
router.post('/tools/execute', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { toolName, parameters, agentContext } = req.body;

    if (!toolName) {
      return res.status(400).json({
        ok: false,
        error: 'toolName is required',
        code: 'VALIDATION_ERROR'
      });
    }

    // Mock tool execution based on toolName
    let result;
    switch (toolName) {
      case 'create_envelope':
        result = {
          success: true,
          envelopeId: `env_${Date.now()}`,
          name: parameters?.name || 'New Envelope',
          balance: 0,
        };
        break;
      case 'budget_analysis':
        result = {
          success: true,
          analysis: {
            totalSpending: 1250.00,
            categories: ['groceries', 'dining', 'gas'],
            recommendations: ['Reduce dining out by 20%'],
          },
        };
        break;
      case 'agent_handoff':
        result = {
          success: true,
          handoffTo: parameters?.targetAgent || 'financial_advisor',
          message: 'Handoff completed successfully',
        };
        break;
      default:
        result = {
          success: false,
          error: `Tool '${toolName}' not found`,
        };
    }

    res.json({
      ok: result.success,
      result,
      toolName,
      executedAt: new Date().toISOString(),
      agentContext,
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Tool execution failed');
    res.status(500).json({
      ok: false,
      error: 'Tool execution failed',
      code: 'TOOL_ERROR'
    });
  }
});

// GET /api/ai/tools - List available tools
router.get('/tools', auth, async (req, res) => {
  try {
    const { category } = req.query;

    const tools = [
      {
        name: 'create_envelope',
        category: 'envelope',
        description: 'Create a new budget envelope',
        riskLevel: 'low',
        executionCount: 0,
      },
      {
        name: 'budget_analysis',
        category: 'budget',
        description: 'Analyze budget and spending patterns',
        riskLevel: 'low',
        executionCount: 0,
      },
      {
        name: 'agent_handoff',
        category: 'handoff',
        description: 'Transfer conversation to another agent',
        riskLevel: 'low',
        executionCount: 0,
      },
      {
        name: 'categorize_transaction',
        category: 'transaction',
        description: 'Categorize financial transactions',
        riskLevel: 'low',
        executionCount: 0,
      },
      {
        name: 'transfer_funds',
        category: 'envelope',
        description: 'Transfer money between envelopes',
        riskLevel: 'medium',
        executionCount: 0,
      },
    ];

    const filteredTools = category ? tools.filter(t => t.category === category) : tools;

    res.json({
      ok: true,
      tools: filteredTools,
      totalTools: tools.length,
      categories: [...new Set(tools.map(t => t.category))],
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to list tools');
    res.status(500).json({
      ok: false,
      error: 'Failed to list tools',
      code: 'TOOLS_ERROR'
    });
  }
});

// GET /api/ai/status - System status endpoint
router.get('/status', auth, async (req, res) => {
  try {
    const status = {
      ok: true,
      timestamp: new Date().toISOString(),
      system: {
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
      agents: {
        initialized: true,
        count: 4,
        available: 4,
      },
      tools: {
        count: 25,
        available: 25,
        categories: ['budget', 'envelope', 'transaction', 'analysis', 'handoff'],
      },
      ai: {
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        modelsAvailable: ['gpt-4o', 'gpt-4o-mini'],
      },
    };

    res.json(status);

  } catch (error) {
    logger.error({ error }, 'Failed to get AI status');
    res.status(500).json({
      ok: false,
      error: 'Failed to get system status',
      code: 'STATUS_ERROR'
    });
  }
});

// GET /api/ai/sessions/:sessionId/history - Get conversation history
router.get('/sessions/:sessionId/history', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit, offset } = req.query;

    // Mock conversation history
    const history = [
      {
        id: 1,
        sessionId,
        agentName: 'financial_advisor',
        message: 'Hello! How can I help you today?',
        response: 'I need help with my budget.',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 2,
        sessionId,
        agentName: 'budget_coach',
        message: 'I can help you create a budget plan.',
        response: 'That would be great!',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
      },
    ];

    const limitNum = parseInt(limit as string) || 20;
    const offsetNum = parseInt(offset as string) || 0;
    const paginatedHistory = history.slice(offsetNum, offsetNum + limitNum);

    res.json({
      ok: true,
      history: paginatedHistory,
      sessionId,
      totalMessages: history.length,
      hasMore: offsetNum + limitNum < history.length,
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get conversation history');
    res.status(500).json({
      ok: false,
      error: 'Failed to get conversation history',
      code: 'HISTORY_ERROR'
    });
  }
});

export default router;