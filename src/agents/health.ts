
import { logger } from '../lib/logger.js';
import { agentRegistry } from './agentRegistry.js';
import { toolRegistry } from './tools/registry.js';
import { agentManager } from './registry.js';
import type { FinancialContext } from './tools/types.js';

export interface AgentHealthMetrics {
  agentName: string;
  isOnline: boolean;
  lastResponseTime: number;
  successRate: number;
  totalRequests: number;
  errorCount: number;
  lastError?: string;
  lastHealthCheck: Date;
}

export interface SystemHealthReport {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  agents: Record<string, AgentHealthMetrics>;
  tools: {
    totalTools: number;
    availableTools: number;
    errorRate: number;
  };
  database: {
    connected: boolean;
    responseTime?: number;
  };
  openai: {
    connected: boolean;
    responseTime?: number;
  };
  timestamp: Date;
  uptime: number;
}

class AgentHealthMonitor {
  private healthMetrics: Map<string, AgentHealthMetrics> = new Map();
  private startTime = Date.now();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeHealthMonitoring();
  }

  private initializeHealthMonitoring(): void {
    // Initialize metrics for all agents
    const agentNames = Array.from(agentRegistry.getAgentNames());
    for (const agentName of agentNames) {
      this.healthMetrics.set(agentName, {
        agentName,
        isOnline: true,
        lastResponseTime: 0,
        successRate: 100,
        totalRequests: 0,
        errorCount: 0,
        lastHealthCheck: new Date(),
      });
    }

    // Start periodic health checks
    this.startPeriodicHealthChecks();
  }

  private startPeriodicHealthChecks(): void {
    // Run health checks every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.runHealthCheck().catch(error => {
        logger.error({ error }, 'Health check failed');
      });
    }, 5 * 60 * 1000);
  }

  public stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  public async runHealthCheck(): Promise<SystemHealthReport> {
    logger.info('Running system health check');

    const agentHealth = await this.checkAgentHealth();
    const toolHealth = await this.checkToolHealth();
    const databaseHealth = await this.checkDatabaseHealth();
    const openaiHealth = await this.checkOpenAIHealth();

    const overall = this.determineOverallHealth(agentHealth, toolHealth, databaseHealth, openaiHealth);

    const report: SystemHealthReport = {
      overall,
      agents: Object.fromEntries(this.healthMetrics.entries()),
      tools: toolHealth,
      database: databaseHealth,
      openai: openaiHealth,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
    };

    logger.info({ overall, uptime: report.uptime }, 'Health check completed');
    return report;
  }

  private async checkAgentHealth(): Promise<'healthy' | 'degraded' | 'unhealthy'> {
    const testContext: FinancialContext = {
      userId: 'health-check-user',
    };

    let healthyAgents = 0;
    const totalAgents = this.healthMetrics.size;

    for (const [agentName, metrics] of this.healthMetrics.entries()) {
      try {
        const startTime = performance.now();
        
        // Test agent with a simple health check message
        await agentRegistry.runAgent(agentName, 'Health check - please respond briefly', testContext);
        
        const responseTime = performance.now() - startTime;
        
        // Update metrics
        metrics.lastResponseTime = responseTime;
        metrics.totalRequests += 1;
        metrics.isOnline = true;
        metrics.lastHealthCheck = new Date();
        
        // Update success rate
        const successCount = metrics.totalRequests - metrics.errorCount;
        metrics.successRate = (successCount / metrics.totalRequests) * 100;
        
        if (metrics.successRate >= 80) {
          healthyAgents += 1;
        }

        logger.debug({
          agentName,
          responseTime,
          successRate: metrics.successRate,
        }, 'Agent health check passed');

      } catch (error) {
        metrics.errorCount += 1;
        metrics.totalRequests += 1;
        metrics.isOnline = false;
        metrics.lastError = error instanceof Error ? error.message : 'Unknown error';
        metrics.lastHealthCheck = new Date();
        
        // Update success rate
        const successCount = metrics.totalRequests - metrics.errorCount;
        metrics.successRate = (successCount / metrics.totalRequests) * 100;

        logger.warn({
          agentName,
          error: metrics.lastError,
          successRate: metrics.successRate,
        }, 'Agent health check failed');
      }
    }

    const healthyRatio = healthyAgents / totalAgents;
    
    if (healthyRatio >= 0.8) return 'healthy';
    if (healthyRatio >= 0.5) return 'degraded';
    return 'unhealthy';
  }

  private async checkToolHealth(): Promise<{
    totalTools: number;
    availableTools: number;
    errorRate: number;
  }> {
    const allTools = toolRegistry.getAllTools();
    const totalTools = Object.keys(allTools).length;
    let availableTools = 0;
    let errorCount = 0;

    const testContext: FinancialContext = {
      userId: 'health-check-user',
    };

    // Test a subset of tools (not all to avoid side effects)
    const criticalTools = ['budget_analysis', 'spending_patterns', 'agent_handoff'];
    
    for (const toolName of criticalTools) {
      if (allTools[toolName]) {
        try {
          const result = await toolRegistry.executeTool(toolName, { userId: 'health-check' }, testContext);
          if (result.success) {
            availableTools += 1;
          } else {
            errorCount += 1;
          }
        } catch (error) {
          errorCount += 1;
          logger.warn({ toolName, error }, 'Tool health check failed');
        }
      }
    }

    const errorRate = criticalTools.length > 0 ? (errorCount / criticalTools.length) * 100 : 0;

    return {
      totalTools,
      availableTools: Math.round((availableTools / criticalTools.length) * totalTools),
      errorRate,
    };
  }

  private async checkDatabaseHealth(): Promise<{
    connected: boolean;
    responseTime?: number;
  }> {
    try {
      const { db } = await import('../lib/db.js');
      const startTime = performance.now();
      
      // Simple query to test database connectivity
      await db.$queryRaw`SELECT 1 as test`;
      
      const responseTime = performance.now() - startTime;
      
      return {
        connected: true,
        responseTime,
      };
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      return {
        connected: false,
      };
    }
  }

  private async checkOpenAIHealth(): Promise<{
    connected: boolean;
    responseTime?: number;
  }> {
    try {
      const { openaiPing } = await import('../lib/openai.js');
      const startTime = performance.now();
      
      const result = await openaiPing();
      const responseTime = performance.now() - startTime;
      
      return {
        connected: result.ok,
        responseTime: result.ok ? responseTime : undefined,
      };
    } catch (error) {
      logger.error({ error }, 'OpenAI health check failed');
      return {
        connected: false,
      };
    }
  }

  private determineOverallHealth(
    agentHealth: 'healthy' | 'degraded' | 'unhealthy',
    toolHealth: { errorRate: number },
    databaseHealth: { connected: boolean },
    openaiHealth: { connected: boolean }
  ): 'healthy' | 'degraded' | 'unhealthy' {
    // If critical infrastructure is down, system is unhealthy
    if (!databaseHealth.connected) return 'unhealthy';
    
    // If OpenAI is down, system is degraded (basic functionality still works)
    if (!openaiHealth.connected) return 'degraded';
    
    // If tools have high error rate, system is degraded
    if (toolHealth.errorRate > 50) return 'degraded';
    
    // If agents are unhealthy, system is unhealthy
    if (agentHealth === 'unhealthy') return 'unhealthy';
    
    // If agents are degraded, system is degraded
    if (agentHealth === 'degraded') return 'degraded';
    
    return 'healthy';
  }

  public getAgentMetrics(agentName: string): AgentHealthMetrics | null {
    return this.healthMetrics.get(agentName) || null;
  }

  public getAllMetrics(): Map<string, AgentHealthMetrics> {
    return new Map(this.healthMetrics);
  }

  public recordAgentInteraction(agentName: string, success: boolean, responseTime: number, error?: string): void {
    const metrics = this.healthMetrics.get(agentName);
    if (!metrics) return;

    metrics.totalRequests += 1;
    metrics.lastResponseTime = responseTime;
    metrics.lastHealthCheck = new Date();

    if (!success) {
      metrics.errorCount += 1;
      metrics.lastError = error;
      metrics.isOnline = false;
    } else {
      metrics.isOnline = true;
    }

    // Update success rate
    const successCount = metrics.totalRequests - metrics.errorCount;
    metrics.successRate = (successCount / metrics.totalRequests) * 100;
  }

  public getSystemUptime(): number {
    return Date.now() - this.startTime;
  }

  public resetMetrics(agentName?: string): void {
    if (agentName) {
      const metrics = this.healthMetrics.get(agentName);
      if (metrics) {
        metrics.totalRequests = 0;
        metrics.errorCount = 0;
        metrics.successRate = 100;
        metrics.lastError = undefined;
        metrics.lastHealthCheck = new Date();
      }
    } else {
      // Reset all metrics
      for (const metrics of this.healthMetrics.values()) {
        metrics.totalRequests = 0;
        metrics.errorCount = 0;
        metrics.successRate = 100;
        metrics.lastError = undefined;
        metrics.lastHealthCheck = new Date();
      }
    }
  }
}

// Create singleton instance
export const agentHealthMonitor = new AgentHealthMonitor();

// Export health check function for API
export const getSystemHealth = (): Promise<SystemHealthReport> => {
  return agentHealthMonitor.runHealthCheck();
};

// Export agent metrics function for monitoring
export const getAgentHealth = (agentName?: string): AgentHealthMetrics | Map<string, AgentHealthMetrics> | null => {
  if (agentName) {
    return agentHealthMonitor.getAgentMetrics(agentName);
  }
  return agentHealthMonitor.getAllMetrics();
};
