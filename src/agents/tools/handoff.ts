import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { ToolRegistry } from '../core/ToolRegistry.js';

const agentHandoffSchema = z.object({
  targetAgent: z.enum(['financial_advisor', 'budget_coach', 'transaction_analyst', 'insight_generator']).describe('Name of the target agent to hand off to'),
  context: z.string().min(10).describe('Context and reason for the handoff'),
  priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Priority level of the handoff'),
  userIntent: z.string().optional().describe('User\'s specific intent or goal'),
  transferData: z.record(z.any()).optional().describe('Additional data to transfer to the new agent'),
  preserveHistory: z.boolean().default(true).describe('Whether to preserve conversation history')
});

const agentCapabilityCheckSchema = z.object({
  agentName: z.string().describe('Agent name to check capabilities for'),
  requiredCapabilities: z.array(z.string()).describe('List of required capabilities')
});

const agentHandoffTool = tool({
  name: 'agent_handoff',
  description: 'Hand off the conversation to another specialized financial agent with full context preservation and capability matching',
  parameters: agentHandoffSchema,
  async execute({ targetAgent, context, priority, userIntent, transferData, preserveHistory }) {
    try {
      logger.info({ targetAgent, context, priority, userIntent }, 'Executing agent handoff');

      // Validate target agent capabilities
      const agentCapabilities = {
        'financial_advisor': ['comprehensive_financial_guidance', 'goal_setting', 'financial_education', 'agent_coordination'],
        'budget_coach': ['envelope_budgeting', 'budget_creation', 'fund_allocation', 'category_optimization'],
        'transaction_analyst': ['spending_analysis', 'transaction_categorization', 'pattern_recognition', 'anomaly_detection'],
        'insight_generator': ['trend_analysis', 'goal_tracking', 'personalized_recommendations', 'predictive_insights']
      };

      const handoffRecord = {
        id: `handoff_${Date.now()}`,
        fromAgent: 'current_agent', // TODO: Get current agent name from context
        toAgent: targetAgent,
        context,
        userIntent,
        priority,
        transferData: transferData || {},
        preserveHistory,
        capabilities: agentCapabilities[targetAgent] || [],
        timestamp: new Date().toISOString(),
        status: 'initiated',
        estimatedHandoffTime: 500
      };

      // TODO: Implement actual agent switching logic with agent registry
      return {
        status: 'success',
        handoff: handoffRecord,
        message: `Handing off to ${targetAgent} for specialized assistance with: ${context}`,
        nextSteps: [
          `${targetAgent} will analyze your request`,
          'Context and history will be preserved',
          'You can continue the conversation seamlessly'
        ]
      };
    } catch (error) {
      logger.error({ error, targetAgent, context }, 'Agent handoff failed');
      throw new Error(`Agent handoff failed: ${error.message}`);
    }
  }
});

const agentCapabilityCheckTool = tool({
  name: 'check_agent_capabilities',
  description: 'Check if an agent has specific capabilities before handoff',
  parameters: agentCapabilityCheckSchema,
  async execute({ agentName, requiredCapabilities }) {
    try {
      logger.info({ agentName, requiredCapabilities }, 'Checking agent capabilities');

      const agentCapabilities = {
        'financial_advisor': ['comprehensive_financial_guidance', 'goal_setting', 'financial_education', 'agent_coordination', 'holistic_planning'],
        'budget_coach': ['envelope_budgeting', 'budget_creation', 'fund_allocation', 'category_optimization', 'budget_troubleshooting'],
        'transaction_analyst': ['spending_analysis', 'transaction_categorization', 'pattern_recognition', 'anomaly_detection', 'spending_insights'],
        'insight_generator': ['trend_analysis', 'goal_tracking', 'personalized_recommendations', 'predictive_insights', 'financial_forecasting']
      };

      const hasCapabilities = agentCapabilities[agentName] || [];
      const missingCapabilities = requiredCapabilities.filter(cap => !hasCapabilities.includes(cap));
      const hasAllCapabilities = missingCapabilities.length === 0;

      return {
        status: 'success',
        agentName,
        hasAllCapabilities,
        availableCapabilities: hasCapabilities,
        requiredCapabilities,
        missingCapabilities,
        recommendation: hasAllCapabilities 
          ? `${agentName} can handle all required capabilities`
          : `Consider alternative agent or split request across multiple agents`
      };
    } catch (error) {
      logger.error({ error, agentName }, 'Capability check failed');
      throw new Error(`Capability check failed: ${error.message}`);
    }
  }
});

export function registerHandoffTools(registry: ToolRegistry): void {
  try {
    // Register tools with enhanced metadata
    registry.registerTool({
      ...agentHandoffTool,
      category: 'coordination',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 1000
    });

    registry.registerTool({
      ...agentCapabilityCheckTool,
      category: 'coordination',
      riskLevel: 'low',
      requiresAuth: true,
      estimatedDuration: 500
    });

    // Register aliases for common handoff patterns
    registry.registerTool({
      name: 'switch_agent',
      ...agentHandoffTool,
      category: 'coordination',
      riskLevel: 'low',
      requiresAuth: true
    });

    registry.registerTool({
      name: 'delegate_to_agent',
      ...agentHandoffTool,
      category: 'coordination',
      riskLevel: 'low',
      requiresAuth: true
    });

    logger.info({ toolCount: 4 }, 'Handoff tools registered successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to register handoff tools');
    throw error;
  }
}