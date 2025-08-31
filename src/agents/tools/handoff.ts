import { tool } from '@openai/agents';
import { z } from 'zod';
import { logger } from '../../lib/logger.ts';
import type { ToolRegistry } from '../core/ToolRegistry.ts';

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

const agent_handoff = {
  name: 'agent_handoff',
  description: 'Hand off the conversation to another specialized financial agent with full context preservation and capability matching',
  parameters: agentHandoffSchema,
  execute: async (params, context) => {
    try {
      const { fromAgent, toAgent, reason, context: handoffContext, priority, userMessage } = params;

      logger.info({
        fromAgent,
        toAgent,
        reason,
        priority,
        userId: context.userId,
        agentName: context.agentName
      }, 'Executing agent handoff tool via HandoffManager');

      // Import handoffManager locally to avoid circular imports
      const { handoffManager } = await import('../core/HandoffManager.ts');

      // Execute comprehensive handoff using HandoffManager
      const handoffResult = await handoffManager.executeHandoff({
        fromAgent,
        toAgent,
        userId: context.userId,
        sessionId: context.sessionId || `tool_${Date.now()}`,
        reason,
        priority: priority as 'low' | 'medium' | 'high' | 'urgent',
        context: {
          ...context,
          ...handoffContext,
        },
        userMessage: userMessage || 'Agent handoff requested',
        preserveHistory: true,
        escalationLevel: 0,
        metadata: {
          initiatedBy: context.agentName,
          toolExecution: true,
          originalContext: handoffContext,
        }
      });

      if (!handoffResult.success) {
        return {
          success: false,
          error: handoffResult.error,
          fromAgent,
          toAgent,
          handoffId: handoffResult.handoffId,
        };
      }

      logger.info({
        handoffId: handoffResult.handoffId,
        fromAgent,
        toAgent,
        userId: context.userId,
        duration: handoffResult.duration,
        contextPreserved: handoffResult.contextPreserved
      }, 'Agent handoff tool completed successfully');

      return {
        success: true,
        fromAgent: handoffResult.fromAgent,
        toAgent: handoffResult.toAgent,
        reason,
        priority,
        response: handoffResult.response,
        handoffId: handoffResult.handoffId,
        contextPreserved: handoffResult.contextPreserved,
        escalationTriggered: handoffResult.escalationTriggered,
        duration: handoffResult.duration,
        message: `Handoff completed: ${fromAgent} → ${toAgent}. Reason: ${reason}`,
        timestamp: new Date().toISOString(),
        metadata: handoffResult.metadata,
      };

    } catch (error: any) {
      logger.error({
        error: error.message,
        fromAgent: params.fromAgent,
        toAgent: params.toAgent,
        userId: context.userId
      }, 'Agent handoff tool failed');

      return {
        success: false,
        error: error.message,
        fromAgent: params.fromAgent,
        toAgent: params.toAgent,
      };
    }
  },
};

export const agentHandoffTool = agent_handoff;

const check_agent_capabilities = {
  name: 'check_agent_capabilities',
  description: 'Check capabilities and availability of other agents',
  parameters: {
    type: 'object',
    properties: {
      agentName: { type: 'string', description: 'Agent name to check capabilities for' }
    }
  },
  async execute(parameters: any, context: any) {
    const { agentName } = parameters;

    // Mock implementation for now
    const agentCapabilities = {
      financial_advisor: ['investment_advice', 'retirement_planning', 'tax_optimization'],
      budget_coach: ['budget_creation', 'expense_tracking', 'saving_goals'],
      transaction_analyst: ['categorization', 'pattern_analysis', 'fraud_detection']
    };

    return {
      success: true,
      agent: agentName,
      capabilities: agentCapabilities[agentName] || [],
      available: Object.keys(agentCapabilities).includes(agentName)
    };
  }
};

export const agentCapabilityCheckTool = check_agent_capabilities;

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