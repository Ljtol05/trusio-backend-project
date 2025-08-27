
import { logger } from '../../lib/logger.js';
import { memoryManager } from './MemoryManager.js';
import { agentManager } from './AgentManager.js';
import type { FinancialContext, AgentMemoryContext } from '../types.js';

export interface HandoffRequest {
  fromAgent: string;
  toAgent: string;
  userId: string;
  sessionId: string;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  context: Record<string, any>;
  userMessage: string;
  preserveHistory: boolean;
  escalationLevel: number;
  metadata?: Record<string, any>;
}

export interface HandoffResult {
  success: boolean;
  handoffId: string;
  fromAgent: string;
  toAgent: string;
  response: string;
  contextPreserved: boolean;
  escalationTriggered: boolean;
  duration: number;
  error?: string;
  metadata: Record<string, any>;
}

export interface HandoffRule {
  name: string;
  fromAgents: string[];
  toAgents: string[];
  conditions: (context: any) => boolean;
  priority: number;
  autoApprove: boolean;
  preserveContext: boolean;
  escalationThreshold?: number;
}

export class HandoffManager {
  private handoffHistory: Map<string, HandoffResult[]> = new Map();
  private activeHandoffs: Map<string, HandoffRequest> = new Map();
  private handoffRules: HandoffRule[] = [];
  private readonly MAX_ESCALATION_LEVEL = 3;
  private readonly HANDOFF_TIMEOUT = 30000; // 30 seconds

  constructor() {
    this.initializeHandoffRules();
  }

  /**
   * Execute agent handoff with full context preservation
   */
  async executeHandoff(request: HandoffRequest): Promise<HandoffResult> {
    const startTime = Date.now();
    const handoffId = `handoff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info({
        handoffId,
        fromAgent: request.fromAgent,
        toAgent: request.toAgent,
        userId: request.userId,
        reason: request.reason,
        priority: request.priority,
        escalationLevel: request.escalationLevel
      }, 'Initiating agent handoff');

      // Validate handoff request
      const validation = await this.validateHandoff(request);
      if (!validation.valid) {
        throw new Error(`Handoff validation failed: ${validation.reason}`);
      }

      // Store active handoff
      this.activeHandoffs.set(handoffId, request);

      // Build comprehensive context for target agent
      const handoffContext = await this.buildHandoffContext(request);

      // Preserve conversation state
      const contextPreservation = await this.preserveConversationContext(request, handoffContext);

      // Check for escalation triggers
      const escalationResult = await this.checkEscalationTriggers(request);

      // Execute the handoff
      const targetAgentResponse = await this.executeAgentTransition(
        request,
        handoffContext,
        contextPreservation
      );

      // Record handoff success
      const result: HandoffResult = {
        success: true,
        handoffId,
        fromAgent: request.fromAgent,
        toAgent: request.toAgent,
        response: targetAgentResponse,
        contextPreserved: contextPreservation.success,
        escalationTriggered: escalationResult.escalated,
        duration: Date.now() - startTime,
        metadata: {
          handoffReason: request.reason,
          priority: request.priority,
          escalationLevel: request.escalationLevel,
          preservedItems: contextPreservation.preservedItems,
          ruleApplied: validation.ruleApplied,
          ...escalationResult.metadata
        }
      };

      // Store handoff history
      await this.recordHandoffHistory(request.userId, result);

      // Store handoff insight in memory
      await memoryManager.storeInsight(
        request.userId,
        'handoff_manager',
        `Successfully handed off from ${request.fromAgent} to ${request.toAgent}: ${request.reason}`,
        'agent_handoff',
        0.9,
        request.sessionId
      );

      // Clean up active handoff
      this.activeHandoffs.delete(handoffId);

      logger.info({
        handoffId,
        fromAgent: request.fromAgent,
        toAgent: request.toAgent,
        userId: request.userId,
        duration: result.duration,
        success: true
      }, 'Agent handoff completed successfully');

      return result;

    } catch (error: any) {
      logger.error({
        error: error.message,
        handoffId,
        fromAgent: request.fromAgent,
        toAgent: request.toAgent,
        userId: request.userId
      }, 'Agent handoff failed');

      const failureResult: HandoffResult = {
        success: false,
        handoffId,
        fromAgent: request.fromAgent,
        toAgent: request.toAgent,
        response: '',
        contextPreserved: false,
        escalationTriggered: false,
        duration: Date.now() - startTime,
        error: error.message,
        metadata: {
          failureReason: error.message,
          escalationLevel: request.escalationLevel,
        }
      };

      // Record failure for analysis
      await this.recordHandoffHistory(request.userId, failureResult);

      // Clean up
      this.activeHandoffs.delete(handoffId);

      throw error;
    }
  }

  /**
   * Intelligent agent routing based on context and rules
   */
  async routeToOptimalAgent(
    currentAgent: string,
    userMessage: string,
    context: FinancialContext,
    sessionId: string
  ): Promise<{ targetAgent: string; reason: string; confidence: number }> {
    try {
      // Analyze message content for routing signals
      const messageAnalysis = this.analyzeMessageForRouting(userMessage);
      
      // Get user's interaction history for pattern analysis
      const memoryProfile = await memoryManager.getUserMemoryProfile(context.userId);
      
      // Apply routing rules
      const routingDecision = this.applyRoutingRules(
        currentAgent,
        messageAnalysis,
        context,
        memoryProfile
      );

      logger.info({
        currentAgent,
        targetAgent: routingDecision.targetAgent,
        reason: routingDecision.reason,
        confidence: routingDecision.confidence,
        userId: context.userId
      }, 'Agent routing decision made');

      return routingDecision;

    } catch (error) {
      logger.error({ error, currentAgent, userId: context.userId }, 'Failed to route agent');
      
      // Default fallback routing
      return {
        targetAgent: currentAgent === 'financial_advisor' ? 'budget_coach' : 'financial_advisor',
        reason: 'Fallback routing due to analysis error',
        confidence: 0.3
      };
    }
  }

  /**
   * Validate handoff request against rules and constraints
   */
  private async validateHandoff(request: HandoffRequest): Promise<{
    valid: boolean;
    reason?: string;
    ruleApplied?: string;
  }> {
    try {
      // Check if agents exist
      const sourceAgent = agentManager.getAgent(request.fromAgent);
      const targetAgent = agentManager.getAgent(request.toAgent);

      if (!sourceAgent) {
        return { valid: false, reason: `Source agent '${request.fromAgent}' not found` };
      }

      if (!targetAgent) {
        return { valid: false, reason: `Target agent '${request.toAgent}' not found` };
      }

      // Check if agents are ready
      if (!sourceAgent.isReady()) {
        return { valid: false, reason: `Source agent '${request.fromAgent}' is not ready` };
      }

      if (!targetAgent.isReady()) {
        return { valid: false, reason: `Target agent '${request.toAgent}' is not ready` };
      }

      // Apply handoff rules
      const applicableRule = this.handoffRules.find(rule => {
        return rule.fromAgents.includes(request.fromAgent) &&
               rule.toAgents.includes(request.toAgent) &&
               rule.conditions(request.context);
      });

      if (!applicableRule) {
        return { valid: false, reason: 'No applicable handoff rule found' };
      }

      // Check escalation limits
      if (request.escalationLevel >= this.MAX_ESCALATION_LEVEL) {
        return { valid: false, reason: 'Maximum escalation level reached' };
      }

      // Check for circular handoffs
      const recentHistory = this.handoffHistory.get(request.userId) || [];
      const recentHandoffs = recentHistory.slice(-3);
      const circularHandoff = recentHandoffs.some(h => 
        h.fromAgent === request.toAgent && h.toAgent === request.fromAgent
      );

      if (circularHandoff) {
        return { valid: false, reason: 'Circular handoff detected - potential loop' };
      }

      return { valid: true, ruleApplied: applicableRule.name };

    } catch (error) {
      logger.error({ error, request }, 'Handoff validation error');
      return { valid: false, reason: 'Validation error occurred' };
    }
  }

  /**
   * Build comprehensive context for handoff
   */
  private async buildHandoffContext(request: HandoffRequest): Promise<{
    memoryContext: AgentMemoryContext;
    financialContext: FinancialContext;
    handoffReason: string;
    previousAgent: string;
    escalationLevel: number;
  }> {
    try {
      // Get enhanced memory context
      const memoryContext = await memoryManager.buildAgentMemoryContext(
        request.userId,
        request.toAgent,
        request.sessionId,
        true
      );

      // Build financial context from request
      const financialContext = request.context as FinancialContext;

      return {
        memoryContext,
        financialContext,
        handoffReason: request.reason,
        previousAgent: request.fromAgent,
        escalationLevel: request.escalationLevel,
      };

    } catch (error) {
      logger.error({ error, request }, 'Failed to build handoff context');
      throw new Error('Failed to build handoff context');
    }
  }

  /**
   * Preserve conversation context across handoff
   */
  private async preserveConversationContext(
    request: HandoffRequest,
    handoffContext: any
  ): Promise<{ success: boolean; preservedItems: number }> {
    try {
      let preservedItems = 0;

      if (request.preserveHistory) {
        // Store handoff transition as interaction
        await memoryManager.storeInteraction(
          request.userId,
          request.fromAgent,
          request.sessionId,
          request.userMessage,
          `[Handoff to ${request.toAgent}]: ${request.reason}`,
          request.context,
          {
            handoffType: 'outgoing',
            targetAgent: request.toAgent,
            reason: request.reason,
            priority: request.priority,
          }
        );
        preservedItems++;

        // Store handoff reception
        await memoryManager.storeInteraction(
          request.userId,
          request.toAgent,
          request.sessionId,
          `[Handoff from ${request.fromAgent}]: ${request.reason}\n\nUser: ${request.userMessage}`,
          '[Handoff received - analyzing context]',
          request.context,
          {
            handoffType: 'incoming',
            sourceAgent: request.fromAgent,
            reason: request.reason,
            priority: request.priority,
          }
        );
        preservedItems++;
      }

      // Store handoff context as insight
      await memoryManager.storeInsight(
        request.userId,
        'handoff_manager',
        `Context preserved for handoff: ${request.fromAgent} → ${request.toAgent}`,
        'context_preservation',
        0.9,
        request.sessionId
      );
      preservedItems++;

      return { success: true, preservedItems };

    } catch (error) {
      logger.error({ error, request }, 'Failed to preserve conversation context');
      return { success: false, preservedItems: 0 };
    }
  }

  /**
   * Check for escalation triggers
   */
  private async checkEscalationTriggers(request: HandoffRequest): Promise<{
    escalated: boolean;
    newLevel: number;
    reason?: string;
    metadata: Record<string, any>;
  }> {
    try {
      const userHistory = this.handoffHistory.get(request.userId) || [];
      const recentHandoffs = userHistory.filter(h => 
        Date.now() - new Date(h.metadata.timestamp || Date.now()).getTime() < 60000 * 10 // 10 minutes
      );

      let escalated = false;
      let newLevel = request.escalationLevel;
      let escalationReason = '';
      const metadata: Record<string, any> = {
        recentHandoffCount: recentHandoffs.length,
        currentLevel: request.escalationLevel,
      };

      // Escalate if too many recent handoffs
      if (recentHandoffs.length >= 3) {
        escalated = true;
        newLevel = Math.min(request.escalationLevel + 1, this.MAX_ESCALATION_LEVEL);
        escalationReason = 'Multiple recent handoffs detected';
      }

      // Escalate for high-priority requests
      if (request.priority === 'urgent' && request.escalationLevel === 0) {
        escalated = true;
        newLevel = 2;
        escalationReason = 'Urgent priority request';
      }

      // Escalate if previous handoffs failed
      const recentFailures = recentHandoffs.filter(h => !h.success);
      if (recentFailures.length >= 2) {
        escalated = true;
        newLevel = Math.min(request.escalationLevel + 1, this.MAX_ESCALATION_LEVEL);
        escalationReason = 'Recent handoff failures detected';
      }

      if (escalated) {
        metadata.escalationReason = escalationReason;
        metadata.newLevel = newLevel;
        
        logger.warn({
          userId: request.userId,
          currentLevel: request.escalationLevel,
          newLevel,
          reason: escalationReason,
          recentHandoffs: recentHandoffs.length
        }, 'Escalation triggered during handoff');
      }

      return { escalated, newLevel, reason: escalationReason, metadata };

    } catch (error) {
      logger.error({ error, request }, 'Failed to check escalation triggers');
      return { escalated: false, newLevel: request.escalationLevel, metadata: {} };
    }
  }

  /**
   * Execute the actual agent transition
   */
  private async executeAgentTransition(
    request: HandoffRequest,
    handoffContext: any,
    contextPreservation: any
  ): Promise<string> {
    try {
      // Prepare enhanced context for target agent
      const enhancedContext = {
        ...handoffContext.financialContext,
        sessionId: request.sessionId,
        timestamp: new Date(),
        previousInteractions: [
          {
            role: 'system' as const,
            content: `[Handoff from ${request.fromAgent}] Reason: ${request.reason}. Priority: ${request.priority}. Escalation Level: ${request.escalationLevel}`,
            timestamp: new Date().toISOString(),
            agentName: request.fromAgent,
            metadata: {
              handoffType: 'transition',
              preservedContext: contextPreservation.success,
            }
          }
        ],
        memoryContext: handoffContext.memoryContext,
        handoffMetadata: {
          fromAgent: request.fromAgent,
          reason: request.reason,
          priority: request.priority,
          escalationLevel: request.escalationLevel,
          userMessage: request.userMessage,
        }
      };

      // Construct handoff message for target agent
      const handoffMessage = this.constructHandoffMessage(request, handoffContext);

      // Run target agent with enhanced context
      const response = await agentManager.runAgent(
        request.toAgent,
        handoffMessage,
        enhancedContext
      );

      return response;

    } catch (error) {
      logger.error({ error, request }, 'Failed to execute agent transition');
      throw new Error(`Agent transition failed: ${error.message}`);
    }
  }

  /**
   * Construct appropriate handoff message for target agent
   */
  private constructHandoffMessage(request: HandoffRequest, context: any): string {
    const parts: string[] = [];

    // Handoff header
    parts.push(`[AGENT HANDOFF: ${request.fromAgent.toUpperCase()} → ${request.toAgent.toUpperCase()}]`);
    parts.push(`Reason: ${request.reason}`);
    parts.push(`Priority: ${request.priority.toUpperCase()}`);
    
    if (request.escalationLevel > 0) {
      parts.push(`⚠️ ESCALATION LEVEL ${request.escalationLevel}`);
    }

    parts.push(''); // Empty line

    // Context summary
    if (context.memoryContext?.contextSummary) {
      parts.push('USER CONTEXT:');
      parts.push(context.memoryContext.contextSummary);
      parts.push(''); // Empty line
    }

    // User's original message
    parts.push('USER MESSAGE:');
    parts.push(request.userMessage);

    // Personalization hints
    if (context.memoryContext?.personalizations) {
      parts.push('');
      parts.push('PERSONALIZATION NOTES:');
      Object.entries(context.memoryContext.personalizations).forEach(([key, value]) => {
        parts.push(`- ${key}: ${value}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * Analyze message content for routing signals
   */
  private analyzeMessageForRouting(message: string): {
    intent: string;
    confidence: number;
    keywords: string[];
    urgency: 'low' | 'medium' | 'high';
  } {
    const messageLower = message.toLowerCase();
    const urgentKeywords = ['urgent', 'emergency', 'asap', 'immediately', 'help', 'crisis'];
    const budgetKeywords = ['budget', 'envelope', 'allocate', 'spending', 'allocation'];
    const analysisKeywords = ['analyze', 'report', 'trends', 'insights', 'pattern'];
    const transactionKeywords = ['transaction', 'expense', 'categorize', 'spending'];

    let intent = 'general';
    let confidence = 0.5;
    const foundKeywords: string[] = [];

    // Check for urgent indicators
    const urgency = urgentKeywords.some(keyword => messageLower.includes(keyword)) ? 'high' :
                   messageLower.includes('soon') || messageLower.includes('quick') ? 'medium' : 'low';

    // Determine intent based on keywords
    if (budgetKeywords.some(keyword => messageLower.includes(keyword))) {
      intent = 'budgeting';
      confidence = 0.8;
      foundKeywords.push(...budgetKeywords.filter(k => messageLower.includes(k)));
    } else if (analysisKeywords.some(keyword => messageLower.includes(keyword))) {
      intent = 'analysis';
      confidence = 0.8;
      foundKeywords.push(...analysisKeywords.filter(k => messageLower.includes(k)));
    } else if (transactionKeywords.some(keyword => messageLower.includes(keyword))) {
      intent = 'transactions';
      confidence = 0.8;
      foundKeywords.push(...transactionKeywords.filter(k => messageLower.includes(k)));
    }

    return { intent, confidence, keywords: foundKeywords, urgency };
  }

  /**
   * Apply routing rules to determine optimal target agent
   */
  private applyRoutingRules(
    currentAgent: string,
    messageAnalysis: any,
    context: FinancialContext,
    memoryProfile: any
  ): { targetAgent: string; reason: string; confidence: number } {
    // Default routing logic
    let targetAgent = currentAgent;
    let reason = 'No routing change needed';
    let confidence = 0.5;

    // Intent-based routing
    switch (messageAnalysis.intent) {
      case 'budgeting':
        if (currentAgent !== 'budget_coach') {
          targetAgent = 'budget_coach';
          reason = 'Budget-related query detected';
          confidence = messageAnalysis.confidence;
        }
        break;

      case 'analysis':
        if (currentAgent !== 'insight_generator') {
          targetAgent = 'insight_generator';
          reason = 'Analysis request detected';
          confidence = messageAnalysis.confidence;
        }
        break;

      case 'transactions':
        if (currentAgent !== 'transaction_analyst') {
          targetAgent = 'transaction_analyst';
          reason = 'Transaction analysis needed';
          confidence = messageAnalysis.confidence;
        }
        break;
    }

    // Urgency-based routing
    if (messageAnalysis.urgency === 'high' && currentAgent !== 'financial_advisor') {
      targetAgent = 'financial_advisor';
      reason = 'High urgency requires general financial advisor';
      confidence = 0.9;
    }

    // Memory-based routing
    if (memoryProfile?.context.currentFocus) {
      const focus = memoryProfile.context.currentFocus;
      if (focus === 'budgeting' && currentAgent !== 'budget_coach') {
        targetAgent = 'budget_coach';
        reason = 'User focus on budgeting';
        confidence = 0.7;
      } else if (focus === 'goal_tracking' && currentAgent !== 'insight_generator') {
        targetAgent = 'insight_generator';
        reason = 'User focus on goal tracking';
        confidence = 0.7;
      }
    }

    return { targetAgent, reason, confidence };
  }

  /**
   * Initialize predefined handoff rules
   */
  private initializeHandoffRules(): void {
    this.handoffRules = [
      {
        name: 'budget_to_analysis',
        fromAgents: ['budget_coach'],
        toAgents: ['insight_generator'],
        conditions: (context) => context.analysisRequested || context.reportNeeded,
        priority: 1,
        autoApprove: true,
        preserveContext: true,
      },
      {
        name: 'transaction_to_budget',
        fromAgents: ['transaction_analyst'],
        toAgents: ['budget_coach'],
        conditions: (context) => context.budgetAdjustmentNeeded,
        priority: 1,
        autoApprove: true,
        preserveContext: true,
      },
      {
        name: 'escalation_to_advisor',
        fromAgents: ['budget_coach', 'transaction_analyst', 'insight_generator'],
        toAgents: ['financial_advisor'],
        conditions: (context) => context.escalationLevel > 0 || context.priority === 'urgent',
        priority: 2,
        autoApprove: true,
        preserveContext: true,
        escalationThreshold: 1,
      },
      {
        name: 'general_routing',
        fromAgents: ['financial_advisor', 'budget_coach', 'transaction_analyst', 'insight_generator'],
        toAgents: ['financial_advisor', 'budget_coach', 'transaction_analyst', 'insight_generator'],
        conditions: () => true, // Always applicable
        priority: 0,
        autoApprove: false,
        preserveContext: true,
      }
    ];

    logger.info({ ruleCount: this.handoffRules.length }, 'Handoff rules initialized');
  }

  /**
   * Record handoff history for analysis
   */
  private async recordHandoffHistory(userId: string, result: HandoffResult): Promise<void> {
    try {
      if (!this.handoffHistory.has(userId)) {
        this.handoffHistory.set(userId, []);
      }

      const userHistory = this.handoffHistory.get(userId)!;
      userHistory.unshift({
        ...result,
        metadata: {
          ...result.metadata,
          timestamp: new Date().toISOString(),
        }
      });

      // Limit history size
      if (userHistory.length > 50) {
        userHistory.splice(50);
      }

      logger.debug({
        userId,
        handoffId: result.handoffId,
        historyLength: userHistory.length
      }, 'Handoff history recorded');

    } catch (error) {
      logger.error({ error, userId, handoffId: result.handoffId }, 'Failed to record handoff history');
    }
  }

  /**
   * Get handoff history for a user
   */
  getHandoffHistory(userId: string, limit = 10): HandoffResult[] {
    const history = this.handoffHistory.get(userId) || [];
    return history.slice(0, limit);
  }

  /**
   * Get handoff statistics
   */
  getHandoffStatistics(userId?: string): {
    totalHandoffs: number;
    successRate: number;
    averageDuration: number;
    mostCommonRoutes: Array<{ from: string; to: string; count: number }>;
    escalationRate: number;
  } {
    let allHandoffs: HandoffResult[] = [];

    if (userId) {
      allHandoffs = this.handoffHistory.get(userId) || [];
    } else {
      // Get all handoffs across all users
      this.handoffHistory.forEach(history => {
        allHandoffs.push(...history);
      });
    }

    if (allHandoffs.length === 0) {
      return {
        totalHandoffs: 0,
        successRate: 0,
        averageDuration: 0,
        mostCommonRoutes: [],
        escalationRate: 0,
      };
    }

    const successfulHandoffs = allHandoffs.filter(h => h.success);
    const escalatedHandoffs = allHandoffs.filter(h => h.escalationTriggered);
    
    // Calculate route frequencies
    const routeFrequency: Map<string, number> = new Map();
    allHandoffs.forEach(h => {
      const route = `${h.fromAgent}->${h.toAgent}`;
      routeFrequency.set(route, (routeFrequency.get(route) || 0) + 1);
    });

    const mostCommonRoutes = Array.from(routeFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, count]) => {
        const [from, to] = route.split('->');
        return { from, to, count };
      });

    return {
      totalHandoffs: allHandoffs.length,
      successRate: (successfulHandoffs.length / allHandoffs.length) * 100,
      averageDuration: allHandoffs.reduce((sum, h) => sum + h.duration, 0) / allHandoffs.length,
      mostCommonRoutes,
      escalationRate: (escalatedHandoffs.length / allHandoffs.length) * 100,
    };
  }

  /**
   * Get active handoffs
   */
  getActiveHandoffs(): HandoffRequest[] {
    return Array.from(this.activeHandoffs.values());
  }

  /**
   * Check manager health
   */
  getHealthStatus(): {
    isHealthy: boolean;
    activeHandoffs: number;
    handoffRules: number;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for stuck handoffs
    const now = Date.now();
    this.activeHandoffs.forEach((handoff, id) => {
      const age = now - parseInt(id.split('_')[1]);
      if (age > this.HANDOFF_TIMEOUT) {
        issues.push(`Handoff ${id} has been active for ${Math.round(age / 1000)}s`);
      }
    });

    return {
      isHealthy: issues.length === 0,
      activeHandoffs: this.activeHandoffs.size,
      handoffRules: this.handoffRules.length,
      issues,
    };
  }
}

// Export singleton instance
export const handoffManager = new HandoffManager();
