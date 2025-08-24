
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FinancialContext, ToolExecutionContext } from '../tools/types.js';

// Setup mocks before any imports
const mockDb = {
  envelope: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  goal: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../../lib/db.js', () => ({
  db: mockDb,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Now import the tool registry after mocks are set up
const { toolRegistry } = await import('../tools/registry.js');

describe('Financial Tools', () => {
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    mockContext = {
      userId: 'test-user-123',
      sessionId: 'test-session',
      agentName: 'test-agent',
      timestamp: new Date(),
      userProfile: {
        id: 'test-user-123',
        name: 'Test User',
        email: 'test@example.com',
      },
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
          description: 'Grocery Store',
          category: 'food',
          date: '2024-01-15T10:00:00Z',
        },
      ],
      goals: [],
    };

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('Tool Registry', () => {
    it('should have all required tools registered', () => {
      const tools = toolRegistry.getAllTools();
      
      // Budget tools
      expect(tools).toHaveProperty('budget_analysis');
      expect(tools).toHaveProperty('spending_patterns');
      expect(tools).toHaveProperty('variance_calculation');

      // Envelope tools
      expect(tools).toHaveProperty('create_envelope');
      expect(tools).toHaveProperty('transfer_funds');
      expect(tools).toHaveProperty('manage_balance');

      // Transaction tools
      expect(tools).toHaveProperty('categorize_transaction');
      expect(tools).toHaveProperty('auto_allocate');
      expect(tools).toHaveProperty('analyze_spending_patterns');

      // Analysis tools
      expect(tools).toHaveProperty('analyze_trends');
      expect(tools).toHaveProperty('analyze_budget_variance');

      // Insight tools
      expect(tools).toHaveProperty('generate_recommendations');
      expect(tools).toHaveProperty('identify_opportunities');
      expect(tools).toHaveProperty('track_achievements');

      // Handoff tool
      expect(tools).toHaveProperty('agent_handoff');
    });

    it('should return correct tool count', () => {
      const count = toolRegistry.getToolCount();
      expect(count).toBeGreaterThan(10);
    });
  });

  describe('Budget Tools', () => {
    it('should execute budget analysis tool successfully', async () => {
      mockDb.envelope.findMany.mockResolvedValue([
        { id: 'env-1', name: 'Groceries', balance: 500, targetAmount: 600 },
        { id: 'env-2', name: 'Gas', balance: 150, targetAmount: 200 },
      ]);

      const result = await toolRegistry.executeTool(
        'budget_analysis',
        { userId: mockContext.userId },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(mockDb.envelope.findMany).toHaveBeenCalledWith({
        where: { userId: mockContext.userId },
      });
    });

    it('should handle budget analysis errors gracefully', async () => {
      mockDb.envelope.findMany.mockRejectedValue(new Error('Database error'));

      const result = await toolRegistry.executeTool(
        'budget_analysis',
        { userId: mockContext.userId },
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });

  describe('Envelope Tools', () => {
    it('should create envelope successfully', async () => {
      mockDb.envelope.create.mockResolvedValue({
        id: 'new-env',
        name: 'Entertainment',
        balance: 0,
        targetAmount: 300,
      });

      const result = await toolRegistry.executeTool(
        'create_envelope',
        {
          userId: mockContext.userId,
          name: 'Entertainment',
          targetAmount: 300,
          category: 'leisure',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('id', 'new-env');
      expect(mockDb.envelope.create).toHaveBeenCalled();
    });

    it('should transfer funds between envelopes', async () => {
      mockDb.envelope.findUnique
        .mockResolvedValueOnce({ id: 'env-1', balance: 500 })
        .mockResolvedValueOnce({ id: 'env-2', balance: 100 });

      mockDb.envelope.update
        .mockResolvedValueOnce({ id: 'env-1', balance: 400 })
        .mockResolvedValueOnce({ id: 'env-2', balance: 200 });

      const result = await toolRegistry.executeTool(
        'transfer_funds',
        {
          userId: mockContext.userId,
          fromEnvelopeId: 'env-1',
          toEnvelopeId: 'env-2',
          amount: 100,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(mockDb.envelope.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('Transaction Tools', () => {
    it('should categorize transactions correctly', async () => {
      const result = await toolRegistry.executeTool(
        'categorize_transaction',
        {
          userId: mockContext.userId,
          description: 'Whole Foods Market',
          amount: -75.50,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('category');
      expect(result.result).toHaveProperty('confidence');
    });

    it('should analyze spending patterns', async () => {
      mockDb.transaction.findMany.mockResolvedValue([
        { amount: -50, category: 'food', createdAt: new Date() },
        { amount: -30, category: 'food', createdAt: new Date() },
        { amount: -100, category: 'transport', createdAt: new Date() },
      ]);

      const result = await toolRegistry.executeTool(
        'analyze_spending_patterns',
        { userId: mockContext.userId },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('patterns');
      expect(result.result).toHaveProperty('insights');
    });
  });

  describe('Analysis Tools', () => {
    it('should analyze budget variance', async () => {
      mockDb.envelope.findMany.mockResolvedValue([
        { name: 'Groceries', balance: 500, targetAmount: 600 },
        { name: 'Gas', balance: 250, targetAmount: 200 },
      ]);

      const result = await toolRegistry.executeTool(
        'analyze_budget_variance',
        { userId: mockContext.userId },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('variances');
      expect(result.result).toHaveProperty('summary');
    });
  });

  describe('Insight Tools', () => {
    it('should generate personalized recommendations', async () => {
      const result = await toolRegistry.executeTool(
        'generate_recommendations',
        { userId: mockContext.userId },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('recommendations');
      expect(Array.isArray(result.result.recommendations)).toBe(true);
    });

    it('should identify financial opportunities', async () => {
      const result = await toolRegistry.executeTool(
        'identify_opportunities',
        { userId: mockContext.userId },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('opportunities');
    });
  });

  describe('Agent Handoff Tool', () => {
    it('should execute agent handoff successfully', async () => {
      const result = await toolRegistry.executeTool(
        'agent_handoff',
        {
          fromAgent: 'financial_advisor',
          toAgent: 'budget_coach',
          reason: 'User needs specialized budgeting help',
          context: { userGoal: 'create monthly budget' },
          priority: 'high',
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty('handoffCompleted', true);
      expect(result.result).toHaveProperty('targetAgent', 'budget_coach');
    });
  });

  describe('Tool Error Handling', () => {
    it('should handle non-existent tool gracefully', async () => {
      const result = await toolRegistry.executeTool(
        'non_existent_tool',
        {},
        mockContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
    });

    it('should handle tool execution timeout', async () => {
      // Mock a slow tool
      const slowTool = {
        tool: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10000))),
        description: 'Slow tool',
        category: 'test',
      };

      toolRegistry['tools'].set('slow_tool', slowTool);

      const result = await toolRegistry.executeTool(
        'slow_tool',
        {},
        { ...mockContext, timeout: 100 }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });
});
