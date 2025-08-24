
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { agentManager } from './registry.js';
import { agentRegistry } from './agentRegistry.js';
import { toolRegistry } from './tools/registry.js';
import type { FinancialContext, AgentExecutionResult } from './types.js';

// Enhanced request context schema
export const AgentRequestContextSchema = z.object({
  requestId: z.string(),
  userId: z.string(),
  sessionId: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  timestamp: z.date(),
  endpoint: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
});

export type AgentRequestContext = z.infer<typeof AgentRequestContextSchema>;

// Agent middleware for request preprocessing
export const agentPreprocessor = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Add request context for agent operations
    const requestContext: AgentRequestContext = {
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: req.user?.id || 'anonymous',
      sessionId: req.headers['x-session-id'] as string || undefined,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection.remoteAddress,
      timestamp: new Date(),
      endpoint: req.originalUrl,
      method: req.method as any,
    };

    // Attach context to request for downstream use
    (req as any).agentContext = requestContext;

    logger.debug({
      requestId: requestContext.requestId,
      userId: requestContext.userId,
      endpoint: requestContext.endpoint,
      method: requestContext.method
    }, 'Agent request preprocessing');

    next();
  } catch (error) {
    logger.error({ error, url: req.originalUrl }, 'Agent preprocessing failed');
    next(error);
  }
};

// Agent response formatter middleware
export const agentResponseFormatter = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const originalJson = res.json;
  const requestContext = (req as any).agentContext as AgentRequestContext;

  res.json = function(body: any) {
    // Enhance response with agent context if applicable
    if (body && typeof body === 'object' && !body.meta) {
      body.meta = {
        requestId: requestContext?.requestId,
        timestamp: new Date().toISOString(),
        processingTime: requestContext ? Date.now() - requestContext.timestamp.getTime() : undefined,
      };
    }

    return originalJson.call(this, body);
  };

  next();
};

// Agent error handler middleware
export const agentErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestContext = (req as any).agentContext as AgentRequestContext;
  
  logger.error({
    error: error.message,
    stack: error.stack,
    requestId: requestContext?.requestId,
    userId: requestContext?.userId,
    endpoint: requestContext?.endpoint,
  }, 'Agent operation error');

  // Handle specific agent errors
  if (error.name === 'AgentExecutionError') {
    return res.status(500).json({
      ok: false,
      error: 'Agent execution failed',
      message: 'Our AI assistant encountered an issue processing your request',
      code: 'AGENT_EXECUTION_ERROR',
      requestId: requestContext?.requestId,
    });
  }

  if (error.name === 'AgentTimeoutError') {
    return res.status(408).json({
      ok: false,
      error: 'Agent operation timeout',
      message: 'The request took too long to process',
      code: 'AGENT_TIMEOUT',
      requestId: requestContext?.requestId,
    });
  }

  if (error.name === 'AgentNotFoundError') {
    return res.status(404).json({
      ok: false,
      error: 'Agent not available',
      message: 'The requested AI assistant is not currently available',
      code: 'AGENT_NOT_FOUND',
      requestId: requestContext?.requestId,
    });
  }

  // Pass to default error handler
  next(error);
};

// Agent system health checker
export const agentHealthCheck = async (req: Request, res: Response) => {
  try {
    const requestContext = (req as any).agentContext as AgentRequestContext;
    
    logger.info({
      requestId: requestContext.requestId,
      userId: requestContext.userId
    }, 'Performing agent system health check');

    // Check agent manager initialization
    const managerStatus = agentManager.isInitialized();
    
    // Check agent registry
    const registryStatus = agentRegistry.isInitialized();
    const agentCount = agentRegistry.getAllAgents().length;
    const availableAgents = Array.from(agentRegistry.getAgentNames());
    
    // Check tool registry
    const toolCount = toolRegistry.getToolCount();
    const toolMetrics = toolRegistry.getToolMetrics();
    
    // Check OpenAI configuration
    const { isAIEnabled } = await import('../lib/openai.js');
    const openaiStatus = isAIEnabled();

    const systemStatus = {
      ok: managerStatus && registryStatus && agentCount > 0 && toolCount > 0,
      timestamp: new Date().toISOString(),
      components: {
        agentManager: {
          status: managerStatus ? 'healthy' : 'unhealthy',
          initialized: managerStatus,
        },
        agentRegistry: {
          status: registryStatus ? 'healthy' : 'unhealthy',
          initialized: registryStatus,
          agentCount,
          availableAgents,
        },
        toolRegistry: {
          status: toolCount > 0 ? 'healthy' : 'unhealthy',
          toolCount,
          executionMetrics: toolMetrics,
        },
        openaiIntegration: {
          status: openaiStatus ? 'healthy' : 'unhealthy',
          configured: openaiStatus,
        },
      },
      requestId: requestContext.requestId,
    };

    const statusCode = systemStatus.ok ? 200 : 503;
    
    res.status(statusCode).json(systemStatus);
  } catch (error) {
    logger.error({ error }, 'Agent health check failed');
    
    res.status(500).json({
      ok: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
      requestId: (req as any).agentContext?.requestId,
    });
  }
};

// Agent wrapper utility for existing endpoints
export const withAgentSupport = (
  agentName?: string,
  options: {
    requireAuth?: boolean;
    includeFinancialContext?: boolean;
    timeout?: number;
  } = {}
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestContext = (req as any).agentContext as AgentRequestContext;
      
      // Skip if not an agent request
      const isAgentRequest = req.headers['x-agent-enabled'] === 'true' || 
                           req.query.agent === 'true' ||
                           agentName;

      if (!isAgentRequest) {
        return next();
      }

      // Validate authentication if required
      if (options.requireAuth && !req.user) {
        return res.status(401).json({
          ok: false,
          error: 'Authentication required for agent operations',
          code: 'AUTH_REQUIRED',
          requestId: requestContext.requestId,
        });
      }

      // Ensure agent system is ready
      if (!agentManager.isInitialized()) {
        return res.status(503).json({
          ok: false,
          error: 'Agent system not available',
          code: 'AGENT_SYSTEM_UNAVAILABLE',
          requestId: requestContext.requestId,
        });
      }

      // Build financial context if needed
      let financialContext: Partial<FinancialContext> = {};
      if (options.includeFinancialContext && req.user) {
        try {
          const { buildFinancialContext } = await import('../routes/ai.js');
          // We'll need to extract this function or recreate it here
          financialContext = { userId: req.user.id };
        } catch (error) {
          logger.warn({ error, userId: req.user.id }, 'Failed to build financial context');
        }
      }

      // Attach agent utilities to request
      (req as any).agentUtils = {
        executeAgent: async (name: string, message: string, context?: any) => {
          return agentManager.processUserMessage(
            req.user!.id,
            message,
            {
              agentName: name,
              sessionId: requestContext.sessionId,
              context: { ...financialContext, ...context },
            }
          );
        },
        executeTool: async (toolName: string, parameters: any) => {
          return agentManager.executeDirectTool(
            req.user!.id,
            toolName,
            parameters,
            financialContext
          );
        },
        getSystemStatus: () => agentManager.getSystemStatus(),
      };

      logger.debug({
        requestId: requestContext.requestId,
        userId: requestContext.userId,
        agentName,
        includeFinancialContext: options.includeFinancialContext
      }, 'Agent support enabled for request');

      next();
    } catch (error) {
      logger.error({
        error,
        agentName,
        userId: req.user?.id
      }, 'Agent support middleware failed');
      
      next(error);
    }
  };
};

// Response transformation utilities
export const transformAgentResponse = (
  result: AgentExecutionResult,
  format: 'standard' | 'chat' | 'action' = 'standard'
) => {
  const baseResponse = {
    ok: result.success,
    timestamp: result.timestamp.toISOString(),
    duration: result.duration,
    sessionId: result.sessionId,
    agentName: result.agentName,
  };

  switch (format) {
    case 'chat':
      return {
        ...baseResponse,
        message: result.response,
        role: 'assistant',
        metadata: result.metadata,
      };
    
    case 'action':
      return {
        ...baseResponse,
        result: result.response,
        actions: result.metadata?.suggestedActions || [],
        handoffTarget: result.metadata?.handoffTarget,
      };
    
    default:
      return {
        ...baseResponse,
        response: result.response,
        error: result.error,
        metadata: result.metadata,
      };
  }
};

// Agent request validator
export const validateAgentRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = schema.safeParse(req.body);
      
      if (!validation.success) {
        const requestContext = (req as any).agentContext as AgentRequestContext;
        
        logger.warn({
          requestId: requestContext?.requestId,
          validationErrors: validation.error.errors,
          endpoint: req.originalUrl
        }, 'Agent request validation failed');
        
        return res.status(400).json({
          ok: false,
          error: 'Invalid request format',
          details: validation.error.errors,
          code: 'VALIDATION_ERROR',
          requestId: requestContext?.requestId,
        });
      }
      
      req.body = validation.data;
      next();
    } catch (error) {
      logger.error({ error, url: req.originalUrl }, 'Request validation error');
      next(error);
    }
  };
};
