
import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

export const db = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ],
});

db.$on('query', (e) => {
  logger.debug({ query: e.query, params: e.params, duration: e.duration }, 'Database query');
});

db.$on('error', (e) => {
  logger.error(e, 'Database error');
});

process.on('beforeExit', async () => {
  await db.$disconnect();
});
