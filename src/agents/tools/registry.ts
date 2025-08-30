import { logger } from '../../lib/logger.ts';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult, FinancialContext } from './types.ts';

// Import all tool implementations
import { budgetAnalysisTool } from './budget.ts';
import { createEnvelopeTool, updateEnvelopeTool } from './envelope.ts';
import { categorizeTransactionTool, spendingPatternsTool } from './transaction-tools.ts';
import { transferFundsTool } from './transfer_funds.ts';
import { trackAchievementsTool } from './track_achievements.ts';
import { identifyOpportunitiesTool } from './identify_opportunities.ts';
import { generateInsightTool } from './insight.ts';
import { memoryStoreTool, memoryRetrieveTool } from './memory.ts';
import { agentHandoffTool, agentCapabilityCheckTool } from './handoff.ts';
import { analyzeSpendingTool, generateReportTool } from './analysis.ts';

class ToolRegistry {
  private tools = new Map<string, any>();
  private toolCategories = new Map<string, string>();
  private toolMetrics = new Map<string, { calls: number; errors: number; totalDuration: number }>();

  constructor() {
    this.registerAllTools();
  }

  private registerAllTools(): void {
    // Budget tools
    this.registerTool('budget_analysis', budgetAnalysisTool, 'budget');
    this.registerTool('create_envelope', createEnvelopeTool, 'budget');
    this.registerTool('update_envelope', updateEnvelopeTool, 'budget');

    // Transaction tools
    this.registerTool('categorize_transaction', categorizeTransactionTool, 'transaction');
    this.registerTool('spending_patterns', spendingPatternsTool, 'transaction');

    // Transfer tools
    this.registerTool('transfer_funds', transferFundsTool, 'transfer');

    // Achievement tools
    this.registerTool('track_achievements', trackAchievementsTool, 'goal');

    // Opportunity tools
    this.registerTool('identify_opportunities', identifyOpportunitiesTool, 'insight');

    // Insight tools
    this.registerTool('generate_insight', generateInsightTool, 'insight');

    // Memory tools
    this.registerTool('memory_store', memoryStoreTool, 'memory');
    this.registerTool('memory_retrieve', memoryRetrieveTool, 'memory');

    // Handoff tools
    this.registerTool('agent_handoff', agentHandoffTool, 'handoff');
    this.registerTool('check_agent_capabilities', agentCapabilityCheckTool, 'handoff');

    // Analysis tools
    this.registerTool('analyze_spending', analyzeSpendingTool, 'analysis');
    this.registerTool('generate_report', generateReportTool, 'analysis');

    logger.info({ totalTools: this.tools.size }, 'All tools registered successfully');
  }

  private registerTool(name: string, toolDefinition: any, category: string): void {
    try {
      this.tools.set(name, toolDefinition);
      this.toolCategories.set(name, category);
      this.toolMetrics.set(name, { calls: 0, errors: 0, totalDuration: 0 });

      logger.debug({ toolName: name, category }, 'Tool registered');
    } catch (error) {
      logger.error({ error, toolName: name }, 'Failed to register tool');
      throw error;
    }
  }

  async executeTool(
    toolName: string,
    parameters: any,
    context: FinancialContext
  ): Promise<ToolExecutionResult> {
    const startTime = performance.now();
    const timestamp = new Date();

    try {
      logger.info({ toolName, userId: context.userId }, 'Executing tool');

      const tool = this.tools.get(toolName);
      if (!tool) {
        return {
          success: false,
          error: `Tool not found: ${toolName}`,
          duration: performance.now() - startTime,
          timestamp,
          toolName,
        };
      }

      // Create execution context
      const executionContext: ToolExecutionContext = {
        ...context,
        sessionId: `tool_${Date.now()}`,
        agentName: 'tool_executor',
        timestamp,
      };

      // Execute the tool
      const result = await tool.execute(parameters, executionContext);

      // Update metrics
      const metrics = this.toolMetrics.get(toolName)!;
      metrics.calls += 1;
      metrics.totalDuration += performance.now() - startTime;

      logger.info({
        toolName,
        duration: performance.now() - startTime,
        success: true,
      }, 'Tool executed successfully');

      return {
        success: true,
        result,
        duration: performance.now() - startTime,
        timestamp,
        toolName,
      };

    } catch (error) {
      // Update error metrics
      const metrics = this.toolMetrics.get(toolName);
      if (metrics) {
        metrics.calls += 1;
        metrics.errors += 1;
        metrics.totalDuration += performance.now() - startTime;
      }

      logger.error({
        error,
        toolName,
        duration: performance.now() - startTime,
      }, 'Tool execution failed');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: performance.now() - startTime,
        timestamp,
        toolName,
      };
    }
  }

  getTool(name: string): any {
    return this.tools.get(name);
  }

  getAllTools(): Record<string, any> {
    return Object.fromEntries(this.tools);
  }

  getToolsByCategory(category: string): Record<string, any> {
    const tools: Record<string, any> = {};

    for (const [toolName, tool] of this.tools.entries()) {
      if (this.toolCategories.get(toolName) === category) {
        tools[toolName] = tool;
      }
    }

    return tools;
  }

  getToolCategories(): string[] {
    return [...new Set(this.toolCategories.values())];
  }

  getToolMetrics(toolName?: string) {
    if (toolName) {
      return this.toolMetrics.get(toolName) || { calls: 0, errors: 0, totalDuration: 0 };
    }
    return Object.fromEntries(this.toolMetrics);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  isToolAvailable(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  validateToolParameters(toolName: string, parameters: any): { valid: boolean; errors?: string[] } {
    try {
      const tool = this.tools.get(toolName);
      if (!tool) {
        return { valid: false, errors: [`Tool ${toolName} not found`] };
      }

      // Basic parameter validation
      if (!parameters || typeof parameters !== 'object') {
        return { valid: false, errors: ['Parameters must be an object'] };
      }

      // Tool-specific validation would go here
      return { valid: true };

    } catch (error) {
      return { 
        valid: false, 
        errors: [error instanceof Error ? error.message : 'Validation failed'] 
      };
    }
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();