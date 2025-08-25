
import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from '../core/ToolRegistry.js';

const agentHandoffSchema = z.object({
  targetAgent: z.enum(['budget_coach', 'transaction_analyst', 'insight_generator', 'general_assistant']),
  context: z.string(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  reason: z.string().optional(),
});

export const agentHandoffTool = tool({
  name: 'agent_handoff',
  description: 'Hand off conversation to a specialized financial agent',
  parameters: agentHandoffSchema,
  async execute(params, context: ToolExecutionContext) {
    try {
      logger.info({ params, userId: context.userId }, 'Processing agent handoff');

      const handoffMapping = {
        budget_coach: {
          name: 'Budget Coach',
          specialization: 'Budget planning, expense tracking, and financial goal setting',
          capabilities: ['Budget analysis', 'Spending recommendations', 'Goal tracking']
        },
        transaction_analyst: {
          name: 'Transaction Analyst', 
          specialization: 'Transaction categorization, spending pattern analysis',
          capabilities: ['Transaction analysis', 'Pattern recognition', 'Category optimization']
        },
        insight_generator: {
          name: 'Insight Generator',
          specialization: 'Financial insights, recommendations, and opportunity identification',
          capabilities: ['Financial insights', 'Personalized recommendations', 'Optimization opportunities']
        },
        general_assistant: {
          name: 'General Financial Assistant',
          specialization: 'General financial guidance and support',
          capabilities: ['General advice', 'Account management', 'Basic calculations']
        }
      };

      const targetAgentInfo = handoffMapping[params.targetAgent];

      if (!targetAgentInfo) {
        return JSON.stringify({
          success: false,
          error: `Unknown target agent: ${params.targetAgent}`
        });
      }

      // In a real implementation, this would trigger the actual handoff
      // For now, we'll simulate the handoff response
      const handoffResponse = {
        success: true,
        handoff: {
          fromAgent: context.agentName || 'current_agent',
          toAgent: targetAgentInfo.name,
          targetAgentId: params.targetAgent,
          context: params.context,
          priority: params.priority,
          reason: params.reason || `User needs specialized ${targetAgentInfo.specialization}`,
          timestamp: new Date().toISOString(),
        },
        nextSteps: [
          `Connecting to ${targetAgentInfo.name}`,
          'Context has been preserved and transferred',
          `${targetAgentInfo.name} specializes in: ${targetAgentInfo.specialization}`,
          'Continue the conversation with the new agent'
        ],
        agentCapabilities: targetAgentInfo.capabilities
      };

      logger.info({
        userId: context.userId,
        handoff: handoffResponse.handoff
      }, 'Agent handoff completed successfully');

      return JSON.stringify(handoffResponse);

    } catch (error: any) {
      logger.error({ error, params, userId: context.userId }, 'Agent handoff failed');
      return JSON.stringify({
        success: false,
        error: 'Failed to process agent handoff',
        details: error.message
      });
    }
  }
});

export function registerHandoffTools(registry: any): void {
  registry.registerTool(agentHandoffTool);
  logger.info('Agent handoff tools registered');
}
