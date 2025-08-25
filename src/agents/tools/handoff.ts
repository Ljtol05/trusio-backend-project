import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import type { ToolExecutionContext } from './types.js';

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
        budget_coach: 'Budget Coach - Budget planning and expense tracking',
        transaction_analyst: 'Transaction Analyst - Transaction categorization and analysis',
        insight_generator: 'Insight Generator - Financial insights and recommendations',
        general_assistant: 'General Financial Assistant - General financial guidance'
      };

      const targetAgentInfo = handoffMapping[params.targetAgent];

      return JSON.stringify({
        success: true,
        handoff: {
          fromAgent: context.agentName || 'current_agent',
          toAgent: targetAgentInfo,
          context: params.context,
          priority: params.priority,
          reason: params.reason || `User needs specialized assistance`,
          timestamp: new Date().toISOString(),
        },
        message: `Connecting to ${targetAgentInfo}`
      });

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