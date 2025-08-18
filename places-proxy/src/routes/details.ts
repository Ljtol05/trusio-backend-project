import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import type { PlaceDetails } from '../types.js';
import { ValidationError, AppError, toErrorResponse } from '../errors.js';
import { logger } from '../logger.js';

interface DetailsParams {
  id: string;
}

interface DetailsQuery {
  sessionToken?: string;
}

export async function detailsRoutes(
  fastify: FastifyInstance,
  googleClient: any,
  cache: any,
  rateLimiter: any
) {
  fastify.get<{
    Params: DetailsParams;
    Querystring: DetailsQuery;
    Reply: PlaceDetails;
  }>('/places/details/:id', async (request, reply) => {
    const reqId = nanoid(8);
    const startTime = Date.now();
    const ip = request.ip;

    try {
      // Rate limiting
      rateLimiter.checkLimits(ip);

      // Validation
      const { id } = request.params;
      const { sessionToken } = request.query;

      if (!id || id.length === 0 || id.length > 256) {
        throw new ValidationError('Place ID must be non-empty and 256 characters or less');
      }

      if (sessionToken && sessionToken.length > 64) {
        throw new ValidationError('Session token must be 64 characters or less');
      }

      // Cache key
      const cacheKey = `dt:${id}`;
      const cached = cache.get(cacheKey);

      if (cached) {
        const latencyMs = Date.now() - startTime;
        logger.info({
          reqId,
          method: request.method,
          path: request.url,
          status: 200,
          latencyMs,
          cacheHit: true,
          ip,
        }, 'Details request served from cache');

        reply.header('X-Cache', 'HIT');
        return cached;
      }

      // Upstream call
      logger.debug({
        reqId,
        placeId: id
      }, 'Making upstream details request');

      const result = await googleClient.getDetails(id, sessionToken, reqId);

      // Cache result
      cache.set(cacheKey, result, 86400); // Use config value in real implementation

      const latencyMs = Date.now() - startTime;
      logger.info({
        reqId,
        method: request.method,
        path: request.url,
        status: 200,
        latencyMs,
        cacheHit: false,
        ip,
      }, 'Details request completed');

      reply.header('X-Cache', 'MISS');
      reply.header('X-Request-Id', reqId);
      return result;

    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof AppError) {
        logger.error({
          reqId,
          method: request.method,
          path: request.url,
          status: error.statusCode,
          latencyMs,
          errorCode: error.errorCode,
          ip,
        }, 'Details request failed');

        reply.status(error.statusCode);
        reply.header('X-Request-Id', reqId);
        return toErrorResponse(error);
      }

      logger.error({
        reqId,
        method: request.method,
        path: request.url,
        status: 500,
        latencyMs,
        errorCode: 'internal_error',
        ip,
      }, 'Unexpected details error');

      reply.status(500);
      reply.header('X-Request-Id', reqId);
      return {
        error: 'internal_error',
        message: 'An unexpected error occurred',
      };
    }
  });
}