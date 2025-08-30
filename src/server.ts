import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { db } from './lib/db.js';
import { configureOpenAIFromEnv } from './lib/openai.js';
import { globalAIBrain } from './lib/ai/globalAIBrain.js';

// Import routes
import authRoutes from './routes/auth.js';
import onboardingRoutes from './routes/onboarding.js';
import aiRoutes from './routes/ai.js';
import envelopeRoutes from './routes/envelopes.js';
import transactionRoutes from './routes/transactions.js';
import transferRoutes from './routes/transfers.js';
import cardRoutes from './routes/cards.js';
import ruleRoutes from './routes/rules.js';
import eventRoutes from './routes/events.js';
import kycRoutes from './routes/kyc.js';
import plaidRoutes from './routes/plaid.js';
import billRoutes from './routes/bills.js';
import mccRoutes from './routes/mcc.js';
import creditCardRoutes from './routes/credit-cards.js';
import creatorRoutes from './routes/creator.js';
import voiceOnboardingRoutes from './routes/voice-onboarding.js';
import serviceAccountRoutes from './routes/service-accounts.js';
import testVoiceKYCRoutes from './routes/test-voice-kyc.js';

// Initialize agent registry
import { agentRegistry } from './agents/agentRegistry.js';

// Ensure agent registry is initialized
if (!agentRegistry.isInitialized()) {
  throw new Error('Agent registry failed to initialize');
}

const app = express();

// Middleware
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? ['https://your-production-domain.com']
    : true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    service: 'envelope-budgeting-api',
    version: '1.0.0',
    environment: env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/ai', aiRoutes); // Enhanced with financial coaching
app.use('/api/envelopes', envelopeRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/plaid', plaidRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/mcc', mccRoutes);
app.use('/api/credit-cards', creditCardRoutes);
app.use('/api/creator', creatorRoutes);
app.use('/api/voice-onboarding', voiceOnboardingRoutes);
app.use('/api/service-accounts', serviceAccountRoutes);
app.use('/api/test-voice-kyc', testVoiceKYCRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  }, 'Unhandled error');

  res.status(err.status || 500).json({
    ok: false,
    error: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Route not found',
    code: 'NOT_FOUND'
  });
});

async function startServer() {
  try {
    // Test database connection
    await db.$connect();
    logger.info('Database connected successfully');

    // Initialize Global AI Brain
    try {
      await globalAIBrain.initialize();
      logger.info('Global AI Brain initialized successfully');
    } catch (aiError) {
      logger.warn({ error: aiError }, 'Global AI Brain initialization failed, continuing without AI features');
    }

    // Configure OpenAI
    const openaiConfigured = configureOpenAIFromEnv();
    if (openaiConfigured) {
      logger.info('OpenAI configured successfully');
    } else {
      logger.warn('OpenAI configuration failed - AI features may not work');
    }

    // Start server
    const server = app.listen(env.PORT, '0.0.0.0', () => {
      logger.info({
        port: env.PORT,
        environment: env.NODE_ENV,
        features: {
          ai: openaiConfigured,
          coaching: openaiConfigured,
          database: true,
        }
      }, 'Server started successfully');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down server...');
      server.close(() => {
        db.$disconnect();
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Only start server if not in test mode
if (process.env.TEST_MODE !== 'true') {
  startServer();
}

// Export app for testing
export default app;