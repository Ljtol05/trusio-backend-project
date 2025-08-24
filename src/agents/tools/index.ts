import { toolRegistry } from './registry.js';

// Import all tool implementations
import { budgetAnalysis, spendingPatterns, varianceCalculation } from './budget.js';
import { createEnvelope, transferFunds, manageBalance } from './envelope.js';
import { categorizeTransaction, autoAllocate, analyzeSpendingPatterns } from './transaction.js';
import { analyzeTrends, analyzeBudgetVariance } from './analysis.js';
import { generateRecommendations, identifyOpportunities, trackAchievements } from './insight.js';
import { agentHandoff } from './handoff.js';

// Initialize and register all tools
function initializeTools() {
  // Clear any existing tools to prevent duplicates
  toolRegistry.clear();

  // Register budget tools
  toolRegistry.registerTool('budget_analysis', budgetAnalysis);
  toolRegistry.registerTool('spending_patterns', spendingPatterns);
  toolRegistry.registerTool('variance_calculation', varianceCalculation);

  // Register envelope tools
  toolRegistry.registerTool('create_envelope', createEnvelope);
  toolRegistry.registerTool('transfer_funds', transferFunds);
  toolRegistry.registerTool('manage_balance', manageBalance);

  // Register transaction tools
  toolRegistry.registerTool('categorize_transaction', categorizeTransaction);
  toolRegistry.registerTool('auto_allocate', autoAllocate);
  toolRegistry.registerTool('analyze_spending_patterns', analyzeSpendingPatterns);

  // Register analysis tools
  toolRegistry.registerTool('analyze_trends', analyzeTrends);
  toolRegistry.registerTool('analyze_budget_variance', analyzeBudgetVariance);

  // Register insight tools
  toolRegistry.registerTool('generate_recommendations', generateRecommendations);
  toolRegistry.registerTool('identify_opportunities', identifyOpportunities);
  toolRegistry.registerTool('track_achievements', trackAchievements);

  // Register handoff tool
  toolRegistry.registerTool('agent_handoff', agentHandoff);
}

// Initialize tools immediately
initializeTools();

// Register all tools
import('./budget.js');
import('./envelope.js');
import('./transaction.js');
import('./analysis.js');
import('./insight.js');
import('./handoff.js');

// Export the configured registry
export { toolRegistry };
export * from './types.js';

// Verify tools are registered
console.log(`Initialized ${toolRegistry.getToolCount()} financial tools`);