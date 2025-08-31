import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FinancialContext, ToolExecutionContext } from '../tools/types.ts';

// Mock database before other imports
export const mockDbResponses = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
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
  conversation: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    count: vi.fn(),
  },
};

// Mock database
vi.mock('../../lib/db.ts', () => ({
  db: mockDbResponses,
}));

// Mock logger
vi.mock('../../lib/logger.ts', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock OpenAI Agents SDK
export const mockAgentsSDK = {
  run: vi.fn().mockResolvedValue('Mocked agent response'),
  Agent: vi.fn().mockImplementation((config) => ({
    name: config.name,
    instructions: config.instructions,
    model: config.model,
    tools: config.tools || [],
    run: vi.fn().mockResolvedValue({
      success: true,
      response: 'Mock agent response',
      duration: 1000,
      timestamp: new Date(),
    }),
    isReady: vi.fn().mockReturnValue(true),
    getCapabilities: vi.fn().mockReturnValue(['financial_analysis', 'budget_coaching']),
  })),
  run: vi.fn().mockResolvedValue({
    success: true,
    response: 'Mock agent response',
    duration: 1000,
    timestamp: new Date(),
  }),
  tool: vi.fn().mockImplementation((config) => ({
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute || vi.fn().mockResolvedValue({ success: true, result: 'Mock tool result' }),
  })),
  defineTool: vi.fn().mockImplementation((config) => ({
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute || vi.fn().mockResolvedValue({ success: true, result: 'Mock tool result' }),
  })),
  setDefaultOpenAIKey: vi.fn(),
  setDefaultOpenAIClient: vi.fn(),
  setOpenAIAPI: vi.fn(),
};

vi.mock('@openai/agents', () => mockAgentsSDK);

// Mock OpenAI lib with ALL required exports
vi.mock('../../lib/openai.ts', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Mocked OpenAI response' } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
      },
    },
  },
  createAgentResponse: vi.fn().mockResolvedValue('Mocked agent response'),
  configureOpenAIFromEnv: vi.fn().mockReturnValue(true),
  MODELS: {
    agentic: 'gpt-4o',
    primary: 'gpt-4o-mini',
    analysis: 'gpt-4o-mini',
    budget: 'gpt-4o-mini',
  },
}));

// Mock external email service
vi.mock('../../lib/email.ts', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock Plaid service
vi.mock('../../lib/plaid.ts', () => ({
  plaidClient: {
    linkTokenCreate: vi.fn().mockResolvedValue({ link_token: 'mock_link_token' }),
    itemPublicTokenExchange: vi.fn().mockResolvedValue({ access_token: 'mock_access_token' }),
    transactionsGet: vi.fn().mockResolvedValue({ transactions: [] }),
  },
}));

// Mock Twilio service
vi.mock('../../lib/twilio.ts', () => ({
  twilioClient: {
    verify: {
      services: vi.fn().mockReturnValue({
        verifications: {
          create: vi.fn().mockResolvedValue({ status: 'pending' }),
        },
        verificationChecks: {
          create: vi.fn().mockResolvedValue({ status: 'approved' }),
        },
      }),
    },
  },
}));

// Mock server startup to prevent actual server from running during tests
vi.mock('../../server.ts', async (importOriginal) => {
  const actual = await importOriginal();
  // Return the actual app but prevent server startup
  process.env.TEST_MODE = 'true';
  return actual;
});

// Mock environment configuration
vi.mock('../../config/env.ts', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 5000,
    DATABASE_URL: 'file:./test.db',
    JWT_SECRET: 'test-jwt-secret',
    OPENAI_API_KEY: 'test-key',
    OPENAI_PROJECT_ID: 'test-project',
    OPENAI_ORG_ID: 'test-org',
    OPENAI_MODEL_PRIMARY: 'gpt-4o-mini',
    OPENAI_MODEL_AGENTIC: 'gpt-4o',
    OPENAI_MODEL_ANALYSIS: 'gpt-4o-mini',
    OPENAI_MODEL_BUDGET: 'gpt-4o-mini',
    OPENAI_TIMEOUT_MS: 60000,
    OPENAI_MAX_RETRIES: 3,
    OPENAI_AGENTS_TRACING_ENABLED: false,
    OPENAI_AGENTS_API_TYPE: 'chat_completions',
  },
  openai: null,
  isAIEnabled: vi.fn().mockReturnValue(false),
}));

// Mock global AI brain to prevent initialization during tests
vi.mock('../../lib/ai/globalAIBrain.ts', () => ({
  globalAIBrain: {
    initialize: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    query: vi.fn().mockResolvedValue('Mock AI response'),
  },
}));

// Prevent process.exit during tests
const originalExit = process.exit;
beforeAll(() => {
  // Initialize test environment
  process.env.NODE_ENV = 'test';
  process.env.TEST_MODE = 'true';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_PROJECT_ID = 'test-project';
  process.env.OPENAI_ORG_ID = 'test-org';
  process.env.OPENAI_MODEL_AGENTIC = 'gpt-4o';
  process.env.OPENAI_MODEL_PRIMARY = 'gpt-4o-mini';
  process.env.JWT_SECRET = 'test-jwt-secret';

  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Mock process.exit to prevent test termination
  process.exit = vi.fn().mockImplementation((code) => {
    throw new Error(`Process exit called with code: ${code}`);
  }) as any;
});

afterAll(() => {
  vi.restoreAllMocks();
  process.exit = originalExit;
});

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
  vi.clearAllTimers();

  // Reset agent system state
  mockDbResponses.conversation.findMany.mockResolvedValue([]);
  mockDbResponses.conversation.createMany.mockResolvedValue({ count: 2 });
  mockDbResponses.conversation.count.mockResolvedValue(0);

  // Reset database mocks to default state
  mockDbResponses.user.findUnique.mockResolvedValue(createMockUser());
  mockDbResponses.envelope.findMany.mockResolvedValue([createMockEnvelope()]);
  mockDbResponses.transaction.findMany.mockResolvedValue([createMockTransaction()]);
  mockDbResponses.goal.findMany.mockResolvedValue([createMockGoal()]);
});

afterEach(() => {
  // Cleanup after each test
  vi.clearAllTimers();
  vi.unstubAllEnvs();
  
  // Ensure no pending promises or async operations
  return new Promise(resolve => setImmediate(resolve));
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