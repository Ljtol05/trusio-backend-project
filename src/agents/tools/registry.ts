import { TOOL_CATEGORIES } from "./types.js";
import { logger } from "../../lib/logger.js";

// Import all tools created with the OpenAI Agents SDK
import { budgetAnalysisTool, spendingPatternsTool, varianceCalculationTool } from './budget.js';
import { createEnvelopeTool, transferFundsTool, manageBalanceTool, optimizeCategoriesTool } from './envelope.js';
import { categorizeTransactionTool, autoAllocateTool, recognizePatternsTool, detectAnomaliesTool } from './transaction.js';
import { analyzeSpendingPatternsTool, analyzeBudgetVarianceTool, analyzeTrendsTool, analyzeGoalProgressTool } from './analysis.js';
import { generateRecommendationsTool, identifyOpportunitiesTool, detectWarningsTool, trackAchievementsTool } from './insight.js';
import { agentHandoffTool } from './handoff.js';

export class ToolRegistry {
  private tools: Map<string, any> = new Map();
  private executionHistory: any[] = [];

  constructor() {
    this.initializeAllTools();
  }

  private initializeAllTools(): void {
    try {
      // Register budget tools
      this.registerSDKTool(budgetAnalysisTool, TOOL_CATEGORIES.BUDGET);
      this.registerSDKTool(spendingPatternsTool, TOOL_CATEGORIES.BUDGET);
      this.registerSDKTool(varianceCalculationTool, TOOL_CATEGORIES.BUDGET);

      // Register envelope tools
      this.registerSDKTool(createEnvelopeTool, TOOL_CATEGORIES.ENVELOPE);
      this.registerSDKTool(transferFundsTool, TOOL_CATEGORIES.ENVELOPE);
      this.registerSDKTool(manageBalanceTool, TOOL_CATEGORIES.ENVELOPE);
      this.registerSDKTool(optimizeCategoriesTool, TOOL_CATEGORIES.ENVELOPE);

      // Register transaction tools
      this.registerSDKTool(categorizeTransactionTool, TOOL_CATEGORIES.TRANSACTION);
      this.registerSDKTool(autoAllocateTool, TOOL_CATEGORIES.TRANSACTION);
      this.registerSDKTool(recognizePatternsTool, TOOL_CATEGORIES.TRANSACTION);
      this.registerSDKTool(detectAnomaliesTool, TOOL_CATEGORIES.TRANSACTION);

      // Register analysis tools
      this.registerSDKTool(analyzeSpendingPatternsTool, TOOL_CATEGORIES.ANALYSIS);
      this.registerSDKTool(analyzeBudgetVarianceTool, TOOL_CATEGORIES.ANALYSIS);
      this.registerSDKTool(analyzeTrendsTool, TOOL_CATEGORIES.ANALYSIS);
      this.registerSDKTool(analyzeGoalProgressTool, TOOL_CATEGORIES.ANALYSIS);

      // Register insight tools
      this.registerSDKTool(generateRecommendationsTool, TOOL_CATEGORIES.INSIGHT);
      this.registerSDKTool(identifyOpportunitiesTool, TOOL_CATEGORIES.INSIGHT);
      this.registerSDKTool(detectWarningsTool, TOOL_CATEGORIES.INSIGHT);
      this.registerSDKTool(trackAchievementsTool, TOOL_CATEGORIES.INSIGHT);

      // Register handoff tool
      this.registerSDKTool(agentHandoffTool, TOOL_CATEGORIES.HANDOFF);

      logger.info({ 
        totalTools: this.tools.size,
        toolNames: Array.from(this.tools.keys())
      }, "All financial tools registered successfully");

    } catch (error) {
      logger.error({ error: error.message }, "Failed to initialize financial tools");
      throw error;
    }
  }

  private registerSDKTool(sdkTool: any, category: string): void {
    try {
      // Extract tool name from the SDK tool
      const toolName = sdkTool.name || sdkTool.toString().match(/name:\s*["']([^"']+)["']/)?.[1] || 'unknown';

      this.tools.set(toolName, {
        tool: sdkTool,
        category,
        registeredAt: new Date()
      });

      logger.debug({ 
        toolName,
        category
      }, "SDK tool registered");

    } catch (error) {
      logger.error({ 
        error: error.message 
      }, "Failed to register SDK tool");
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