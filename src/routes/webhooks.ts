
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { broadcastUpdate } from './events.js';
import { findBestEnvelope } from './routing.js';

const router = Router();

// Webhook schema for transaction events
const TransactionWebhookSchema = z.object({
  event_type: z.enum(['transaction.created', 'transaction.completed', 'transaction.failed']),
  data: z.object({
    id: z.string(),
    amount: z.number(),
    description: z.string(),
    merchant_name: z.string().optional(),
    mcc: z.string().optional(),
    location: z.string().optional(),
    user_id: z.string().optional(),
    card_id: z.string().optional(),
  }),
});

// TODO: Add webhook signature verification for production
const verifyWebhookSignature = (req: any) => {
  // Implement webhook signature verification here
  // For now, return true as a stub
  return true;
};

// Handle transaction webhooks
router.post('/transactions', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    const webhook = TransactionWebhookSchema.parse(req.body);
    const { event_type, data } = webhook;
    
    // For demo, assume userId = 1, but in production map from webhook data
    const userId = 1;
    
    logger.info({ event_type, transaction_id: data.id }, 'Received transaction webhook');
    
    switch (event_type) {
      case 'transaction.created': {
        // Find best envelope for routing
        const routingResult = await findBestEnvelope(userId, {
          amount: Math.abs(data.amount),
          merchantName: data.merchant_name,
          mcc: data.mcc,
          location: data.location,
        });
        
        // Create transaction record
        const transaction = await db.transaction.create({
          data: {
            amount: data.amount,
            description: data.description,
            merchantName: data.merchant_name,
            mcc: data.mcc,
            location: data.location,
            status: 'pending',
            externalId: data.id,
            fromEnvelopeId: routingResult.envelope?.id,
            userId,
            reason: routingResult.reason,
          },
          include: {
            fromEnvelope: { select: { id: true, name: true } },
          },
        });
        
        // Broadcast update
        broadcastUpdate(userId, {
          type: 'TRANSACTION_CREATED',
          data: { transaction, routing: routingResult },
        });
        
        break;
      }
      
      case 'transaction.completed': {
        // Update transaction status and envelope balance
        const result = await db.$transaction(async (tx) => {
          const transaction = await tx.transaction.update({
            where: { externalId: data.id },
            data: { status: 'completed' },
            include: { fromEnvelope: true },
          });
          
          if (transaction.fromEnvelope && data.amount < 0) {
            // Deduct from envelope for spending transactions
            await tx.envelope.update({
              where: { id: transaction.fromEnvelopeId! },
              data: { balance: { decrement: Math.abs(data.amount) } },
            });
          }
          
          return transaction;
        });
        
        // Get updated envelopes
        const envelopes = await db.envelope.findMany({
          where: { userId },
          orderBy: { name: 'asc' },
        });
        
        // Broadcast updates
        broadcastUpdate(userId, {
          type: 'TRANSACTION_COMPLETED',
          data: { transaction: result },
        });
        
        broadcastUpdate(userId, {
          type: 'ENVELOPES_UPDATE',
          data: { envelopes },
        });
        
        break;
      }
      
      case 'transaction.failed': {
        // Update transaction status
        const transaction = await db.transaction.update({
          where: { externalId: data.id },
          data: { status: 'failed' },
        });
        
        // Broadcast update
        broadcastUpdate(userId, {
          type: 'TRANSACTION_FAILED',
          data: { transaction },
        });
        
        break;
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ error: error.errors }, 'Webhook validation failed');
      return res.status(400).json({ error: 'Invalid webhook data' });
    }
    
    logger.error(error, 'Error processing transaction webhook');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Health check for webhook endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
