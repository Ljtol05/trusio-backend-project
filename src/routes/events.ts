
import { Router } from 'express';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';

const router = Router();

// Store active SSE connections
const connections = new Map<number, Set<any>>();

// SSE endpoint for real-time updates
router.get('/stream', requireAuth, async (req: any, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });
  
  const userId = req.user.id;
  
  // Add connection to the set
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId)!.add(res);
  
  // Send initial envelope data
  try {
    const envelopes = await db.envelope.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
    
    res.write(`data: ${JSON.stringify({
      type: 'ENVELOPES_UPDATE',
      data: { envelopes }
    })}\n\n`);
  } catch (error) {
    logger.error(error, 'Error sending initial envelope data');
  }
  
  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'HEARTBEAT', timestamp: Date.now() })}\n\n`);
  }, 30000);
  
  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    const userConnections = connections.get(userId);
    if (userConnections) {
      userConnections.delete(res);
      if (userConnections.size === 0) {
        connections.delete(userId);
      }
    }
  });
});

// Helper function to broadcast updates to connected clients
export const broadcastUpdate = (userId: number, event: { type: string; data: any }) => {
  const userConnections = connections.get(userId);
  if (userConnections) {
    const message = `data: ${JSON.stringify(event)}\n\n`;
    userConnections.forEach((res) => {
      try {
        res.write(message);
      } catch (error) {
        logger.error(error, 'Error broadcasting update');
        userConnections.delete(res);
      }
    });
  }
};

export default router;
