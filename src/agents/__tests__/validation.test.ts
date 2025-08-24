
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { agentRegistry } from '../agentRegistry.js';
import { toolRegistry } from '../tools/registry.js';
import {
  AgentConfigSchema,
  AgentContextSchema,
  AgentResponseSchema,
  FinancialContextSchema,
  type FinancialContext,
} from '../types.js';

// Mock dependencies
vi.mock('@openai/agents', () => ({
  Agent: vi.fn(),
  run: vi.fn(),
  tool: vi.fn(),
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('Data Validation Tests', () => {
  describe('Schema Validation', () => {
    describe('AgentConfigSchema', () => {
      it('should validate correct agent configuration', () => {
        const validConfig = {
          name: 'Test Agent',
          role: 'financial_coach' as const,
          instructions: 'You are a helpful financial coach',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1000,
          tools: ['budget_analysis', 'spending_patterns'],
          handoffs: ['budget_coach'],
          isActive: true,
          priority: 5,
          specializations: ['budgeting', 'savings'],
        };

        const result = AgentConfigSchema.safeParse(validConfig);
        expect(result.success).toBe(true);
      });

      it('should reject invalid agent configuration', () => {
        const invalidConfig = {
          name: '', // Empty name should fail
          role: 'invalid_role', // Invalid role
          instructions: '', // Empty instructions
          temperature: 3, // Out of range
          priority: 15, // Out of range
        };

        const result = AgentConfigSchema.safeParse(invalidConfig);
        expect(result.success).toBe(false);
        
        if (!result.success) {
          expect(result.error.errors.length).toBeGreaterThan(0);
        }
      });
    });

    describe('FinancialContextSchema', () => {
      it('should validate correct financial context', () => {
        const validContext = {
          userId: 'user-123',
          totalIncome: 5000,
          totalExpenses: 3000,
          envelopes: [
            {
              id: 'env-1',
              name: 'Groceries',
              balance: 500,
              target: 600,
              category: 'food',
            },
          ],
          transactions: [
            {
              id: 'txn-1',
              amount: -50,
              description: 'Store purchase',
              category: 'food',
              date: '2024-01-15T10:00:00Z',
            },
          ],
          goals: [
            {
              id: 'goal-1',
              description: 'Emergency fund',
              targetAmount: 10000,
              currentAmount: 2500,
              deadline: '2024-12-31T23:59:59Z',
            },
          ],
          riskTolerance: 'moderate' as const,
          timeHorizon: 'long' as const,
        };

        const result = FinancialContextSchema.safeParse(validContext);
        expect(result.success).toBe(true);
      });

      it('should accept minimal financial context', () => {
        const minimalContext = {
          userId: 'user-123',
        };

        const result = FinancialContextSchema.safeParse(minimalContext);
        expect(result.success).toBe(true);
      });

      it('should reject invalid financial context', () => {
        const invalidContext = {
          userId: '', // Empty userId
          totalIncome: -1000, // Negative income doesn't make sense
          envelopes: [
            {
              id: '',
              name: '',
              balance: 'invalid', // Should be number
            },
          ],
          riskTolerance: 'invalid_tolerance',
        };

        const result = FinancialContextSchema.safeParse(invalidContext);
        expect(result.success).toBe(false);
      });
    });

    describe('AgentResponseSchema', () => {
      it('should validate correct agent response', () => {
        const validResponse = {
          response: 'Here is your financial advice...',
          confidence: 85,
          suggestedActions: [
            {
              type: 'create_envelope' as const,
              description: 'Create a groceries envelope',
              parameters: { name: 'Groceries', amount: 500 },
              priority: 'medium' as const,
            },
          ],
          handoffTarget: 'budget_coach',
          followUpQuestions: ['What is your monthly income?'],
          metadata: { processingTime: 1200 },
        };

        const result = AgentResponseSchema.safeParse(validResponse);
        expect(result.success).toBe(true);
      });

      it('should reject invalid agent response', () => {
        const invalidResponse = {
          response: '', // Empty response
          confidence: 150, // Out of range
          suggestedActions: [
            {
              type: 'invalid_action', // Invalid action type
              description: '',
            },
          ],
        };

        const result = AgentResponseSchema.safeParse(invalidResponse);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Tool Parameter Validation', () => {
    it('should validate budget analysis parameters', async () => {
      const validParams = {
        userId: 'user-123',
        timeframe: 'monthly',
        includeProjections: true,
      };

      const mockContext: FinancialContext = {
        userId: 'user-123',
      };

      // This should not throw an error
      await expect(
        toolRegistry.executeTool('budget_analysis', validParams, mockContext)
      ).resolves.toBeDefined();
    });

    it('should reject invalid tool parameters', async () => {
      const invalidParams = {
        userId: '', // Empty userId
        amount: 'not-a-number', // Invalid amount type
      };

      const mockContext: FinancialContext = {
        userId: 'user-123',
      };

      const result = await toolRegistry.executeTool('create_envelope', invalidParams, mockContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });
  });

  describe('Error Handling Validation', () => {
    it('should handle database validation errors gracefully', async () => {
      // Mock database to throw validation error
      const dbError = new Error('Validation failed: userId is required');
      dbError.name = 'ValidationError';

      vi.doMock('../../lib/db.js', () => ({
        db: {
          envelope: {
            findMany: vi.fn().mockRejectedValue(dbError),
          },
        },
      }));

      const result = await toolRegistry.executeTool(
        'budget_analysis',
        { userId: 'user-123' },
        { userId: 'user-123' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should validate agent handoff parameters', async () => {
      const validHandoffParams = {
        fromAgent: 'financial_advisor',
        toAgent: 'budget_coach',
        reason: 'User needs specialized budgeting help',
        context: { userGoal: 'monthly budget' },
        priority: 'medium' as const,
      };

      const result = await toolRegistry.executeTool(
        'agent_handoff',
        validHandoffParams,
        { userId: 'user-123' }
      );

      expect(result.success).toBe(true);
    });

    it('should reject invalid handoff parameters', async () => {
      const invalidHandoffParams = {
        fromAgent: '', // Empty agent name
        toAgent: 'non_existent_agent',
        reason: '', // Empty reason
        priority: 'invalid_priority',
      };

      const result = await toolRegistry.executeTool(
        'agent_handoff',
        invalidHandoffParams,
        { userId: 'user-123' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize user input messages', async () => {
      const maliciousInput = '<script>alert("xss")</script>Help me with budget';
      
      const result = await agentRegistry.runAgent(
        'financial_advisor',
        maliciousInput,
        { userId: 'user-123' }
      );

      // Should not contain script tags in response
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert(');
    });

    it('should handle SQL injection attempts in parameters', async () => {
      const maliciousParams = {
        userId: "user-123'; DROP TABLE users; --",
        description: "Store'; DELETE FROM transactions; --",
      };

      const result = await toolRegistry.executeTool(
        'categorize_transaction',
        maliciousParams,
        { userId: 'user-123' }
      );

      // Should handle gracefully without executing malicious SQL
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    it('should validate envelope creation with proper limits', async () => {
      const extremelyLargeEnvelope = {
        userId: 'user-123',
        name: 'A'.repeat(1000), // Very long name
        targetAmount: Number.MAX_SAFE_INTEGER + 1, // Too large amount
        category: 'X'.repeat(100), // Very long category
      };

      const result = await toolRegistry.executeTool(
        'create_envelope',
        extremelyLargeEnvelope,
        { userId: 'user-123' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });
  });

  describe('Type Safety Validation', () => {
    it('should enforce type safety in agent responses', () => {
      const typeUnsafeResponse = {
        response: 123, // Should be string
        confidence: '85%', // Should be number
        suggestedActions: 'create envelope', // Should be array
      };

      const result = AgentResponseSchema.safeParse(typeUnsafeResponse);
      expect(result.success).toBe(false);
    });

    it('should enforce type safety in financial context', () => {
      const typeUnsafeContext = {
        userId: 123, // Should be string
        totalIncome: '5000', // Should be number
        envelopes: 'no envelopes', // Should be array
      };

      const result = FinancialContextSchema.safeParse(typeUnsafeContext);
      expect(result.success).toBe(false);
    });
  });

  describe('Business Logic Validation', () => {
    it('should validate financial constraints', async () => {
      const invalidTransfer = {
        userId: 'user-123',
        fromEnvelopeId: 'env-1',
        toEnvelopeId: 'env-2',
        amount: -100, // Negative transfer amount
      };

      const result = await toolRegistry.executeTool(
        'transfer_funds',
        invalidTransfer,
        { userId: 'user-123' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('positive amount');
    });

    it('should validate budget constraints', async () => {
      const impossibleBudget = {
        userId: 'user-123',
        name: 'Impossible Envelope',
        targetAmount: -1000, // Negative budget target
        initialBalance: 5000, // More balance than target
      };

      const result = await toolRegistry.executeTool(
        'create_envelope',
        impossibleBudget,
        { userId: 'user-123' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
    });

    it('should validate date constraints', async () => {
      const invalidDateGoal = {
        userId: 'user-123',
        description: 'Past Goal',
        targetAmount: 1000,
        targetDate: '2020-01-01', // Past date
      };

      const result = await toolRegistry.executeTool(
        'track_achievements',
        invalidDateGoal,
        { userId: 'user-123' }
      );

      // Should handle past dates gracefully
      expect(result.success).toBe(true);
      if (result.success && result.result.warnings) {
        expect(result.result.warnings).toContain('past date');
      }
    });
  });
});
