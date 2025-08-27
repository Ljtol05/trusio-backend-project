import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { agentRegistry } from '../agents/agentRegistry.js';
import { agentManager } from '../agents/registry.js';
import { toolRegistry } from '../agents/tools/index.js';
import { db } from '../lib/db.js';
import type { FinancialContext } from '../agents/tools/types.js';

const router = Router();

// Request schemas for agent interactions
const AgentChatSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  agentName: z.enum(['financial_advisor', 'budget_coach', 'transaction_analyst', 'insight_generator']).optional(),
  sessionId: z.string().optional(),
  context: z.object({
    includeHistory: z.boolean().default(true),
    maxHistory: z.number().min(1).max(50).default(10),
    includeFinancialData: z.boolean().default(true),
  }).optional()
});

const ToolExecutionSchema = z.object({
  toolName: z.string().min(1, 'Tool name is required'),
  parameters: z.record(z.unknown()),
  agentContext: z.object({
    agentName: z.string().optional(),
    sessionId: z.string().optional(),
  }).optional()
});

const AgentHandoffSchema = z.object({
  fromAgent: z.string().min(1, 'Source agent is required'),
  toAgent: z.string().min(1, 'Target agent is required'),
  message: z.string().min(1, 'Message is required'),
  reason: z.string().min(1, 'Handoff reason is required'),
  context: z.record(z.unknown()).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium')
});

// Helper to build financial context for agents
async function buildFinancialContext(userId: string): Promise<FinancialContext> {
  try {
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

    // Get recent transactions
    const transactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
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

    // Calculate totals
    const totalIncome = transactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return {
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
  } catch (error) {
    logger.error({ error, userId }, 'Failed to build financial context');
    return { userId };
  }
}

// POST /api/ai/chat - Main chat endpoint for agent interactions
router.post('/chat', auth, async (req, res) => {
  try {
    const { message, agentName, sessionId, context } = AgentChatSchema.parse(req.body);
    const userId = req.user!.id;

    logger.info({ 
      userId, 
      agentName, 
      sessionId,
      messageLength: message.length 
    }, 'Processing agent chat request');

    // Build financial context
    const financialContext = await buildFinancialContext(userId);

    // Route to appropriate agent or use default routing
    const targetAgent = agentName ? 
      agentRegistry.getAgent(agentName) : 
      agentRegistry.routeToAgent(message);

    if (!targetAgent) {
      return res.status(400).json({
        ok: false,
        error: 'Agent not available',
        code: 'AGENT_UNAVAILABLE'
      });
    }

    // Get conversation history if requested
    let conversationHistory: any[] = [];
    if (context?.includeHistory && sessionId) {
      // Retrieve conversation history from database or session store
      const historyRecords = await db.conversation.findMany({
        where: { userId, sessionId },
        orderBy: { createdAt: 'desc' },
        take: context.maxHistory || 10,
        select: {
          role: true,
          content: true,
          createdAt: true,
        }
      });

      conversationHistory = historyRecords.reverse().map(h => ({
        role: h.role,
        content: h.content,
        timestamp: h.createdAt.toISOString(),
      }));
    }

    // Run the agent with the user message
    const agentResponse = await agentRegistry.runAgent(
      agentName || 'financial_advisor',
      message,
      {
        ...financialContext,
        sessionId: sessionId || `session_${Date.now()}`,
        timestamp: new Date(),
        previousInteractions: conversationHistory,
      }
    );

    // Save conversation history
    if (sessionId) {
      await db.conversation.createMany({
        data: [
          {
            userId,
            sessionId,
            role: 'user',
            content: message,
            agentName: agentName || 'financial_advisor',
          },
          {
            userId,
            sessionId,
            role: 'assistant',
            content: agentResponse,
            agentName: agentName || 'financial_advisor',
          }
        ]
      });
    }

    res.json({
      ok: true,
      response: agentResponse,
      agentName: agentName || 'financial_advisor',
      sessionId: sessionId || `session_${Date.now()}`,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Agent chat failed');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid request format',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to process chat request',
      code: 'AGENT_ERROR'
    });
  }
});

// POST /api/ai/tools/execute - Direct tool execution endpoint
router.post('/tools/execute', auth, async (req, res) => {
  try {
    const { toolName, parameters, agentContext } = ToolExecutionSchema.parse(req.body);
    const userId = req.user!.id;

    logger.info({ 
      userId, 
      toolName, 
      agentName: agentContext?.agentName 
    }, 'Executing tool directly');

    // Build execution context
    const financialContext = await buildFinancialContext(userId);
    const executionContext = {
      userId,
      sessionId: agentContext?.sessionId || `direct_${Date.now()}`,
      agentName: agentContext?.agentName || 'direct_execution',
      timestamp: new Date(),
      userProfile: {
        id: userId,
        name: req.user!.name || undefined,
        email: req.user!.email || undefined,
      },
    };

    // Execute the tool
    const result = await toolRegistry.executeTool(
      toolName,
      { ...parameters, userId },
      { ...financialContext, ...executionContext }
    );

    res.json({
      ok: true,
      toolName,
      result: result.result,
      success: result.success,
      duration: result.duration,
      timestamp: result.timestamp,
      error: result.error,
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Tool execution failed');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid tool execution request',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to execute tool',
      code: 'TOOL_EXECUTION_ERROR'
    });
  }
});

// POST /api/ai/handoff - Agent handoff endpoint
router.post('/handoff', auth, async (req, res) => {
  try {
    const { fromAgent, toAgent, message, reason, context, priority } = AgentHandoffSchema.parse(req.body);
    const userId = req.user!.id;

    logger.info({ 
      userId, 
      fromAgent, 
      toAgent, 
      reason,
      priority 
    }, 'Processing agent handoff via comprehensive HandoffManager');

    // Build financial context
    const financialContext = await buildFinancialContext(userId);

    // Execute comprehensive handoff using HandoffManager
    const { handoffManager } = await import('../agents/core/HandoffManager.js');
    
    const handoffResult = await handoffManager.executeHandoff({
      fromAgent,
      toAgent,
      userId,
      sessionId: `api_handoff_${Date.now()}`,
      reason,
      priority: priority as 'low' | 'medium' | 'high' | 'urgent',
      context: {
        ...financialContext,
        ...context,
      },
      userMessage: message,
      preserveHistory: true,
      escalationLevel: 0,
      metadata: {
        source: 'api_endpoint',
        requestTimestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
      }
    });

    if (!handoffResult.success) {
      return res.status(500).json({
        ok: false,
        error: 'Handoff failed',
        details: handoffResult.error,
        code: 'HANDOFF_ERROR',
        handoffId: handoffResult.handoffId,
        duration: handoffResult.duration,
      });
    }

    res.json({
      ok: true,
      handoffCompleted: true,
      handoffId: handoffResult.handoffId,
      fromAgent: handoffResult.fromAgent,
      toAgent: handoffResult.toAgent,
      response: handoffResult.response,
      handoffReason: reason,
      contextPreserved: handoffResult.contextPreserved,
      escalationTriggered: handoffResult.escalationTriggered,
      duration: handoffResult.duration,
      timestamp: new Date().toISOString(),
      metadata: {
        priority,
        sessionId: `api_handoff_${Date.now()}`,
        preservedContext: handoffResult.contextPreserved,
      }
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Agent handoff failed');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid handoff request',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to process handoff',
      code: 'HANDOFF_ERROR'
    });
  }
});

// GET /api/ai/agents - List available agents and their capabilities
router.get('/agents', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info({ userId }, 'Fetching available agents');

    const agentMetrics = agentRegistry.getAgentMetrics();
    const agentNames = Array.from(agentRegistry.getAgentNames());

    const agents = agentNames.map(name => ({
      name,
      displayName: name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      capabilities: agentRegistry.getAgentCapabilities(name),
      isAvailable: agentMetrics[name]?.isAvailable || false,
      toolCount: agentMetrics[name]?.toolCount || 0,
    }));

    res.json({
      ok: true,
      agents,
      totalAgents: agents.length,
      defaultAgent: 'financial_advisor',
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to fetch agents');

    res.status(500).json({
      ok: false,
      error: 'Failed to fetch available agents',
      code: 'AGENT_FETCH_ERROR'
    });
  }
});

// GET /api/ai/tools - List available tools
router.get('/tools', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { category } = req.query;

    logger.info({ userId, category }, 'Fetching available tools');

    const allTools = toolRegistry.getAllTools();
    const toolMetrics = toolRegistry.getToolMetrics();

    let tools = Object.entries(allTools).map(([name, tool]) => ({
      name,
      description: tool.description || 'No description available',
      category: tool.category,
      riskLevel: tool.riskLevel || 'low',
      requiresAuth: tool.requiresAuth || false,
      estimatedDuration: tool.estimatedDuration || 1000,
      metrics: toolRegistry.getToolMetrics(name),
    }));

    // Filter by category if specified
    if (category && typeof category === 'string') {
      tools = tools.filter(tool => tool.category === category);
    }

    const categories = [...new Set(tools.map(t => t.category))];

    res.json({
      ok: true,
      tools,
      categories,
      totalTools: tools.length,
      overallMetrics: toolMetrics,
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to fetch tools');

    res.status(500).json({
      ok: false,
      error: 'Failed to fetch available tools',
      code: 'TOOL_FETCH_ERROR'
    });
  }
});

// GET /api/ai/sessions/:sessionId/history - Get conversation history
router.get('/sessions/:sessionId/history', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user!.id;
    const { limit = '20', offset = '0' } = req.query;

    logger.info({ userId, sessionId }, 'Fetching conversation history');

    const history = await db.conversation.findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
      select: {
        id: true,
        role: true,
        content: true,
        agentName: true,
        createdAt: true,
      }
    });

    const totalCount = await db.conversation.count({
      where: { userId, sessionId }
    });

    res.json({
      ok: true,
      history: history.reverse(), // Return in chronological order
      pagination: {
        total: totalCount,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: totalCount > parseInt(offset as string) + parseInt(limit as string)
      },
      sessionId,
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to fetch conversation history');

    res.status(500).json({
      ok: false,
      error: 'Failed to fetch conversation history',
      code: 'HISTORY_FETCH_ERROR'
    });
  }
});

// POST /api/ai/memory/store - Store user preference or learning
router.post('/memory/store', auth, async (req, res) => {
  try {
    const { type, key, value, category, confidence } = req.body;
    const userId = req.user!.id;

    if (!type || !key || value === undefined) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required fields: type, key, value',
        code: 'MISSING_FIELDS'
      });
    }

    const financialContext = await buildFinancialContext(userId);

    if (type === 'preference') {
      const result = await toolRegistry.executeTool(
        'store_user_preference',
        {
          userId,
          preferenceKey: key,
          preferenceValue: value,
          category: category || 'general',
          confidence: confidence || 0.8,
        },
        financialContext
      );

      res.json({
        ok: true,
        stored: result.success,
        type: 'preference',
        key,
        value,
        timestamp: new Date().toISOString(),
      });
    } else if (type === 'insight') {
      const result = await toolRegistry.executeTool(
        'store_insight',
        {
          userId,
          insight: value,
          category: category || 'general',
          confidence: confidence || 0.8,
        },
        financialContext
      );

      res.json({
        ok: true,
        stored: result.success,
        type: 'insight',
        category: category || 'general',
        timestamp: new Date().toISOString(),
      });
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Invalid type. Must be "preference" or "insight"',
        code: 'INVALID_TYPE'
      });
    }

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to store memory');

    res.status(500).json({
      ok: false,
      error: 'Failed to store memory',
      code: 'MEMORY_STORE_ERROR'
    });
  }
});



// GET /api/ai/handoff/history/:userId - Get user handoff history
router.get('/handoff/history/:userId?', auth, async (req, res) => {
  try {
    const targetUserId = req.params.userId || req.user!.id;
    const { limit = '20' } = req.query;

    // Security check - users can only access their own history unless admin
    if (targetUserId !== req.user!.id) {
      // Add admin check here if needed
      return res.status(403).json({
        ok: false,
        error: 'Access denied to handoff history',
        code: 'ACCESS_DENIED'
      });
    }

    const { handoffManager } = await import('../agents/core/HandoffManager.js');
    const history = handoffManager.getHandoffHistory(targetUserId, parseInt(limit as string));

    logger.info({
      userId: targetUserId,
      historyLength: history.length,
      requestedBy: req.user!.id
    }, 'Handoff history retrieved');

    res.json({
      ok: true,
      userId: targetUserId,
      history,
      totalCount: history.length,
      limit: parseInt(limit as string),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get handoff history');

    res.status(500).json({
      ok: false,
      error: 'Failed to retrieve handoff history',
      code: 'HISTORY_ERROR'
    });
  }
});

// GET /api/ai/handoff/statistics - Get handoff system statistics
router.get('/handoff/statistics', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { global = 'false' } = req.query;

    const { handoffManager } = await import('../agents/core/HandoffManager.js');
    
    // Get user-specific or global statistics
    const statistics = handoffManager.getHandoffStatistics(
      global === 'true' ? undefined : userId
    );

    logger.info({
      userId,
      global: global === 'true',
      totalHandoffs: statistics.totalHandoffs
    }, 'Handoff statistics retrieved');

    res.json({
      ok: true,
      scope: global === 'true' ? 'global' : 'user',
      userId: global === 'true' ? undefined : userId,
      statistics,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get handoff statistics');

    res.status(500).json({
      ok: false,
      error: 'Failed to retrieve handoff statistics',
      code: 'STATISTICS_ERROR'
    });
  }
});

// GET /api/ai/handoff/active - Get currently active handoffs
router.get('/handoff/active', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const { handoffManager } = await import('../agents/core/HandoffManager.js');
    const activeHandoffs = handoffManager.getActiveHandoffs().filter(
      handoff => handoff.userId === userId
    );

    logger.info({
      userId,
      activeCount: activeHandoffs.length
    }, 'Active handoffs retrieved');

    res.json({
      ok: true,
      userId,
      activeHandoffs,
      count: activeHandoffs.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get active handoffs');

    res.status(500).json({
      ok: false,
      error: 'Failed to retrieve active handoffs',
      code: 'ACTIVE_HANDOFFS_ERROR'
    });
  }
});

// POST /api/ai/handoff/auto-route - Intelligent auto-routing endpoint
router.post('/handoff/auto-route', auth, async (req, res) => {
  try {
    const { message, currentAgent = 'financial_advisor', sessionId } = req.body;
    const userId = req.user!.id;

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: 'Message is required for auto-routing',
        code: 'MISSING_MESSAGE'
      });
    }

    logger.info({
      userId,
      currentAgent,
      messageLength: message.length
    }, 'Processing auto-route request');

    // Build financial context
    const financialContext = await buildFinancialContext(userId);

    // Use HandoffManager for intelligent routing
    const { handoffManager } = await import('../agents/core/HandoffManager.js');
    const routingDecision = await handoffManager.routeToOptimalAgent(
      currentAgent,
      message,
      financialContext,
      sessionId || `auto_route_${Date.now()}`
    );

    // If routing suggests a different agent, provide handoff recommendation
    if (routingDecision.targetAgent !== currentAgent) {
      res.json({
        ok: true,
        routingRecommended: true,
        currentAgent,
        recommendedAgent: routingDecision.targetAgent,
        reason: routingDecision.reason,
        confidence: routingDecision.confidence,
        autoExecute: routingDecision.confidence > 0.8,
        message: `Recommended handoff: ${currentAgent} → ${routingDecision.targetAgent}`,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.json({
        ok: true,
        routingRecommended: false,
        currentAgent,
        recommendedAgent: currentAgent,
        reason: routingDecision.reason,
        confidence: routingDecision.confidence,
        message: 'Continue with current agent',
        timestamp: new Date().toISOString(),
      });
    }

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Auto-routing failed');

    res.status(500).json({
      ok: false,
      error: 'Failed to process auto-routing',
      code: 'AUTO_ROUTE_ERROR'
    });
  }
});

// GET /api/ai/handoff/health - Handoff system health check
router.get('/handoff/health', auth, async (req, res) => {
  try {
    const { handoffManager } = await import('../agents/core/HandoffManager.js');
    const healthStatus = handoffManager.getHealthStatus();

    logger.info({
      userId: req.user!.id,
      isHealthy: healthStatus.isHealthy,
      activeHandoffs: healthStatus.activeHandoffs,
      issues: healthStatus.issues.length
    }, 'Handoff system health checked');

    res.json({
      ok: true,
      health: healthStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to check handoff health');

    res.status(500).json({
      ok: false,
      error: 'Failed to check handoff system health',
      code: 'HEALTH_CHECK_ERROR'
    });
  }
});

// GET /api/ai/memory/profile - Get user memory profile
router.get('/memory/profile', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { includeHistory = 'false' } = req.query;

    const financialContext = await buildFinancialContext(userId);

    const result = await toolRegistry.executeTool(
      'get_user_memory_profile',
      {
        userId,
        includeHistory: includeHistory === 'true',
      },
      financialContext
    );

    res.json({
      ok: true,
      profile: result.result.profile,
      interactionHistory: result.result.interactionHistory,
      isNewUser: result.result.isNewUser || false,
      lastInteraction: result.result.lastInteraction,
      currentFocus: result.result.currentFocus,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get memory profile');

    res.status(500).json({
      ok: false,
      error: 'Failed to retrieve memory profile',
      code: 'MEMORY_PROFILE_ERROR'
    });
  }
});

// GET /api/ai/goals/tracking - Get goal tracking data
router.get('/goals/tracking', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { goalId, recommendations = 'true' } = req.query;

    const financialContext = await buildFinancialContext(userId);

    const result = await toolRegistry.executeTool(
      'track_goal_progress',
      {
        userId,
        goalId: goalId as string,
        generateRecommendations: recommendations === 'true',
      },
      financialContext
    );

    res.json({
      ok: true,
      goalCount: result.result.goalCount || 0,
      tracking: result.result.tracking || [],
      summary: result.result.summary || {},
      recommendations: result.result.recommendations || [],
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get goal tracking');

    res.status(500).json({
      ok: false,
      error: 'Failed to retrieve goal tracking data',
      code: 'GOAL_TRACKING_ERROR'
    });
  }
});

// GET /api/ai/recommendations - Get contextual recommendations
router.get('/recommendations', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { focus = 'general', limit = '5' } = req.query;

    const financialContext = await buildFinancialContext(userId);

    const result = await toolRegistry.executeTool(
      'get_contextual_recommendations',
      {
        userId,
        focus: focus as string,
        limit: parseInt(limit as string),
      },
      financialContext
    );

    res.json({
      ok: true,
      recommendations: result.result.recommendations || [],
      userFocus: result.result.userFocus,
      preferences: result.result.preferences || {},
      isNewUser: result.result.isNewUser || false,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get recommendations');

    res.status(500).json({
      ok: false,
      error: 'Failed to generate recommendations',
      code: 'RECOMMENDATIONS_ERROR'
    });
  }
});

// GET /api/ai/status - System status and health check
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info({ userId }, 'Checking AI system status');

    // Check agent registry status
    const agentStatus = {
      initialized: agentRegistry.isInitialized(),
      agentCount: agentRegistry.getAllAgents().length,
      availableAgents: Array.from(agentRegistry.getAgentNames()),
    };

    // Check tool registry status
    const toolStatus = {
      toolCount: toolRegistry.getToolCount(),
      recentExecutions: toolRegistry.getExecutionHistory(5),
      overallMetrics: toolRegistry.getToolMetrics(),
    };

    // Check agent manager status
    const managerStatus = {
      initialized: agentManager.isInitialized(),
      registryReady: agentManager.isRegistryReady(),
    };

    res.json({
      ok: true,
      status: 'operational',
      agents: agentStatus,
      tools: toolStatus,
      manager: managerStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get AI system status');

    res.status(500).json({
      ok: false,
      error: 'Failed to check system status',
      code: 'STATUS_CHECK_ERROR'
    });
  }
});

export default router;