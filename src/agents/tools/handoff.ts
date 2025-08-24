
import { logger } from "../../lib/logger.js";
import { toolRegistry } from "./registry.js";
import { agentManager } from "../registry.js";
import { 
  HandoffParamsSchema, 
  ToolContext, 
  ToolResult,
  TOOL_CATEGORIES 
} from "./types.js";

// Agent Handoff Tool
const agentHandoffExecute = async (params: any, context: ToolContext): Promise<ToolResult> => {
  try {
    const validatedParams = HandoffParamsSchema.parse(params);
    const { fromAgent, toAgent, reason, context: handoffContext, priority, userMessage, conversationHistory } = validatedParams;

    logger.info({ fromAgent, toAgent, reason, priority }, "Executing agent handoff");

    // Validate that target agent exists and is available
    const targetAgentInstance = agentManager.getAgent(toAgent);
    if (!targetAgentInstance) {
      throw new Error(`Target agent '${toAgent}' not found or not available`);
    }

    if (!targetAgentInstance.isInitialized || !targetAgentInstance.config.isActive) {
      throw new Error(`Target agent '${toAgent}' is not ready to accept handoffs`);
    }

    // Record the handoff in agent metrics
    await agentManager.recordHandoff(fromAgent, toAgent);

    // Prepare handoff context for the target agent
    const handoffPayload = {
      handoffReason: reason,
      originAgent: fromAgent,
      priority,
      userMessage,
      conversationHistory: conversationHistory || [],
      additionalContext: handoffContext,
      timestamp: new Date().toISOString(),
      handoffId: `handoff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Determine handoff success probability based on agent capabilities
    const targetCapabilities = targetAgentInstance.config.specializations || [];
    const handoffCompatibility = calculateHandoffCompatibility(fromAgent, toAgent, reason, targetCapabilities);

    logger.info({ 
      fromAgent, 
      toAgent, 
      compatibility: handoffCompatibility,
      targetCapabilities 
    }, "Handoff compatibility assessed");

    // If compatibility is low, provide warning
    if (handoffCompatibility < 0.5) {
      logger.warn({ 
        fromAgent, 
        toAgent, 
        compatibility: handoffCompatibility 
      }, "Low handoff compatibility detected");
    }

    return {
      success: true,
      data: {
        handoff: {
          id: handoffPayload.handoffId,
          fromAgent,
          toAgent,
          reason,
          priority,
          compatibility: handoffCompatibility,
          targetAgent: {
            name: targetAgentInstance.config.name,
            role: targetAgentInstance.config.role,
            specializations: targetAgentInstance.config.specializations,
            isReady: targetAgentInstance.isInitialized
          },
          handoffContext: handoffPayload
        },
        nextSteps: [
          `Conversation will be transferred to ${targetAgentInstance.config.name}`,
          `Context and conversation history will be preserved`,
          `${targetAgentInstance.config.name} will continue the conversation based on: ${reason}`
        ],
        estimatedHandoffTime: '< 1 second'
      },
      message: `Handoff to ${targetAgentInstance.config.name} (${toAgent}) initiated successfully. Reason: ${reason}`
    };

  } catch (error: any) {
    logger.error({ 
      error: error.message, 
      fromAgent: params.fromAgent, 
      toAgent: params.toAgent 
    }, "Agent handoff failed");
    
    return {
      success: false,
      error: `Agent handoff failed: ${error.message}`,
      metadata: {
        fallbackAction: 'continue_with_current_agent',
        alternativeAgents: await suggestAlternativeAgents(params.toAgent, params.reason)
      }
    };
  }
};

// Helper function to calculate handoff compatibility
function calculateHandoffCompatibility(
  fromAgent: string, 
  toAgent: string, 
  reason: string, 
  targetCapabilities: string[]
): number {
  let compatibility = 0.5; // Base compatibility

  // Reason-based compatibility scoring
  const reasonKeywords = reason.toLowerCase();
  
  // Check if target agent's capabilities match handoff reason
  const relevantCapabilities = targetCapabilities.filter(cap => {
    const capKeywords = cap.toLowerCase();
    return reasonKeywords.includes(capKeywords) || 
           capKeywords.split('_').some(word => reasonKeywords.includes(word));
  });

  // Increase compatibility based on matching capabilities
  compatibility += relevantCapabilities.length * 0.15;

  // Agent-specific compatibility rules
  const compatibilityRules = {
    'triage': {
      'financial_coach': 0.9,
      'budget_analyzer': 0.8,
      'envelope_manager': 0.8,
      'transaction_processor': 0.7,
      'insight_generator': 0.7
    },
    'financial_coach': {
      'budget_analyzer': 0.8,
      'envelope_manager': 0.8,
      'insight_generator': 0.9,
      'triage': 0.6,
      'transaction_processor': 0.7
    },
    'budget_analyzer': {
      'financial_coach': 0.8,
      'insight_generator': 0.9,
      'envelope_manager': 0.7,
      'transaction_processor': 0.8,
      'triage': 0.6
    },
    'envelope_manager': {
      'financial_coach': 0.8,
      'budget_analyzer': 0.7,
      'transaction_processor': 0.8,
      'insight_generator': 0.6,
      'triage': 0.6
    },
    'transaction_processor': {
      'budget_analyzer': 0.8,
      'envelope_manager': 0.8,
      'financial_coach': 0.7,
      'insight_generator': 0.7,
      'triage': 0.6
    },
    'insight_generator': {
      'financial_coach': 0.9,
      'budget_analyzer': 0.9,
      'envelope_manager': 0.6,
      'transaction_processor': 0.7,
      'triage': 0.6
    }
  };

  // Apply agent-specific compatibility rules
  if (compatibilityRules[fromAgent] && compatibilityRules[fromAgent][toAgent]) {
    compatibility = Math.max(compatibility, compatibilityRules[fromAgent][toAgent]);
  }

  // Cap compatibility at 1.0
  return Math.min(compatibility, 1.0);
}

// Helper function to suggest alternative agents
async function suggestAlternativeAgents(failedTarget: string, reason: string): Promise<string[]> {
  const allAgents = agentManager.getActiveAgents();
  const alternatives = [];

  // Simple suggestion logic based on reason keywords
  const reasonLower = reason.toLowerCase();
  
  if (reasonLower.includes('budget') || reasonLower.includes('analyze') || reasonLower.includes('spending')) {
    alternatives.push('budget_analyzer');
  }
  
  if (reasonLower.includes('envelope') || reasonLower.includes('allocation') || reasonLower.includes('category')) {
    alternatives.push('envelope_manager');
  }
  
  if (reasonLower.includes('transaction') || reasonLower.includes('categorize') || reasonLower.includes('processing')) {
    alternatives.push('transaction_processor');
  }
  
  if (reasonLower.includes('insight') || reasonLower.includes('recommendation') || reasonLower.includes('advice')) {
    alternatives.push('insight_generator');
  }
  
  if (reasonLower.includes('coaching') || reasonLower.includes('help') || reasonLower.includes('guidance')) {
    alternatives.push('financial_coach');
  }

  // Filter out the failed target and ensure agents exist
  return alternatives
    .filter(agent => agent !== failedTarget)
    .filter(agent => allAgents.some(instance => instance.config.role === agent))
    .slice(0, 2); // Return top 2 alternatives
}

// Register handoff tool
toolRegistry.registerTool({
  name: "agent_handoff",
  description: "Transfer conversation between specialized financial agents while preserving context and conversation history",
  category: TOOL_CATEGORIES.HANDOFF,
  parameters: HandoffParamsSchema,
  execute: agentHandoffExecute,
  requiresAuth: false, // Handoffs are internal operations
  riskLevel: 'low',
  estimatedDuration: 500
});

export { agentHandoffExecute };
