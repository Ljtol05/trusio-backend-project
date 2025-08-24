
import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext, ToolResult } from './types.js';

interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresAuth?: boolean;
  estimatedDuration?: number;
  tool: any;
}

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private executionHistory: any[] = [];
  private metrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
  };

  registerTool(toolDef: ToolDefinition) {
    this.tools.set(toolDef.name, toolDef);
    logger.debug(`Registered tool: ${toolDef.name}`);
  }

  getAllTools() {
    const result: Record<string, ToolDefinition> = {};
    this.tools.forEach((tool, name) => {
      result[name] = tool;
    });
    return result;
  }

  getToolCount() {
    return this.tools.size;
  }

  async executeTool(
    toolName: string,
    parameters: any,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    
    try {
      const toolDef = this.tools.get(toolName);
      
      if (!toolDef) {
        return {
          success: false,
          error: `Tool not found: ${toolName}`,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      // Execute the tool
      const result = await toolDef.tool(parameters, context);
      
      const duration = Date.now() - startTime;
      this.updateMetrics(true, duration);
      
      this.executionHistory.push({
        toolName,
        success: true,
        duration,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        result,
        duration,
        timestamp: new Date().toISOString(),
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.updateMetrics(false, duration);
      
      this.executionHistory.push({
        toolName,
        success: false,
        error: error.message,
        duration,
        timestamp: new Date().toISOString(),
      });

      logger.error({ error, toolName, parameters }, 'Tool execution failed');
      
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private updateMetrics(success: boolean, duration: number) {
    this.metrics.totalExecutions++;
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }
    
    // Update average execution time
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + duration) / 
      this.metrics.totalExecutions;
  }

  getToolMetrics(toolName?: string) {
    if (toolName) {
      const toolHistory = this.executionHistory.filter(h => h.toolName === toolName);
      return {
        executions: toolHistory.length,
        successRate: toolHistory.filter(h => h.success).length / toolHistory.length,
        averageDuration: toolHistory.reduce((sum, h) => sum + h.duration, 0) / toolHistory.length,
      };
    }
    return this.metrics;
  }

  getExecutionHistory(limit?: number) {
    return limit ? this.executionHistory.slice(-limit) : this.executionHistory;
  }
}

export const toolRegistry = new ToolRegistry();
