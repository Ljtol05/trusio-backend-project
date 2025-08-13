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
import kycRoutes from './routes/kyc.js';

const app = express();

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:8080',
      'https://localhost:5173',
      'https://localhost:3000',
      'https://localhost:8080',
    ];
    
    // Check for Replit domains
    if (origin.match(/^https:\/\/.*\.replit\.dev$/) || 
        origin.match(/^https:\/\/.*\.replit\.co$/)) {
      return callback(null, true);
    }
    
    // Check allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // For development, allow any localhost origin
    if (origin.match(/^https?:\/\/localhost:\d+$/)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200
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
app.get('/healthz', async (_req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: 'ok',
      openai: 'checking...',
      kyc: 'ok'
    }
  };

  // Quick OpenAI health check (non-blocking)
  try {
    const { openaiPing } = await import('./lib/openai.js');
    const pingResult = await openaiPing();
    health.services.openai = pingResult.ok ? 'ok' : `error: ${pingResult.reason}`;
  } catch (error) {
    health.services.openai = 'error: unavailable';
  }

  res.json(health);
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
app.use('/api/kyc', kycRoutes);

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