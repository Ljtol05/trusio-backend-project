import { toolRegistry } from '../core/ToolRegistry.js';
import { logger } from '../../lib/logger.js';
import { registerTransactionTools } from './transaction-tools.js';
import { registerBudgetTools } from './budget.js';
import { registerEnvelopeTools } from './envelope.js';
import { registerAnalysisTools } from './analysis.js';
import { registerInsightTools } from './insight.js';
import { registerHandoffTools } from './handoff.js';
import { registerTransferFundsTool } from './transfer_funds.js';
import { registerTrackAchievementsTool } from './track_achievements.js';
import { registerIdentifyOpportunitiesTool } from './identify_opportunities.js';
import { registerMemoryTools } from './memory.js';

export function registerAllTools(): void {
  try {
    logger.info('Starting tool registration process...');

    // Register all tool categories
    registerTransactionTools(toolRegistry);
    logger.debug('Transaction tools registered');

    registerBudgetTools(toolRegistry);
    logger.debug('Budget tools registered');

    registerEnvelopeTools(toolRegistry);
    logger.debug('Envelope tools registered');

    registerAnalysisTools(toolRegistry);
    logger.debug('Analysis tools registered');

    registerInsightTools(toolRegistry);
    logger.debug('Insight tools registered');

    registerHandoffTools(toolRegistry);
    logger.debug('Handoff tools registered');

    // Register memory tools
    registerMemoryTools(toolRegistry);
    logger.debug('Memory tools registered');

    // Register individual tools from Task 2
    registerTransferFundsTool(toolRegistry);
    logger.debug('Transfer funds tool registered');

    registerTrackAchievementsTool(toolRegistry);
    logger.debug('Track achievements tool registered');

    registerIdentifyOpportunitiesTool(toolRegistry);
    logger.debug('Identify opportunities tool registered');

    const toolCount = toolRegistry.getToolCount();
    const allTools = toolRegistry.getAllTools();

    logger.info({ 
      toolCount, 
      toolNames: Object.keys(allTools),
      categories: [...new Set(Object.values(allTools).map(tool => tool.category))]
    }, 'All financial tools registered successfully');

    // Validate tool registration
    const expectedTools = [
      'budget_analysis', 'create_envelope', 'categorize_transaction', 
      'analyze_budget_variance', 'generate_recommendations', 'agent_handoff',
      'transfer_funds', 'track_achievements', 'identify_opportunities',
      'get_user_context', 'set_user_context', 'track_goal', 'get_goal_progress'
    ];

    const missingTools = expectedTools.filter(toolName => !toolRegistry.hasTool(toolName));
    if (missingTools.length > 0) {
      logger.warn({ missingTools, registeredTools: Object.keys(allTools) }, 'Some expected tools are missing from registry');

      // Try to identify what tools are actually registered
      logger.info({ 
        actuallyRegistered: Object.keys(allTools),
        expectedCount: expectedTools.length,
        actualCount: toolCount 
      }, 'Tool registration status');
    } else {
      logger.info('All expected tools successfully registered');
    }

  } catch (error) {
    logger.error({ error }, 'Failed to register tools');
    throw error;
  }
}

// Export all tools for easy importing
export * from './budget.js';
export * from './envelope.js';
export * from './transfer_funds.js';
export * from './transaction-tools.js';
export * from './track_achievements.js';
export * from './identify_opportunities.js';
export * from './insight.js';
export * from './memory.js';
export * from './handoff.js';
export * from './analysis.js';
export * from './registry.js';

// Re-export types from main types file
export type { 
  FinancialContext,
  ToolExecutionContext,
  ToolExecutionResult,
  AgentContext 
} from '../types.js';

// Export the tool registry
export { toolRegistry } from '../core/ToolRegistry.js';