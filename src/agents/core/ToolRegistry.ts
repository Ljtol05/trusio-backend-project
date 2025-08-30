
import { logger } from '../../lib/logger.js';

export interface ToolMetrics {
  executionCount: number;
  averageExecutionTime: number;
  successRate: number;
  totalErrors: number;
  lastExecution?: Date;
}

export interface Tool {
  name: string;
  description?: string;
  category?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresAuth?: boolean;
  estimatedDuration?: number;
  schema?: any;
  execute: (parameters: any, context: any) => Promise<any>;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  timestamp: Date;
  duration: number;
}

export interface ToolExecutionContext {
  userId: string;
  sessionId?: string;
  agentName?: string;
  timestamp?: Date;
  userProfile?: {
    id: string;
    name?: string;
    email?: string;
  };
  timeout?: number;
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private metrics: Map<string, ToolMetrics> = new Map();
  private executionHistory: Array<{
    toolName: string;
    timestamp: Date;
    duration: number;
    success: boolean;
    error?: string;
  }> = [];

  constructor() {
    logger.info('Initializing ToolRegistry');
  }

  registerTool(toolDefinition: any): void {
    // Handle OpenAI SDK tool format - the tool() function returns an object with metadata
    const toolName = toolDefinition.name || toolDefinition.toolName;
    const tool: Tool = {
      name: toolName,
      description: toolDefinition.description || toolDefinition.toolDescription || 'No description available',
      category: toolDefinition.category || 'general',
      riskLevel: toolDefinition.riskLevel || 'low',
      requiresAuth: toolDefinition.requiresAuth || false,
      estimatedDuration: toolDefinition.estimatedDuration || 1000,
      schema: toolDefinition.parameters || toolDefinition.schema,
      execute: toolDefinition.execute || toolDefinition.tool || toolDefinition,
    };

    if (!tool.name) {
      logger.error({ tool }, 'Tool name is required for registration');
      throw new Error('Tool name is required for registration');
    }

    if (this.tools.has(tool.name)) {
      logger.warn({ toolName: tool.name }, 'Tool already registered - overwriting');
    }

    this.tools.set(toolDefinition.name, tool);

    // Initialize metrics for the tool
    if (!this.metrics.has(toolDefinition.name)) {
      this.metrics.set(toolDefinition.name, {
        executionCount: 0,
        averageExecutionTime: 0,
        successRate: 100,
        totalErrors: 0,
      });
    }

    logger.debug({ 
      toolName: tool.name, 
      category: tool.category, 
      requiresAuth: tool.requiresAuth,
      riskLevel: tool.riskLevel 
    }, 'Tool registered successfully');
  }

  unregisterTool(name: string): boolean {
    const removed = this.tools.delete(name);
    if (removed) {
      this.metrics.delete(name);
      logger.info({ toolName: name }, 'Tool unregistered');
    }
    return removed;
  }

  clear(): void {
    this.tools.clear();
    this.metrics.clear();
    this.executionHistory = [];
    logger.info('Tool registry cleared');
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Record<string, Tool> {
    const result: Record<string, Tool> = {};
    this.tools.forEach((tool, name) => {
      result[name] = tool;
    });
    return result;
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getToolCount(): number {
    return this.tools.size;
  }

  async executeTool(
    name: string,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      if (!this.tools.has(name)) {
        logger.warn({ toolName: name, availableTools: Array.from(this.tools.keys()) }, 'Tool not found');
        throw new Error(`Tool not found: ${name}`);
      }

      const tool = this.tools.get(name)!;

      // Validate parameters if schema is provided
      if (tool.schema) {
        try {
          tool.schema.parse(parameters);
        } catch (validationError: any) {
          const error = `Validation failed: ${validationError.message}`;
          this.recordExecution(name, Date.now() - startTime, false, error);
          return {
            success: false,
            error,
            timestamp: new Date(),
            duration: Date.now() - startTime,
          };
        }
      }

      // Check authentication
      if (tool.requiresAuth && !context.userId) {
        throw new Error('Authentication required for this tool');
      }

      // Execute the tool with optional timeout
      let result;
      if (context.timeout) {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool execution timeout')), context.timeout)
        );
        result = await Promise.race([
          tool.execute(parameters, context),
          timeoutPromise
        ]);
      } else {
        result = await tool.execute(parameters, context);
      }
      const duration = Date.now() - startTime;

      // Record successful execution
      this.recordExecution(name, duration, true);

      logger.info({ toolName: name, duration }, 'Tool executed successfully');

      return {
        success: true,
        result,
        timestamp: new Date(),
        duration,
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error occurred';

      this.recordExecution(name, duration, false, errorMessage);

      logger.error({ toolName: name, error, duration }, 'Tool execution failed');

      return {
        success: false,
        error: errorMessage,
        timestamp: new Date(),
        duration,
      };
    }
  }

  private recordExecution(
    toolName: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    // Add to execution history
    this.executionHistory.push({
      toolName,
      timestamp: new Date(),
      duration,
      success,
      error,
    });

    // Keep only last 100 executions
    if (this.executionHistory.length > 100) {
      this.executionHistory = this.executionHistory.slice(-100);
    }

    // Update metrics
    const metrics = this.metrics.get(toolName);
    if (metrics) {
      metrics.executionCount++;
      metrics.lastExecution = new Date();

      // Update average execution time
      const totalTime = metrics.averageExecutionTime * (metrics.executionCount - 1) + duration;
      metrics.averageExecutionTime = totalTime / metrics.executionCount;

      // Update success rate
      if (!success) {
        metrics.totalErrors++;
      }
      metrics.successRate = ((metrics.executionCount - metrics.totalErrors) / metrics.executionCount) * 100;

      this.metrics.set(toolName, metrics);
    }
  }

  getToolMetrics(toolName?: string): ToolMetrics | Record<string, ToolMetrics> {
    if (toolName) {
      return this.metrics.get(toolName) || {
        executionCount: 0,
        averageExecutionTime: 0,
        successRate: 100,
        totalErrors: 0,
      };
    }

    const result: Record<string, ToolMetrics> = {};
    this.metrics.forEach((metrics, name) => {
      result[name] = metrics;
    });
    return result;
  }

  getExecutionHistory(limit: number = 10): Array<{
    toolName: string;
    timestamp: Date;
    duration: number;
    success: boolean;
    error?: string;
  }> {
    return this.executionHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Health check method
  isHealthy(): boolean {
    if (this.tools.size === 0) {
      return false;
    }

    // Check if any tools have consistently low success rates
    const recentMetrics = Array.from(this.metrics.values());
    const unhealthyTools = recentMetrics.filter(m => 
      m.executionCount >= 5 && m.successRate < 80
    );

    return unhealthyTools.length === 0;
  }

  // Get registry statistics
  getStatistics(): {
    totalTools: number;
    totalExecutions: number;
    overallSuccessRate: number;
    averageExecutionTime: number;
    healthyTools: number;
  } {
    const totalExecutions = Array.from(this.metrics.values())
      .reduce((sum, m) => sum + m.executionCount, 0);

    const totalErrors = Array.from(this.metrics.values())
      .reduce((sum, m) => sum + m.totalErrors, 0);

    const overallSuccessRate = totalExecutions > 0 
      ? ((totalExecutions - totalErrors) / totalExecutions) * 100 
      : 100;

    const averageExecutionTime = Array.from(this.metrics.values())
      .reduce((sum, m) => sum + m.averageExecutionTime, 0) / this.metrics.size || 0;

    const healthyTools = Array.from(this.metrics.values())
      .filter(m => m.executionCount === 0 || m.successRate >= 80).length;

    return {
      totalTools: this.tools.size,
      totalExecutions,
      overallSuccessRate,
      averageExecutionTime,
      healthyTools,
    };
  }
}

// Create and export the singleton instance
export const toolRegistry = new ToolRegistry();
