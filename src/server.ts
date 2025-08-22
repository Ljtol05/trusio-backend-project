import express from 'express';
import cors from 'cors';
import { db } from './lib/db.js';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { authenticateToken } from './routes/auth.js';

// Import routes
import authRoutes from './routes/auth.js';
import verifyEmailRoutes from './routes/verify-email.js';
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
import serviceAccountRoutes from './routes/service-accounts.js';

const app = express();

// CORS configuration to allow requests from frontend
app.use(cors({
  origin: [
    'http://localhost:5173', // Vite dev server
    'https://localhost:5173',
    /^https:\/\/.*\.replit\.dev$/, // Any replit.dev domain
    /^https:\/\/.*\.repl\.co$/, // Any repl.co domain
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'x-replit-user-id',
    'x-replit-user-name'
  ],
  exposedHeaders: ['Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

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

// Health check endpoint (no auth required)
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'envelopes-backend'
  });
});

// API routes
// Public routes (no authentication required)
app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);

// Protected routes (authentication required)
app.use('/api/envelopes', authenticateToken, envelopeRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/transfers', authenticateToken, transferRoutes);
app.use('/api/rules', authenticateToken, ruleRoutes); // Corrected rulesRoutes to ruleRoutes
app.use('/api/routing', authenticateToken, routingRoutes);
app.use('/api/cards', authenticateToken, cardRoutes);
app.use('/api/kyc', authenticateToken, kycRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/service-accounts', serviceAccountRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
  // Add more specific error logging for authentication issues
  if (error.name === 'UnauthorizedError' || error.statusCode === 401) {
    logger.warn({ error: error.message, ip: req.ip, url: req.url }, 'Authentication Error');
  } else if (error.name === 'ForbiddenError' || error.statusCode === 403) {
    logger.warn({ error: error.message, ip: req.ip, url: req.url }, 'Authorization Error');
  } else {
    logger.error(error, 'Unhandled error');
  }

  // Send appropriate status code based on error type
  if (error.statusCode) {
    res.status(error.statusCode).json({
      error: 'API Error',
      message: env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } else {
    res.status(500).json({
      error: 'Internal server error',
      message: env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await db.$connect();
    logger.info('Database connected successfully');

    const server = app.listen(env.PORT, '0.0.0.0', () => {
      // Auto-detect Replit external URL
      const replitUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : `http://localhost:${env.PORT}`;

      logger.info({
        port: env.PORT,
        host: '0.0.0.0',
        env: env.NODE_ENV,
        aiEnabled: !!env.OPENAI_API_KEY,
        internalUrl: `http://0.0.0.0:${env.PORT}`,
        externalUrl: replitUrl,
        corsEnabled: true,
      }, 'Server started successfully');

      // Display the URL prominently for easy copying
      console.log('\n🚀 API Server Ready!');
      console.log(`📡 External URL: ${replitUrl}`);
      console.log(`🔗 Health Check: ${replitUrl}/healthz`);
      console.log(`🔐 Auth Endpoints: ${replitUrl}/api/auth/*`);
      console.log('\n');
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