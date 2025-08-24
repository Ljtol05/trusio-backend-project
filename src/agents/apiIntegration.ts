
import { Express, Request, Response } from 'express';
import { logger } from '../lib/logger.js';
import { agentManager } from './registry.js';
import { agentRegistry } from './agentRegistry.js';
import { toolRegistry } from './tools/registry.js';
import {
  agentPreprocessor,
  agentResponseFormatter,
  agentErrorHandler,
  agentHealthCheck,
  withAgentSupport,
  validateAgentRequest,
  transformAgentResponse
} from './middleware.js';
import { z } from 'zod';

// Schema for API integration configuration
const ApiIntegrationConfigSchema = z.object({
  enableMiddleware: z.boolean().default(true),
  enableHealthCheck: z.boolean().default(true),
  enableMetrics: z.boolean().default(true),
  enableCaching: z.boolean().default(false),
  timeoutMs: z.number().default(30000),
  retryAttempts: z.number().default(2),
});

export type ApiIntegrationConfig = z.infer<typeof ApiIntegrationConfigSchema>;

export class AgentApiIntegration {
  private app: Express;
  private config: ApiIntegrationConfig;
  private initialized = false;

  constructor(app: Express, config: Partial<ApiIntegrationConfig> = {}) {
    this.app = app;
    this.config = ApiIntegrationConfigSchema.parse(config);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Agent API integration already initialized');
      return;
    }

    try {
      logger.info('Initializing Agent API integration...');

      // Ensure agent system is ready
      await agentManager.initialize();
      
      if (!agentManager.isInitialized()) {
        throw new Error('Agent manager failed to initialize');
      }

      // Setup middleware
      if (this.config.enableMiddleware) {
        this.setupMiddleware();
      }

      // Setup health check endpoint
      if (this.config.enableHealthCheck) {
        this.setupHealthCheck();
      }

      // Setup metrics endpoint
      if (this.config.enableMetrics) {
        this.setupMetricsEndpoint();
      }

      // Enhance existing endpoints with agent capabilities
      this.enhanceExistingEndpoints();

      this.initialized = true;
      logger.info('Agent API integration initialized successfully');

    } catch (error) {
      logger.error({ error }, 'Failed to initialize Agent API integration');
      throw error;
    }
  }

  private setupMiddleware(): void {
    logger.info('Setting up agent middleware');

    // Add preprocessing middleware
    this.app.use('/api', agentPreprocessor);
    
    // Add response formatting middleware
    this.app.use('/api', agentResponseFormatter);
    
    // Add error handling middleware (should be last)
    this.app.use('/api', agentErrorHandler);
  }

  private setupHealthCheck(): void {
    logger.info('Setting up agent health check endpoint');
    
    this.app.get('/api/agents/health', agentHealthCheck);
  }

  private setupMetricsEndpoint(): void {
    logger.info('Setting up agent metrics endpoint');
    
    this.app.get('/api/agents/metrics', async (req: Request, res: Response) => {
      try {
        const metrics = {
          timestamp: new Date().toISOString(),
          system: agentManager.getSystemStatus(),
          agents: agentRegistry.getAgentMetrics(),
          tools: {
            count: toolRegistry.getToolCount(),
            metrics: toolRegistry.getToolMetrics(),
            recentExecutions: toolRegistry.getExecutionHistory(10),
          },
          requestId: (req as any).agentContext?.requestId,
        };

        res.json({
          ok: true,
          metrics,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get agent metrics');
        res.status(500).json({
          ok: false,
          error: 'Failed to retrieve metrics',
          requestId: (req as any).agentContext?.requestId,
        });
      }
    });
  }

  private enhanceExistingEndpoints(): void {
    logger.info('Enhancing existing endpoints with agent capabilities');

    // Enhance envelope endpoints with agent support
    this.enhanceEnvelopeEndpoints();
    
    // Enhance transaction endpoints with agent support
    this.enhanceTransactionEndpoints();
    
    // Enhance transfer endpoints with agent support
    this.enhanceTransferEndpoints();
  }

  private enhanceEnvelopeEndpoints(): void {
    // Add agent-powered envelope creation suggestions
    this.app.post('/api/envelopes/suggestions', 
      withAgentSupport('budget_coach', { 
        requireAuth: true, 
        includeFinancialContext: true 
      }),
      async (req: Request, res: Response) => {
        try {
          const { budget, goals, preferences } = req.body;
          const agentUtils = (req as any).agentUtils;

          const result = await agentUtils.executeAgent(
            'budget_coach',
            `Help me create envelope suggestions based on my budget of $${budget}. My goals are: ${goals?.join(', ') || 'general budgeting'}. My preferences: ${preferences || 'balanced approach'}.`,
            { budget, goals, preferences }
          );

          const response = transformAgentResponse(result, 'action');
          res.json(response);
        } catch (error) {
          logger.error({ error, userId: req.user?.id }, 'Envelope suggestions failed');
          res.status(500).json({
            ok: false,
            error: 'Failed to generate envelope suggestions',
            requestId: (req as any).agentContext?.requestId,
          });
        }
      }
    );

    // Add agent-powered envelope optimization
    this.app.post('/api/envelopes/:id/optimize',
      withAgentSupport('budget_coach', { 
        requireAuth: true, 
        includeFinancialContext: true 
      }),
      async (req: Request, res: Response) => {
        try {
          const { id } = req.params;
          const agentUtils = (req as any).agentUtils;

          const result = await agentUtils.executeAgent(
            'budget_coach',
            `Analyze and optimize envelope ${id}. Suggest improvements for better budgeting.`,
            { envelopeId: id }
          );

          const response = transformAgentResponse(result, 'action');
          res.json(response);
        } catch (error) {
          logger.error({ error, userId: req.user?.id }, 'Envelope optimization failed');
          res.status(500).json({
            ok: false,
            error: 'Failed to optimize envelope',
            requestId: (req as any).agentContext?.requestId,
          });
        }
      }
    );
  }

  private enhanceTransactionEndpoints(): void {
    // Add agent-powered transaction categorization
    this.app.post('/api/transactions/categorize',
      withAgentSupport('transaction_analyst', { 
        requireAuth: true, 
        includeFinancialContext: true 
      }),
      async (req: Request, res: Response) => {
        try {
          const { transactions } = req.body;
          const agentUtils = (req as any).agentUtils;

          const result = await agentUtils.executeTool(
            'categorize_transaction',
            { transactions }
          );

          res.json({
            ok: result.success,
            categorizations: result.result,
            timestamp: new Date().toISOString(),
            requestId: (req as any).agentContext?.requestId,
          });
        } catch (error) {
          logger.error({ error, userId: req.user?.id }, 'Transaction categorization failed');
          res.status(500).json({
            ok: false,
            error: 'Failed to categorize transactions',
            requestId: (req as any).agentContext?.requestId,
          });
        }
      }
    );

    // Add agent-powered spending analysis
    this.app.get('/api/transactions/analysis',
      withAgentSupport('transaction_analyst', { 
        requireAuth: true, 
        includeFinancialContext: true 
      }),
      async (req: Request, res: Response) => {
        try {
          const { period, category } = req.query;
          const agentUtils = (req as any).agentUtils;

          const result = await agentUtils.executeAgent(
            'transaction_analyst',
            `Analyze my spending patterns for ${period || 'this month'}${category ? ` in category ${category}` : ''}. Provide insights and recommendations.`,
            { period, category }
          );

          const response = transformAgentResponse(result, 'action');
          res.json(response);
        } catch (error) {
          logger.error({ error, userId: req.user?.id }, 'Spending analysis failed');
          res.status(500).json({
            ok: false,
            error: 'Failed to analyze spending',
            requestId: (req as any).agentContext?.requestId,
          });
        }
      }
    );
  }

  private enhanceTransferEndpoints(): void {
    // Add agent-powered transfer optimization
    this.app.post('/api/transfers/optimize',
      withAgentSupport('budget_coach', { 
        requireAuth: true, 
        includeFinancialContext: true 
      }),
      async (req: Request, res: Response) => {
        try {
          const { amount, fromEnvelope, toEnvelope, reason } = req.body;
          const agentUtils = (req as any).agentUtils;

          const result = await agentUtils.executeAgent(
            'budget_coach',
            `I want to transfer $${amount} from ${fromEnvelope} to ${toEnvelope}. Reason: ${reason}. Is this a good financial decision? Suggest alternatives if needed.`,
            { amount, fromEnvelope, toEnvelope, reason }
          );

          const response = transformAgentResponse(result, 'action');
          res.json(response);
        } catch (error) {
          logger.error({ error, userId: req.user?.id }, 'Transfer optimization failed');
          res.status(500).json({
            ok: false,
            error: 'Failed to optimize transfer',
            requestId: (req as any).agentContext?.requestId,
          });
        }
      }
    );
  }

  // Utility methods for API enhancement
  async addAgentEndpoint(
    path: string,
    method: 'get' | 'post' | 'put' | 'delete',
    agentName: string,
    handler: (agentUtils: any, req: Request, res: Response) => Promise<void>,
    options: {
      requireAuth?: boolean;
      includeFinancialContext?: boolean;
      validation?: z.ZodSchema;
    } = {}
  ): Promise<void> {
    const middleware = [
      withAgentSupport(agentName, {
        requireAuth: options.requireAuth,
        includeFinancialContext: options.includeFinancialContext,
      })
    ];

    if (options.validation) {
      middleware.push(validateAgentRequest(options.validation));
    }

    middleware.push(async (req: Request, res: Response) => {
      try {
        const agentUtils = (req as any).agentUtils;
        await handler(agentUtils, req, res);
      } catch (error) {
        logger.error({ error, path, method }, 'Agent endpoint handler failed');
        res.status(500).json({
          ok: false,
          error: 'Agent operation failed',
          requestId: (req as any).agentContext?.requestId,
        });
      }
    });

    this.app[method](path, ...middleware);
    
    logger.info({ path, method, agentName }, 'Added agent-powered endpoint');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getConfig(): ApiIntegrationConfig {
    return this.config;
  }
}

// Export singleton instance
export let apiIntegration: AgentApiIntegration | null = null;

export const initializeApiIntegration = async (
  app: Express,
  config?: Partial<ApiIntegrationConfig>
): Promise<AgentApiIntegration> => {
  if (apiIntegration) {
    logger.warn('API integration already exists');
    return apiIntegration;
  }

  apiIntegration = new AgentApiIntegration(app, config);
  await apiIntegration.initialize();
  
  return apiIntegration;
};
