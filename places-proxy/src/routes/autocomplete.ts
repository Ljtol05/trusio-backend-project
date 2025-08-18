
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import type { AutocompleteResponse } from '../types.js';
import { ValidationError, AppError, toErrorResponse } from '../errors.js';
import { logger } from '../logger.js';

interface AutocompleteQuery {
  q: string;
  sessionToken?: string;
  limit?: string;
}

export async function autocompleteRoutes(
  fastify: FastifyInstance,
  googleClient: any,
  cache: any,
  rateLimiter: any,
  softFail: boolean
) {
  fastify.get<{
    Querystring: AutocompleteQuery;
    Reply: AutocompleteResponse | { suggestions: [] };
  }>('/places/autocomplete', async (request, reply) => {
    const reqId = nanoid(8);
    const startTime = Date.now();
    const ip = request.ip;

    try {
      // Rate limiting
      rateLimiter.checkLimits(ip);

      // Validation
      const { q, sessionToken, limit: limitStr } = request.query;
      
      if (!q || q.length < 3 || q.length > 120) {
        throw new ValidationError('Query must be between 3 and 120 characters');
      }

      const limit = limitStr ? parseInt(limitStr, 10) : 5;
      if (isNaN(limit) || limit < 1 || limit > 10) {
        throw new ValidationError('Limit must be between 1 and 10');
      }

      if (sessionToken && sessionToken.length > 64) {
        throw new ValidationError('Session token must be 64 characters or less');
      }

      // Cache key
      const cacheKey = `ac:${q}:${limit}`;
      const cached = cache.get(cacheKey);

      if (cached) {
        const latencyMs = Date.now() - startTime;
        logger.info('Autocomplete request served from cache', {
          reqId,
          method: request.method,
          path: request.url,
          status: 200,
          latencyMs,
          cacheHit: true,
          ip,
        });

        reply.header('X-Cache', 'HIT');
        return cached;
      }

      // Upstream call
      const truncatedQuery = q.length > 40 ? q.substring(0, 40) + '…' : q;
      logger.debug('Making upstream autocomplete request', { reqId, query: truncatedQuery });

      const result = await googleClient.autocomplete(q, sessionToken, limit, reqId);
      
      // Cache result
      cache.set(cacheKey, result, 60); // Use config value in real implementation

      const latencyMs = Date.now() - startTime;
      logger.info('Autocomplete request completed', {
        reqId,
        method: request.method,
        path: request.url,
        status: 200,
        latencyMs,
        cacheHit: false,
        ip,
      });

      reply.header('X-Cache', 'MISS');
      reply.header('X-Request-Id', reqId);
      return result;

    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof AppError) {
        if (softFail && error.statusCode >= 500) {
          logger.warn('Soft-failing autocomplete request', {
            reqId,
            method: request.method,
            path: request.url,
            status: 200,
            latencyMs,
            errorCode: error.errorCode,
            ip,
          });

          reply.header('X-Soft-Fail', '1');
          reply.header('X-Request-Id', reqId);
          return { suggestions: [] };
        }

        logger.error('Autocomplete request failed', {
          reqId,
          method: request.method,
          path: request.url,
          status: error.statusCode,
          latencyMs,
          errorCode: error.errorCode,
          ip,
        });

        reply.status(error.statusCode);
        reply.header('X-Request-Id', reqId);
        return toErrorResponse(error);
      }

      logger.error('Unexpected autocomplete error', {
        reqId,
        method: request.method,
        path: request.url,
        status: 500,
        latencyMs,
        errorCode: 'internal_error',
        ip,
      });

      reply.status(500);
      reply.header('X-Request-Id', reqId);
      return {
        error: 'internal_error',
        message: 'An unexpected error occurred',
      };
    }
  });
}
