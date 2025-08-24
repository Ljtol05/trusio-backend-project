
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server.js';
import { db } from '../../lib/db.js';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

// Mock OpenAI Agents SDK
vi.mock('@openai/agents', () => ({
  Agent: vi.fn().mockImplementation((config) => ({
    name: config.name,
    instructions: config.instructions,
    model: config.model,
    tools: config.tools,
  })),
  run: vi.fn().mockResolvedValue('AI-generated financial advice response'),
  tool: vi.fn(),
}));

// Mock database operations
vi.mock('../../lib/db.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
    },
    envelope: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    goal: {
      findMany: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('Agent API Integration Tests', () => {
  let authToken: string;
  let mockUser: any;

  beforeEach(() => {
    mockUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User',
      isEmailVerified: true,
    };

    authToken = jwt.sign(
      { userId: mockUser.id, email: mockUser.email },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Setup common mocks
    vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(db.envelope.findMany).mockResolvedValue([
      {
        id: 'env-1',
        name: 'Groceries',
        balance: 500,
        targetAmount: 600,
        category: 'food',
        userId: mockUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(db.transaction.findMany).mockResolvedValue([
      {
        id: 'txn-1',
        amount: -50,
        description: 'Whole Foods',
        category: 'food',
        userId: mockUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        envelopeId: 'env-1',
        type: 'expense',
        merchantName: 'Whole Foods',
        metadata: {},
      },
    ]);
    vi.mocked(db.goal.findMany).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/ai/chat', () => {
    it('should handle basic chat request successfully', async () => {
      vi.mocked(db.conversation.createMany).mockResolvedValue({ count: 2 });

      const response = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'Help me understand my budget',
          sessionId: 'test-session-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.response).toBeDefined();
      expect(response.body.agentName).toBe('financial_advisor');
      expect(response.body.sessionId).toBe('test-session-123');
    });

    it('should route to appropriate agent based on message', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'I need help creating a budget for my expenses',
          agentName: 'budget_coach',
        });

      expect(response.status).toBe(200);
      expect(response.body.agentName).toBe('budget_coach');
    });

    it('should include conversation history when requested', async () => {
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        {
          id: 'conv-1',
          userId: mockUser.id,
          sessionId: 'test-session',
          role: 'user',
          content: 'Previous message',
          agentName: 'financial_advisor',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const response = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'Continue our conversation',
          sessionId: 'test-session',
          context: {
            includeHistory: true,
            maxHistory: 5,
          },
        });

      expect(response.status).toBe(200);
      expect(db.conversation.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, sessionId: 'test-session' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          role: true,
          content: true,
          createdAt: true,
        },
      });
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: '', // Empty message should fail validation
        });

      expect(response.status).toBe(400);
      expect(response.body.ok).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          message: 'Help me with my budget',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/ai/tools/execute', () => {
    it('should execute tool directly', async () => {
      const response = await request(app)
        .post('/api/ai/tools/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolName: 'budget_analysis',
          parameters: { userId: mockUser.id },
          agentContext: {
            agentName: 'budget_coach',
            sessionId: 'test-session',
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.toolName).toBe('budget_analysis');
      expect(response.body.result).toBeDefined();
    });

    it('should handle tool execution errors', async () => {
      const response = await request(app)
        .post('/api/ai/tools/execute')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          toolName: 'non_existent_tool',
          parameters: {},
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Tool not found');
    });
  });

  describe('POST /api/ai/handoff', () => {
    it('should handle agent handoff successfully', async () => {
      const response = await request(app)
        .post('/api/ai/handoff')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromAgent: 'financial_advisor',
          toAgent: 'budget_coach',
          message: 'Help me create a detailed budget',
          reason: 'User needs specialized budgeting assistance',
          priority: 'high',
        });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.handoffCompleted).toBe(true);
      expect(response.body.fromAgent).toBe('financial_advisor');
      expect(response.body.toAgent).toBe('budget_coach');
    });

    it('should validate agent names in handoff', async () => {
      const response = await request(app)
        .post('/api/ai/handoff')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromAgent: 'invalid_agent',
          toAgent: 'budget_coach',
          message: 'Test message',
          reason: 'Test reason',
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_AGENTS');
    });
  });

  describe('GET /api/ai/agents', () => {
    it('should return list of available agents', async () => {
      const response = await request(app)
        .get('/api/ai/agents')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.agents).toBeInstanceOf(Array);
      expect(response.body.agents.length).toBeGreaterThan(0);
      expect(response.body.defaultAgent).toBe('financial_advisor');

      const agents = response.body.agents;
      const agentNames = agents.map((a: any) => a.name);
      expect(agentNames).toContain('financial_advisor');
      expect(agentNames).toContain('budget_coach');
      expect(agentNames).toContain('transaction_analyst');
      expect(agentNames).toContain('insight_generator');
    });
  });

  describe('GET /api/ai/tools', () => {
    it('should return list of available tools', async () => {
      const response = await request(app)
        .get('/api/ai/tools')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.tools).toBeInstanceOf(Array);
      expect(response.body.categories).toBeInstanceOf(Array);
      expect(response.body.totalTools).toBeGreaterThan(0);
    });

    it('should filter tools by category', async () => {
      const response = await request(app)
        .get('/api/ai/tools?category=budget')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.tools.every((tool: any) => tool.category === 'budget')).toBe(true);
    });
  });

  describe('GET /api/ai/sessions/:sessionId/history', () => {
    it('should return conversation history', async () => {
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        {
          id: 'conv-1',
          userId: mockUser.id,
          sessionId: 'test-session',
          role: 'user',
          content: 'Hello',
          agentName: 'financial_advisor',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      vi.mocked(db.conversation.count).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/ai/sessions/test-session/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.history).toBeInstanceOf(Array);
      expect(response.body.sessionId).toBe('test-session');
      expect(response.body.pagination).toBeDefined();
    });
  });

  describe('GET /api/ai/status', () => {
    it('should return system status', async () => {
      const response = await request(app)
        .get('/api/ai/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.status).toBe('operational');
      expect(response.body.agents).toBeDefined();
      expect(response.body.tools).toBeDefined();
      expect(response.body.manager).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      vi.mocked(db.envelope.findMany).mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'Help me with my budget',
        });

      expect(response.status).toBe(500);
      expect(response.body.ok).toBe(false);
      expect(response.body.code).toBe('AGENT_ERROR');
    });

    it('should handle agent unavailability', async () => {
      const { run } = await import('@openai/agents');
      vi.mocked(run).mockRejectedValue(new Error('Agent service unavailable'));

      const response = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: 'Help me with my budget',
        });

      expect(response.status).toBe(500);
      expect(response.body.code).toBe('AGENT_ERROR');
    });
  });
});
