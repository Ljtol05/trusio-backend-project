import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './lib/logger.js';
import { db } from './lib/db.js';
import { env } from './config/env.js';
import { globalAIBrain } from './lib/vectorstore.js';
import { registerAllTools } from './agents/tools/index.js';

// Import routes
import authRoutes from './routes/auth.js';
import aiRoutes from './routes/ai.js';
import onboardingRoutes from './routes/onboarding.js';
import mccRoutes from './routes/mcc.js';
import billsRoutes from './routes/bills.js';
import envelopeRoutes from './routes/envelopes.js';
import transactionRoutes from './routes/transactions.js';
import plaidRoutes from './routes/plaid.js';
import creditCardRoutes from './routes/credit-cards.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : true,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/healthz', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/mcc', mccRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/envelopes', envelopeRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/plaid', plaidRoutes);
app.use('/api/credit-cards', creditCardRoutes);

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ error: error.message, stack: error.stack }, 'Unhandled error');

  res.status(error.status || 500).json({
    error: {
      message: env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      ...(env.NODE_ENV !== 'production' && { stack: error.stack }),
    },
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

const PORT = env.PORT || 5000;

async function startServer() {
  try {
    // Connect to database
    try {
      await db.$connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to connect to database');
      process.exit(1);
    }

    // Initialize Global AI Brain
    try {
      await globalAIBrain.initialize();
      logger.info('Global AI Brain initialized with financial knowledge base');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Global AI Brain');
      // Don't exit - continue without advanced AI features
    }

    // Initialize agents and tools
    registerAllTools();

    app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT }, 'Server started successfully');
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default app;