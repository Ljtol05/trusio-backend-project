
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { initializeAgentSystem } from './agents/bootstrap.js';

// Import routes
import authRoutes from './routes/auth.js';
import aiRoutes from './routes/ai.js';
import envelopeRoutes from './routes/envelopes.js';
import transactionRoutes from './routes/transactions.js';

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
app.use('/api/envelopes', envelopeRoutes);
app.use('/api/transactions', transactionRoutes);

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
    // Initialize agent system first
    const agentSystemReady = await initializeAgentSystem();
    if (!agentSystemReady) {
      throw new Error('Failed to initialize agent system');
    }

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
