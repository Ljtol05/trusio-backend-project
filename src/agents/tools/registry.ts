
import { tool } from "@openai/agents";
import { FinancialTool, ToolExecutionResult, TOOL_CATEGORIES } from "./types.js";
import { logger } from "../../lib/logger.js";

export class ToolRegistry {
  private tools: Map<string, FinancialTool> = new Map();
  private executionHistory: ToolExecutionResult[] = [];

  registerTool(financialTool: FinancialTool): void {
    try {
      // Create OpenAI Agents SDK tool with automatic schema generation
      const sdkTool = tool({
        name: financialTool.name,
        description: financialTool.description,
        parameters: financialTool.parameters,
      }, financialTool.execute);

      // Store the financial tool definition
      this.tools.set(financialTool.name, {
        ...financialTool,
        execute: sdkTool // Store the SDK-wrapped version
      });

      logger.info({ 
        toolName: financialTool.name,
        category: financialTool.category,
        riskLevel: financialTool.riskLevel
      }, "Financial tool registered successfully");

    } catch (error) {
      logger.error({ 
        toolName: financialTool.name, 
        error: error.message 
      }, "Failed to register financial tool");
      throw error;
    }
  }

  getTool(name: string): FinancialTool | null {
    return this.tools.get(name) || null;
  }

  getAllTools(): Record<string, FinancialTool> {
    const toolsMap: Record<string, FinancialTool> = {};
    this.tools.forEach((tool, name) => {
      toolsMap[name] = tool;
    });
    return toolsMap;
  }

  getToolsByCategory(category: string): FinancialTool[] {
    return Array.from(this.tools.values()).filter(
      tool => tool.category === category
    );
  }

  getToolCount(): number {
    return this.tools.size;
  }

  async executeTool(
    toolName: string, 
    params: any, 
    context: any
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const tool = this.getTool(toolName);

    if (!tool) {
      const error = `Tool '${toolName}' not found`;
      logger.error({ toolName }, error);
      
      const result: ToolExecutionResult = {
        toolName,
        success: false,
        duration: Date.now() - startTime,
        error,
        timestamp: new Date()
      };
      
      this.executionHistory.push(result);
      return result;
    }

    try {
      logger.info({ 
        toolName, 
        category: tool.category,
        riskLevel: tool.riskLevel 
      }, "Executing financial tool");

      // Execute the tool function
      const toolResult = await tool.execute(params, context);

      const result: ToolExecutionResult = {
        toolName,
        success: true,
        duration: Date.now() - startTime,
        result: toolResult,
        timestamp: new Date()
      };

      this.executionHistory.push(result);
      
      logger.info({ 
        toolName, 
        duration: result.duration,
        success: true
      }, "Tool execution completed successfully");

      return result;

    } catch (error: any) {
      const result: ToolExecutionResult = {
        toolName,
        success: false,
        duration: Date.now() - startTime,
        error: error.message || "Unknown error occurred",
        timestamp: new Date()
      };

      this.executionHistory.push(result);
      
      logger.error({ 
        toolName, 
        error: error.message,
        duration: result.duration 
      }, "Tool execution failed");

      return result;
    }
  }

  getExecutionHistory(limit?: number): ToolExecutionResult[] {
    const history = [...this.executionHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  getToolMetrics(toolName?: string): any {
    const relevantHistory = toolName 
      ? this.executionHistory.filter(h => h.toolName === toolName)
      : this.executionHistory;

    if (relevantHistory.length === 0) {
      return { totalExecutions: 0 };
    }

    const successful = relevantHistory.filter(h => h.success).length;
    const totalDuration = relevantHistory.reduce((sum, h) => sum + h.duration, 0);

    return {
      totalExecutions: relevantHistory.length,
      successfulExecutions: successful,
      successRate: ((successful / relevantHistory.length) * 100).toFixed(2) + '%',
      averageDuration: Math.round(totalDuration / relevantHistory.length),
      lastExecuted: relevantHistory[relevantHistory.length - 1]?.timestamp
    };
  }

  validateToolAccess(toolName: string, userRole: string, riskTolerance: string): boolean {
    const tool = this.getTool(toolName);
    if (!tool) return false;

    // Basic access control logic
    if (tool.riskLevel === 'high' && riskTolerance === 'low') {
      return false;
    }

    if (tool.requiresAuth && !userRole) {
      return false;
    }

    return true;
  }

  clearHistory(): void {
    this.executionHistory = [];
    logger.info("Tool execution history cleared");
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();
