import { tool } from '@openai/agents';
import { z } from 'zod';
import { HandoffParamsSchema, TOOL_CATEGORIES } from './types.js';
import { logger } from '../../lib/logger.js';
import { agentManager } from "../registry.js";

// Agent handoff tool - facilitates smooth transitions between specialized agents
export const agentHandoffTool = tool({
  name: 'agent_handoff',
  description: `Facilitate handoffs between different financial coaching agents.
  Transfers conversation context and user state to the most appropriate specialist agent.
  Use this when the current agent determines another agent is better suited for the user's needs.`,
  parameters: HandoffParamsSchema,
}, async (params, context) => {
  try {
    logger.info({ 
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      reason: params.reason,
      priority: params.priority 
    }, "Executing agent handoff");

    // Validate handoff target
    const targetAgentInstance = agentManager.getAgent(params.toAgent);
    if (!targetAgentInstance) {
      throw new Error(`Target agent '${params.toAgent}' not found or not available.`);
    }

    if (!targetAgentInstance.isInitialized || !targetAgentInstance.config.isActive) {
      throw new Error(`Target agent '${params.toAgent}' is not ready to accept handoffs.`);
    }

    // Record the handoff in agent metrics
    await agentManager.recordHandoff(params.fromAgent, params.toAgent);

    const handoffResult = {
      handoffId: `handoff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      reason: params.reason,
      priority: params.priority,
      context: params.context,
      userMessage: params.userMessage,
      conversationHistory: params.conversationHistory || [],
      timestamp: new Date().toISOString(),
      status: 'completed',
      nextAgentCapabilities: getAgentCapabilities(params.toAgent),
      transitionMessage: generateTransitionMessage(params.fromAgent, params.toAgent, params.reason)
    };

    // Log the handoff for analytics and agent coordination
    logger.info({
      handoffId: handoffResult.handoffId,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      reason: params.reason
    }, "Agent handoff completed successfully");

    return JSON.stringify({
      success: true,
      data: handoffResult,
      message: `Successfully handed off from ${params.fromAgent} to ${params.toAgent}: ${params.reason}`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error({ 
      error: error.message, 
      fromAgent: params.fromAgent,
      toAgent: params.toAgent 
    }, "Agent handoff failed");

    return JSON.stringify({
      success: false,
      error: error.message,
      message: `Failed to handoff from ${params.fromAgent} to ${params.toAgent}`,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to get agent capabilities
function getAgentCapabilities(agentRole: string): string[] {
  const capabilities: Record<string, string[]> = {
    'financial_coach': ['conversation', 'goal_setting', 'financial_advice', 'motivation', 'education'],
    'budget_analyzer': ['budget_analysis', 'spending_patterns', 'variance_analysis', 'forecasting'],
    'envelope_manager': ['envelope_creation', 'fund_allocation', 'balance_management', 'category_optimization'],
    'transaction_processor': ['transaction_categorization', 'automatic_allocation', 'pattern_recognition', 'anomaly_detection'],
    'insight_generator': ['trend_analysis', 'insights_generation', 'recommendations', 'predictive_analysis'],
    'triage': ['intent_classification', 'agent_routing', 'priority_assessment', 'context_switching']
  };

  return capabilities[agentRole] || [];
}

// Helper function to generate transition messages
function generateTransitionMessage(fromAgent: string, toAgent: string, reason: string): string {
  const agentNames: Record<string, string> = {
    'financial_coach': 'Financial Coach',
    'budget_analyzer': 'Budget Analyzer',
    'envelope_manager': 'Envelope Manager',
    'transaction_processor': 'Transaction Processor',
    'insight_generator': 'Insight Generator',
    'triage': 'Triage Specialist'
  };

  const fromName = agentNames[fromAgent] || fromAgent;
  const toName = agentNames[toAgent] || toAgent;

  return `Hi! I'm your ${toName}. The ${fromName} has handed you over to me because ${reason}. I'm here to help you with specialized assistance in this area. How can I assist you today?`;
}