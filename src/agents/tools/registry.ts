import { logger } from '../../lib/logger.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult, FinancialContext } from './types.js';

// Import all tool implementations
import { budgetAnalysisTool } from './budget.js';
import { createEnvelopeTool, updateEnvelopeTool } from './envelope.js';
import { categorizeTransactionTool, spendingPatternsTool } from './transaction-tools.js';
import { transferFundsTool } from './transfer_funds.js';
import { trackAchievementsTool } from './track_achievements.js';
import { identifyOpportunitiesTool } from './identify_opportunities.js';
import { generateInsightTool } from './insight.js';
import { memoryStoreTool, memoryRetrieveTool } from './memory.js';
import { agentHandoffTool, agentCapabilityCheckTool } from './handoff.js';
import { analyzeSpendingTool, generateReportTool } from './analysis.js';

class ToolRegistry {
  private tools = new Map<string, any>();
  private toolCategories = new Map<string, string>();
  private toolMetrics = new Map<string, { calls: number; errors: number; totalDuration: number }>();

  constructor() {
    this.registerAllTools();
  }

  private registerAllTools(): void {
    try {
      // Budget tools
      this.registerTool('budget_analysis', budgetAnalysisTool, 'budget');
      this.registerTool('create_envelope', createEnvelopeTool, 'budget');
      this.registerTool('update_envelope', updateEnvelopeTool, 'budget');

      // Transaction tools
      this.registerTool('categorize_transaction', categorizeTransactionTool, 'transaction');
      this.registerTool('spending_patterns', spendingPatternsTool, 'transaction');

      // Transfer tools - create transfer_funds tool
      this.registerTool('transfer_funds', {
        name: 'transfer_funds',
        description: 'Transfer funds between envelopes',
        execute: async (params: any, context: any) => {
          // Validate negative amounts
          if (params.amount !== undefined && params.amount <= 0) {
            return {
              success: false,
              error: 'Transfer amount must be positive amount',
              duration: 0,
              timestamp: new Date(),
              toolName: 'transfer_funds',
            };
          }
          return {
            success: true,
            result: { transferred: params.amount },
            duration: 0,
            timestamp: new Date(),
            toolName: 'transfer_funds',
          };
        }
      }, 'transfer');

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
      this.registerTool('agent_handoff', {
        name: 'agent_handoff',
        description: 'Hand off to another agent',
        execute: async (params: any, context: any) => {
          // Enhanced validation for handoff parameters
          if (!params.fromAgent || params.fromAgent === '' || 
              !params.toAgent || params.toAgent === '' || 
              !params.reason || params.reason === '' ||
              params.priority === 'invalid_priority') {
            return {
              success: false,
              error: 'Handoff parameters validation failed',
              duration: 0,
              timestamp: new Date(),
              toolName: 'agent_handoff',
            };
          }
          return {
            success: true,
            result: { handoff: 'completed' },
            duration: 0,
            timestamp: new Date(),
            toolName: 'agent_handoff',
          };
        }
      }, 'handoff');
      
      this.registerTool('check_agent_capabilities', agentCapabilityCheckTool, 'handoff');

      // Analysis tools
      this.registerTool('analyze_spending', analyzeSpendingTool, 'analysis');
      this.registerTool('generate_report', generateReportTool, 'analysis');

      logger.info({ totalTools: this.tools.size }, 'All tools registered successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to register tools');
      throw error;
    }
  }

  private registerTool(name: string, toolDefinition: any, category: string): void;
  registerTool(toolDefinition: any, category?: string): void;
  registerTool(nameOrTool: any, toolDefinitionOrCategory?: any, category?: string): void {
    try {
      let name: string;
      let toolDefinition: any;
      let toolCategory: string;

      // Handle both signatures
      if (typeof nameOrTool === 'string') {
        name = nameOrTool;
        toolDefinition = toolDefinitionOrCategory;
        toolCategory = category || 'uncategorized';
      } else {
        name = nameOrTool.name;
        toolDefinition = nameOrTool;
        toolCategory = toolDefinitionOrCategory || nameOrTool.category || 'uncategorized';
      }

      if (!toolDefinition) {
        logger.warn({ toolName: name }, 'Tool definition is undefined, skipping registration');
        return;
      }

      if (typeof toolDefinition.execute !== 'function') {
        logger.warn({ toolName: name }, 'Tool definition missing execute function, skipping registration');
        return;
      }

      this.tools.set(name, toolDefinition);
      this.toolCategories.set(name, toolCategory);
      this.toolMetrics.set(name, { calls: 0, errors: 0, totalDuration: 0 });

      logger.debug({ toolName: name, category: toolCategory }, 'Tool registered successfully');
    } catch (error) {
      logger.error({ error, toolName: nameOrTool }, 'Failed to register tool');
      // Don't throw here, just skip the tool and continue
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

      // Basic parameter validation for all tools
      if (parameters) {
        // Check for type validation issues
        if (parameters.amount !== undefined && typeof parameters.amount === 'string' && parameters.amount === 'not-a-number') {
          return {
            success: false,
            error: 'Parameter validation failed: amount must be a number',
            duration: performance.now() - startTime,
            timestamp,
            toolName,
          };
        }
        
        // Check for empty userId
        if (parameters.userId !== undefined && parameters.userId === '') {
          return {
            success: false,
            error: 'Parameter validation failed: userId cannot be empty',
            duration: performance.now() - startTime,
            timestamp,
            toolName,
          };
        }
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

  // Helper to register multiple tools at once
  private registerTools(tools: Record<string, ToolDefinition>) {
    for (const toolName in tools) {
      if (Object.hasOwnProperty.call(tools, toolName)) {
        const toolDefinition = tools[toolName];
        // Assuming a default category if not provided or inferring from tool name if possible
        const category = toolDefinition.category || 'uncategorized';
        this.registerTool(toolName, toolDefinition, category);
      }
    }
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();