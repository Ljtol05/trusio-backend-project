
import { z } from 'zod';
import type { AgentExecutionResult } from './types.js';

// Standard API response format
export const ApiResponseSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
  meta: z.object({
    requestId: z.string().optional(),
    timestamp: z.string(),
    processingTime: z.number().optional(),
    agentName: z.string().optional(),
    sessionId: z.string().optional(),
  }).optional(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

// Agent-specific response formats
export const AgentChatResponseSchema = z.object({
  message: z.string(),
  role: z.literal('assistant'),
  confidence: z.number().min(0).max(100).optional(),
  suggestedActions: z.array(z.object({
    type: z.string(),
    label: z.string(),
    description: z.string(),
    parameters: z.record(z.unknown()).optional(),
  })).optional(),
  followUpQuestions: z.array(z.string()).optional(),
  handoffSuggestion: z.object({
    targetAgent: z.string(),
    reason: z.string(),
  }).optional(),
});

export const AgentActionResponseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  result: z.unknown(),
  recommendations: z.array(z.string()).optional(),
  nextSteps: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

export type AgentChatResponse = z.infer<typeof AgentChatResponseSchema>;
export type AgentActionResponse = z.infer<typeof AgentActionResponseSchema>;

export class ResponseFormatter {
  static success<T>(data: T, meta?: Partial<ApiResponse['meta']>): ApiResponse {
    return {
      ok: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };
  }

  static error(
    error: string,
    code?: string,
    meta?: Partial<ApiResponse['meta']>
  ): ApiResponse {
    return {
      ok: false,
      error,
      code,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };
  }

  static agentChat(
    result: AgentExecutionResult,
    options: {
      confidence?: number;
      suggestedActions?: AgentChatResponse['suggestedActions'];
      followUpQuestions?: string[];
      handoffSuggestion?: AgentChatResponse['handoffSuggestion'];
    } = {}
  ): ApiResponse {
    const chatResponse: AgentChatResponse = {
      message: result.response,
      role: 'assistant',
      confidence: options.confidence,
      suggestedActions: options.suggestedActions,
      followUpQuestions: options.followUpQuestions,
      handoffSuggestion: options.handoffSuggestion,
    };

    return this.success(chatResponse, {
      agentName: result.agentName,
      sessionId: result.sessionId,
      processingTime: result.duration,
    });
  }

  static agentAction(
    result: AgentExecutionResult,
    action: string,
    options: {
      recommendations?: string[];
      nextSteps?: string[];
      warnings?: string[];
    } = {}
  ): ApiResponse {
    const actionResponse: AgentActionResponse = {
      success: result.success,
      action,
      result: result.response,
      recommendations: options.recommendations,
      nextSteps: options.nextSteps,
      warnings: options.warnings,
    };

    return this.success(actionResponse, {
      agentName: result.agentName,
      sessionId: result.sessionId,
      processingTime: result.duration,
    });
  }

  static agentError(
    result: AgentExecutionResult,
    code?: string
  ): ApiResponse {
    return this.error(
      result.error || 'Agent operation failed',
      code || 'AGENT_ERROR',
      {
        agentName: result.agentName,
        sessionId: result.sessionId,
        processingTime: result.duration,
      }
    );
  }

  static validation(
    errors: any[],
    meta?: Partial<ApiResponse['meta']>
  ): ApiResponse {
    return {
      ok: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      data: { errors },
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    };
  }

  static agentUnavailable(
    agentName: string,
    meta?: Partial<ApiResponse['meta']>
  ): ApiResponse {
    return this.error(
      `Agent '${agentName}' is not available`,
      'AGENT_UNAVAILABLE',
      {
        agentName,
        ...meta,
      }
    );
  }

  static systemError(
    message: string = 'System error occurred',
    meta?: Partial<ApiResponse['meta']>
  ): ApiResponse {
    return this.error(
      message,
      'SYSTEM_ERROR',
      meta
    );
  }

  // Utility method to extract suggestions from agent responses
  static extractActionSuggestions(response: string): AgentChatResponse['suggestedActions'] {
    const suggestions: AgentChatResponse['suggestedActions'] = [];
    
    // Simple pattern matching for common action suggestions
    const patterns = [
      {
        pattern: /create.*envelope.*(\$[\d,]+)/gi,
        type: 'create_envelope',
        label: 'Create Envelope',
      },
      {
        pattern: /transfer.*(\$[\d,]+)/gi,
        type: 'transfer_funds',
        label: 'Transfer Funds',
      },
      {
        pattern: /analyze.*spending/gi,
        type: 'analyze_spending',
        label: 'Analyze Spending',
      },
      {
        pattern: /set.*budget.*(\$[\d,]+)/gi,
        type: 'set_budget',
        label: 'Set Budget',
      },
    ];

    for (const { pattern, type, label } of patterns) {
      const matches = response.match(pattern);
      if (matches) {
        suggestions.push({
          type,
          label,
          description: matches[0],
          parameters: {},
        });
      }
    }

    return suggestions.length > 0 ? suggestions : undefined;
  }

  // Utility method to extract follow-up questions
  static extractFollowUpQuestions(response: string): string[] {
    const questions: string[] = [];
    
    // Look for questions in the response
    const questionPatterns = [
      /(?:Would you like to|Do you want to|Should I|Can I help you) [^?]*\?/gi,
      /(?:What about|How about) [^?]*\?/gi,
    ];

    for (const pattern of questionPatterns) {
      const matches = response.match(pattern);
      if (matches) {
        questions.push(...matches);
      }
    }

    return questions;
  }
}
