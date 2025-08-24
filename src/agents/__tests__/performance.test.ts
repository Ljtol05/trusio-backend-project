
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { agentRegistry } from '../agentRegistry.js';
import { toolRegistry } from '../tools/registry.js';
import type { FinancialContext } from '../tools/types.js';

// Performance test utilities
const measureExecutionTime = async (fn: () => Promise<any>): Promise<{ result: any; duration: number }> => {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
};

const runConcurrentOperations = async <T>(operations: (() => Promise<T>)[], concurrency: number = 5): Promise<T[]> => {
  const results: T[] = [];
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(op => op()));
    results.push(...batchResults);
  }
  return results;
};

// Mock dependencies
vi.mock('@openai/agents', () => ({
  Agent: vi.fn().mockImplementation((config) => ({
    name: config.name,
    instructions: config.instructions,
  })),
  run: vi.fn().mockImplementation(async () => {
    // Simulate variable response times
    const delay = Math.random() * 100 + 50; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, delay));
    return 'Performance test response';
  }),
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

describe('Agent Performance Tests', () => {
  let mockContext: FinancialContext;

  beforeEach(() => {
    mockContext = {
      userId: 'perf-test-user',
      totalIncome: 5000,
      totalExpenses: 3000,
      envelopes: Array.from({ length: 10 }, (_, i) => ({
        id: `env-${i}`,
        name: `Envelope ${i}`,
        balance: Math.random() * 1000,
        target: Math.random() * 1200,
        category: ['food', 'transport', 'entertainment', 'utilities'][i % 4],
      })),
      transactions: Array.from({ length: 100 }, (_, i) => ({
        id: `txn-${i}`,
        amount: -(Math.random() * 200),
        description: `Transaction ${i}`,
        category: ['food', 'transport', 'entertainment'][i % 3],
        date: new Date(Date.now() - i * 86400000).toISOString(),
      })),
      goals: Array.from({ length: 5 }, (_, i) => ({
        id: `goal-${i}`,
        description: `Goal ${i}`,
        targetAmount: Math.random() * 10000,
        currentAmount: Math.random() * 5000,
      })),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent Response Times', () => {
    it('should respond within acceptable time limits', async () => {
      const maxAcceptableTime = 2000; // 2 seconds

      const { duration } = await measureExecutionTime(() =>
        agentRegistry.runAgent('financial_advisor', 'Quick budget advice', mockContext)
      );

      expect(duration).toBeLessThan(maxAcceptableTime);
    });

    it('should handle multiple concurrent agent requests', async () => {
      const concurrentRequests = 10;
      const maxTotalTime = 5000; // 5 seconds for all requests

      const operations = Array.from({ length: concurrentRequests }, (_, i) => () =>
        agentRegistry.runAgent('financial_advisor', `Request ${i}`, mockContext)
      );

      const { duration } = await measureExecutionTime(() =>
        runConcurrentOperations(operations, 5)
      );

      expect(duration).toBeLessThan(maxTotalTime);
    });

    it('should maintain performance with large financial context', async () => {
      const largeContext: FinancialContext = {
        ...mockContext,
        envelopes: Array.from({ length: 100 }, (_, i) => ({
          id: `env-${i}`,
          name: `Large Envelope ${i}`,
          balance: Math.random() * 1000,
          target: Math.random() * 1200,
          category: 'test',
        })),
        transactions: Array.from({ length: 1000 }, (_, i) => ({
          id: `txn-${i}`,
          amount: -(Math.random() * 200),
          description: `Large Transaction ${i}`,
          category: 'test',
          date: new Date(Date.now() - i * 86400000).toISOString(),
        })),
      };

      const maxTimeWithLargeContext = 3000; // 3 seconds

      const { duration } = await measureExecutionTime(() =>
        agentRegistry.runAgent('transaction_analyst', 'Analyze large dataset', largeContext)
      );

      expect(duration).toBeLessThan(maxTimeWithLargeContext);
    });
  });

  describe('Tool Performance', () => {
    it('should execute tools within acceptable time limits', async () => {
      const maxToolExecutionTime = 1000; // 1 second per tool

      const tools = ['budget_analysis', 'spending_patterns', 'categorize_transaction'];

      for (const toolName of tools) {
        const { duration } = await measureExecutionTime(() =>
          toolRegistry.executeTool(toolName, { userId: mockContext.userId }, mockContext)
        );

        expect(duration).toBeLessThan(maxToolExecutionTime);
      }
    });

    it('should handle concurrent tool executions', async () => {
      const concurrentTools = 20;
      const operations = Array.from({ length: concurrentTools }, (_, i) => () =>
        toolRegistry.executeTool(
          'budget_analysis',
          { userId: mockContext.userId },
          { ...mockContext, sessionId: `session-${i}` }
        )
      );

      const { duration, result } = await measureExecutionTime(() =>
        runConcurrentOperations(operations, 5)
      );

      expect(duration).toBeLessThan(5000); // 5 seconds total
      expect(result).toHaveLength(concurrentTools);
      result.forEach((toolResult: any) => {
        expect(toolResult.success).toBe(true);
      });
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should not leak memory during repeated operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 50;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Run multiple agent operations
      for (let i = 0; i < iterations; i++) {
        await agentRegistry.runAgent(
          'financial_advisor',
          `Memory test iteration ${i}`,
          mockContext
        );
      }

      // Force garbage collection again
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const maxAcceptableIncrease = 50 * 1024 * 1024; // 50MB

      expect(memoryIncrease).toBeLessThan(maxAcceptableIncrease);
    });

    it('should handle agent registry operations efficiently', async () => {
      const operations = 1000;
      const maxTime = 1000; // 1 second for 1000 operations

      const { duration } = await measureExecutionTime(async () => {
        for (let i = 0; i < operations; i++) {
          agentRegistry.getAgent('financial_advisor');
          agentRegistry.getAgentCapabilities('budget_coach');
          agentRegistry.routeToAgent(`Test message ${i}`);
        }
      });

      expect(duration).toBeLessThan(maxTime);
    });
  });

  describe('Stress Testing', () => {
    it('should handle high-frequency agent requests', async () => {
      const requestsPerSecond = 50;
      const testDurationSeconds = 5;
      const totalRequests = requestsPerSecond * testDurationSeconds;

      const startTime = Date.now();
      const operations = Array.from({ length: totalRequests }, (_, i) => () =>
        agentRegistry.runAgent('financial_advisor', `Stress test ${i}`, mockContext)
      );

      const results = await runConcurrentOperations(operations, 10);
      const endTime = Date.now();
      const actualDuration = (endTime - startTime) / 1000;

      expect(results).toHaveLength(totalRequests);
      expect(actualDuration).toBeLessThan(testDurationSeconds + 2); // Allow 2 second buffer
      
      // Check that most requests succeeded
      const successfulResults = results.filter(r => typeof r === 'string');
      const successRate = successfulResults.length / totalRequests;
      expect(successRate).toBeGreaterThan(0.95); // 95% success rate
    });

    it('should gracefully degrade under extreme load', async () => {
      const extremeLoad = 200;
      const operations = Array.from({ length: extremeLoad }, (_, i) => () =>
        agentRegistry.runAgent('financial_advisor', `Extreme load test ${i}`, mockContext)
      );

      // Should not crash under extreme load
      const results = await runConcurrentOperations(operations, 20);
      
      expect(results).toHaveLength(extremeLoad);
      
      // Some requests might fail under extreme load, but system should remain stable
      const successfulResults = results.filter(r => typeof r === 'string');
      const successRate = successfulResults.length / extremeLoad;
      expect(successRate).toBeGreaterThan(0.7); // 70% success rate under extreme load
    });
  });

  describe('Edge Cases and Resilience', () => {
    it('should handle malformed context gracefully', async () => {
      const malformedContext = {
        ...mockContext,
        envelopes: null as any,
        transactions: undefined as any,
      };

      const { duration } = await measureExecutionTime(() =>
        agentRegistry.runAgent('financial_advisor', 'Handle malformed context', malformedContext)
      );

      expect(duration).toBeLessThan(2000);
    });

    it('should handle very long messages efficiently', async () => {
      const longMessage = 'A'.repeat(10000); // 10KB message
      const maxTime = 3000; // 3 seconds

      const { duration } = await measureExecutionTime(() =>
        agentRegistry.runAgent('financial_advisor', longMessage, mockContext)
      );

      expect(duration).toBeLessThan(maxTime);
    });

    it('should maintain performance with frequent agent switching', async () => {
      const agents = ['financial_advisor', 'budget_coach', 'transaction_analyst', 'insight_generator'];
      const switches = 100;
      const maxTime = 2000; // 2 seconds

      const { duration } = await measureExecutionTime(async () => {
        for (let i = 0; i < switches; i++) {
          const agent = agents[i % agents.length];
          await agentRegistry.runAgent(agent, `Switch test ${i}`, mockContext);
        }
      });

      expect(duration).toBeLessThan(maxTime);
    });
  });
});
