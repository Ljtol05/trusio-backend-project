
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FinancialContext, ToolExecutionContext } from '../tools/types.js';

// Global test setup
beforeAll(async () => {
  // Initialize test environment
  process.env.NODE_ENV = 'test';
  process.env.OPENAI_API_KEY = 'test-key';
  
  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  // Cleanup after all tests
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
  vi.clearAllTimers();
});

// Test utilities
export const createMockFinancialContext = (overrides: Partial<FinancialContext> = {}): FinancialContext => ({
  userId: 'test-user-123',
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
    {
      id: 'env-2',
      name: 'Transportation',
      balance: 200,
      target: 300,
      category: 'transport',
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
    {
      id: 'txn-2',
      amount: -25,
      description: 'Gas Station',
      category: 'transport',
      date: '2024-01-14T15:30:00Z',
    },
  ],
  goals: [
    {
      id: 'goal-1',
      description: 'Emergency Fund',
      targetAmount: 10000,
      currentAmount: 2500,
      deadline: '2024-12-31T23:59:59Z',
    },
  ],
  riskTolerance: 'moderate',
  timeHorizon: 'long',
  ...overrides,
});

export const createMockToolExecutionContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
  ...createMockFinancialContext(),
  sessionId: 'test-session-123',
  agentName: 'test-agent',
  timestamp: new Date(),
  userProfile: {
    id: 'test-user-123',
    name: 'Test User',
    email: 'test@example.com',
  },
  ...overrides,
});

export const createMockUser = () => ({
  id: 'test-user-123',
  email: 'test@example.com',
  name: 'Test User',
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

export const createMockEnvelope = (overrides: any = {}) => ({
  id: 'test-envelope-123',
  name: 'Test Envelope',
  balance: 500,
  targetAmount: 600,
  category: 'test',
  userId: 'test-user-123',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockTransaction = (overrides: any = {}) => ({
  id: 'test-transaction-123',
  amount: -50,
  description: 'Test Transaction',
  category: 'test',
  userId: 'test-user-123',
  envelopeId: 'test-envelope-123',
  type: 'expense',
  merchantName: 'Test Merchant',
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockGoal = (overrides: any = {}) => ({
  id: 'test-goal-123',
  description: 'Test Goal',
  targetAmount: 1000,
  currentAmount: 250,
  targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
  userId: 'test-user-123',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Mock database responses
export const mockDbResponses = {
  user: {
    findUnique: vi.fn().mockResolvedValue(createMockUser()),
  },
  envelope: {
    findMany: vi.fn().mockResolvedValue([createMockEnvelope()]),
    findUnique: vi.fn().mockResolvedValue(createMockEnvelope()),
    create: vi.fn().mockResolvedValue(createMockEnvelope()),
    update: vi.fn().mockResolvedValue(createMockEnvelope()),
    delete: vi.fn().mockResolvedValue(createMockEnvelope()),
  },
  transaction: {
    findMany: vi.fn().mockResolvedValue([createMockTransaction()]),
    create: vi.fn().mockResolvedValue(createMockTransaction()),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue(createMockTransaction()),
  },
  goal: {
    findMany: vi.fn().mockResolvedValue([createMockGoal()]),
    create: vi.fn().mockResolvedValue(createMockGoal()),
    update: vi.fn().mockResolvedValue(createMockGoal()),
  },
  conversation: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    createMany: vi.fn().mockResolvedValue({ count: 2 }),
    count: vi.fn().mockResolvedValue(0),
  },
};

// Mock OpenAI Agents SDK
export const mockAgentsSDK = {
  Agent: vi.fn().mockImplementation((config) => ({
    name: config.name,
    instructions: config.instructions,
    model: config.model,
    tools: config.tools,
  })),
  run: vi.fn().mockResolvedValue('Mock agent response'),
  tool: vi.fn().mockImplementation((config) => ({
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    handler: config.handler,
  })),
};

// Test assertion helpers
export const expectValidResponse = (response: any) => {
  expect(response).toBeDefined();
  expect(typeof response).toBe('object');
  expect(response.ok).toBe(true);
};

export const expectValidAgentResponse = (response: any) => {
  expect(response).toBeDefined();
  expect(typeof response).toBe('string');
  expect(response.length).toBeGreaterThan(0);
};

export const expectValidToolResult = (result: any) => {
  expect(result).toBeDefined();
  expect(typeof result).toBe('object');
  expect(result).toHaveProperty('success');
  expect(result).toHaveProperty('result');
  expect(result).toHaveProperty('duration');
  expect(result).toHaveProperty('timestamp');
};

// Performance testing utilities
export const measureExecutionTime = async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
};

export const runWithTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

// Error simulation utilities
export const simulateNetworkError = () => {
  const error = new Error('Network request failed');
  (error as any).code = 'NETWORK_ERROR';
  throw error;
};

export const simulateDatabaseError = () => {
  const error = new Error('Database connection failed');
  (error as any).code = 'DATABASE_ERROR';
  throw error;
};

export const simulateValidationError = (field: string) => {
  const error = new Error(`Validation failed for field: ${field}`);
  (error as any).code = 'VALIDATION_ERROR';
  throw error;
};
