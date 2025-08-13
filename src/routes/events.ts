import { Router } from 'express';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { authenticateToken } from './auth.js';

const router = Router();
router.use(authenticateToken);

// Simple in-memory event broadcasting
const clients: Set<any> = new Set();

export const broadcastUpdate = async (userId: number) => {
  try {
    // Get updated balance data
    const envelopes = await db.envelope.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, balanceCents: true },
      orderBy: { order: 'asc' },
    });

    const totalAvailableCents = envelopes.reduce((sum, env) => sum + env.balanceCents, 0);

    const updateData = {
      type: 'balances',
      totalAvailableCents,
      perEnvelope: envelopes,
      timestamp: new Date().toISOString(),
    };

    clients.forEach(client => {
      if (!client.destroyed) {
        client.write(`data: ${JSON.stringify(updateData)}\n\n`);
      }
    });
  } catch (error) {
    logger.error(error, 'Error broadcasting update');
  }
};

// SSE endpoint for real-time updates
router.get('/', (req: any, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  clients.add(res);

  res.on('close', () => {
    clients.delete(res);
  });

  // Send initial connection message
  res.write('data: {"type": "connected"}\n\n');

  // Send initial balance data
  broadcastUpdate(req.user.id);
});

export default router;