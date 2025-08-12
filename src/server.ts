import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { db } from './lib/db.js';

// Import routes
import authRoutes from './routes/auth.js';
import envelopeRoutes from './routes/envelopes.js';
import transferRoutes from './routes/transfers.js';
import transactionRoutes from './routes/transactions.js';
import ruleRoutes from './routes/rules.js';
import cardRoutes from './routes/cards.js';
import routingRoutes from './routes/routing.js';
import aiRoutes from './routes/ai.js';
import eventRoutes from './routes/events.js';
import webhookRoutes from './routes/webhooks.js';

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  }, 'HTTP Request');
  next();
});

// Health check
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/envelopes', envelopeRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/rules', ruleRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
  logger.error(error, 'Unhandled error');
  res.status(500).json({ 
    error: 'Internal server error',
    message: env.NODE_ENV === 'development' ? error.message : undefined,
  });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await db.$connect();
    logger.info('Database connected successfully');

    const server = app.listen(env.PORT, '0.0.0.0', () => {
      logger.info({
        port: env.PORT,
        host: '0.0.0.0',
        env: env.NODE_ENV,
        aiEnabled: !!env.OPENAI_API_KEY,
      }, 'Server started successfully');
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');
        await db.$disconnect();
        logger.info('Database disconnected');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
};

startServer();