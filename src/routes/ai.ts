
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { agentRegistry } from '../agents/agentRegistry.js';
import { agentManager } from '../agents/registry.js';
import { toolRegistry } from '../agents/tools/registry.js';
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
    }, 'Processing agent handoff');

    // Verify both agents exist
    const sourceAgent = agentRegistry.getAgent(fromAgent);
    const targetAgent = agentRegistry.getAgent(toAgent);

    if (!sourceAgent || !targetAgent) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid agent names for handoff',
        code: 'INVALID_AGENTS'
      });
    }

    // Build financial context
    const financialContext = await buildFinancialContext(userId);

    // Execute handoff using the handoff tool
    const handoffResult = await toolRegistry.executeTool(
      'agent_handoff',
      {
        fromAgent,
        toAgent,
        reason,
        context: context || {},
        priority,
        userMessage: message,
      },
      {
        ...financialContext,
        userId,
        sessionId: `handoff_${Date.now()}`,
        agentName: fromAgent,
        timestamp: new Date(),
      }
    );

    if (!handoffResult.success) {
      return res.status(500).json({
        ok: false,
        error: 'Handoff failed',
        details: handoffResult.error,
        code: 'HANDOFF_ERROR'
      });
    }

    // Run the target agent with the handoff message
    const agentResponse = await agentRegistry.runAgent(
      toAgent,
      message,
      {
        ...financialContext,
        sessionId: `handoff_${Date.now()}`,
        timestamp: new Date(),
        previousInteractions: [{
          role: 'system',
          content: `Handoff from ${fromAgent}: ${reason}`,
          timestamp: new Date().toISOString(),
        }],
      }
    );

    res.json({
      ok: true,
      handoffCompleted: true,
      fromAgent,
      toAgent,
      response: agentResponse,
      handoffReason: reason,
      timestamp: new Date().toISOString(),
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
