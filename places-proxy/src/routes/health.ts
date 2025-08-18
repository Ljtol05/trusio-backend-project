
import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '../types.js';

const startTime = Date.now();

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get<{ Reply: HealthResponse }>('/health', async (request, reply) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    return {
      status: 'ok',
      uptimeSeconds,
      timestamp: new Date().toISOString(),
    };
  });
}
