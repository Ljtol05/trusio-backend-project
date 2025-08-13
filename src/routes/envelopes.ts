import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { authenticateToken } from './auth.js';
import { CreateEnvelopeSchema, UpdateEnvelopeSchema } from '../types/dto.js';

const router = Router();
router.use(authenticateToken);

// Get all envelopes
router.get('/', async (req: any, res) => {
  try {
    const envelopes = await db.envelope.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        name: true,
        balanceCents: true,
        spentThisMonth: true,
        icon: true,
        color: true,
        order: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            transactionsFrom: true,
            transfersFrom: true,
            transfersTo: true,
            rules: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    res.json({ envelopes });
  } catch (error) {
    logger.error(error, 'Error fetching envelopes');
    res.status(500).json({ error: 'Failed to fetch envelopes' });
  }
});

// Get envelope spending analytics
router.get('/analytics', async (req: any, res) => {
  try {
    const { timeframe = '30' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const envelopes = await db.envelope.findMany({
      where: { userId: req.user.id },
      include: {
        transactionsFrom: {
          where: {
            createdAt: { gte: startDate },
            status: 'SETTLED',
          },
          select: {
            amountCents: true,
            merchant: true,
            mcc: true,
            createdAt: true,
          },
        },
        transfersFrom: {
          where: { createdAt: { gte: startDate } },
          select: { amountCents: true, note: true, createdAt: true },
        },
        transfersTo: {
          where: { createdAt: { gte: startDate } },
          select: { amountCents: true, note: true, createdAt: true },
        },
      },
      orderBy: { order: 'asc' },
    });

    const analytics = envelopes.map((envelope) => {
      const totalSpent = envelope.transactionsFrom.reduce(
        (sum, txn) => sum + Math.abs(txn.amountCents),
        0
      );
      const transfersOut = envelope.transfersFrom.reduce(
        (sum, transfer) => sum + transfer.amountCents,
        0
      );
      const transfersIn = envelope.transfersTo.reduce(
        (sum, transfer) => sum + transfer.amountCents,
        0
      );
      const avgTransactionSize = envelope.transactionsFrom.length > 0 
        ? totalSpent / envelope.transactionsFrom.length 
        : 0;

      return {
        id: envelope.id,
        name: envelope.name,
        icon: envelope.icon,
        color: envelope.color,
        balanceCents: envelope.balanceCents,
        totalSpentCents: totalSpent,
        transfersOutCents: transfersOut,
        transfersInCents: transfersIn,
        netTransfersCents: transfersIn - transfersOut,
        transactionCount: envelope.transactionsFrom.length,
        avgTransactionCents: Math.round(avgTransactionSize),
        spendingTrend: envelope.transactionsFrom.length > 1 ? 'active' : 'low',
        lastActivity: envelope.transactionsFrom[0]?.createdAt || envelope.updatedAt,
      };
    });

    res.json({ 
      analytics,
      summary: {
        totalEnvelopes: envelopes.length,
        totalBalanceCents: envelopes.reduce((sum, env) => sum + env.balanceCents, 0),
        totalSpentCents: analytics.reduce((sum, env) => sum + env.totalSpentCents, 0),
        mostUsedEnvelope: analytics.sort((a, b) => b.transactionCount - a.transactionCount)[0],
        timeframeDays: days,
      }
    });
  } catch (error) {
    logger.error(error, 'Error fetching envelope analytics');
    res.status(500).json({ error: 'Failed to fetch envelope analytics' });
  }
});

// Get envelope by ID
router.get('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const envelope = await db.envelope.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!envelope) {
      return res.status(404).json({ error: 'Envelope not found' });
    }

    res.json({ envelope });
  } catch (error) {
    logger.error(error, 'Error fetching envelope');
    res.status(500).json({ error: 'Failed to fetch envelope' });
  }
});

// Create envelope
router.post('/', async (req: any, res) => {
  try {
    const { name, startingBalanceCents, ...otherData } = req.body;

    const envelope = await db.envelope.create({
      data: {
        name,
        balanceCents: startingBalanceCents || 0,
        ...otherData,
        userId: req.user.id,
      },
    });

    res.status(201).json({ envelope });
  } catch (error) {
    logger.error(error, 'Error creating envelope');
    res.status(500).json({ error: 'Failed to create envelope' });
  }
});

// Update envelope
router.patch('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = UpdateEnvelopeSchema.parse(req.body);

    const envelope = await db.envelope.updateMany({
      where: { id, userId: req.user.id },
      data,
    });

    if (envelope.count === 0) {
      return res.status(404).json({ error: 'Envelope not found' });
    }

    const updatedEnvelope = await db.envelope.findUnique({ where: { id } });
    res.json({ envelope: updatedEnvelope });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error updating envelope');
    res.status(500).json({ error: 'Failed to update envelope' });
  }
});

// Delete envelope
router.delete('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);

    const deleted = await db.envelope.deleteMany({
      where: { id, userId: req.user.id },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Envelope not found' });
    }

    res.json({ message: 'Envelope deleted successfully' });
  } catch (error) {
    logger.error(error, 'Error deleting envelope');
    res.status(500).json({ error: 'Failed to delete envelope' });
  }
});

export default router;