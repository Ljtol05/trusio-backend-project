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

export function registerAllTools(): void {
  try {
    // Register all tool categories
    registerTransactionTools(toolRegistry);
    registerBudgetTools(toolRegistry);
    registerEnvelopeTools(toolRegistry);
    registerAnalysisTools(toolRegistry);
    registerInsightTools(toolRegistry);
    registerHandoffTools(toolRegistry);
    
    // Register individual tools from Task 2
    registerTransferFundsTool(toolRegistry);
    registerTrackAchievementsTool(toolRegistry);
    registerIdentifyOpportunitiesTool(toolRegistry);

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
      'transfer_funds', 'track_achievements', 'identify_opportunities'
    ];
    
    const missingTools = expectedTools.filter(toolName => !toolRegistry.hasTool(toolName));
    if (missingTools.length > 0) {
      logger.warn({ missingTools }, 'Some expected tools are missing from registry');
    }

  } catch (error) {
    logger.error({ error }, 'Failed to register tools');
    throw error;
  }
}

// Export all financial tools
export * from './budget.js';
export * from './envelope.js';
export * from './transaction-tools.js';
export * from './analysis.js';
export * from './insight.js';
export * from './handoff.js';
export * from './transfer_funds.js';
export * from './track_achievements.js';
export * from './identify_opportunities.js';
export * from './types.js';

// Export the tool registry
export { toolRegistry } from './registry.js';