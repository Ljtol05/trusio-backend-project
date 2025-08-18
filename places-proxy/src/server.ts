
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { appConfig } from './config.js';
import { logger } from './logger.js';
import { TTLCache } from './cache.js';
import { RateLimiter } from './rateLimit.js';
import { GooglePlacesClient } from './google.js';
import { healthRoutes } from './routes/health.js';
import { autocompleteRoutes } from './routes/autocomplete.js';
import { detailsRoutes } from './routes/details.js';

async function createServer() {
  const fastify = Fastify({
    logger: false, // Use our custom logger
    trustProxy: true,
  });

  // CORS configuration
  const corsOptions = {
    origin: appConfig.allowedOrigins.length > 0 
      ? appConfig.allowedOrigins 
      : process.env.NODE_ENV === 'development' 
        ? true 
        : false,
  };

  if (appConfig.allowedOrigins.length === 0 && process.env.NODE_ENV === 'development') {
    logger.warn('ALLOWED_ORIGINS not set in development, allowing all origins');
  }

  await fastify.register(cors, corsOptions);

  // Initialize services
  const cache = new TTLCache(appConfig.cacheMaxItems);
  const rateLimiter = new RateLimiter(
    appConfig.rateLimitGlobalWindowSeconds,
    appConfig.rateLimitGlobalMax,
    appConfig.rateLimitIpWindowSeconds,
    appConfig.rateLimitIpMax
  );
  const googleClient = new GooglePlacesClient(
    appConfig.googlePlacesApiKey,
    appConfig.requestTimeoutMs
  );

  // Register routes
  await fastify.register(async function (fastify) {
    fastify.addHook('preHandler', async (request, reply) => {
      // Add request context
      request.requestTime = Date.now();
    });

    await healthRoutes(fastify);
  }, { prefix: '/v1' });

  await fastify.register(async function (fastify) {
    await autocompleteRoutes(
      fastify, 
      googleClient, 
      cache, 
      rateLimiter, 
      appConfig.softFailAutocomplete
    );
    await detailsRoutes(fastify, googleClient, cache, rateLimiter);
  }, { prefix: '/v1' });

  // Global error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      method: request.method,
      url: request.url,
    });

    reply.status(500).send({
      error: 'internal_error',
      message: 'An unexpected error occurred',
    });
  });

  // Cleanup rate limiter periodically
  setInterval(() => {
    rateLimiter.cleanup();
  }, 60000); // Every minute

  return fastify;
}

async function start() {
  try {
    const server = await createServer();
    
    await server.listen({
      port: appConfig.port,
      host: '0.0.0.0',
    });

    logger.info('Places proxy server started', {
      port: appConfig.port,
      allowedOrigins: appConfig.allowedOrigins,
      softFailAutocomplete: appConfig.softFailAutocomplete,
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      await server.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

start();
