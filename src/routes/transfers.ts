import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { authenticateToken } from './auth.js';
import { CreateTransferSchema, PaginationSchema } from '../types/dto.js';

const router = Router();
router.use(requireAuth);

// Get all transfers
router.get('/', async (req: any, res) => {
  try {
    const { page, limit } = PaginationSchema.parse(req.query);
    const offset = (page - 1) * limit;

    const transfers = await db.transfer.findMany({
      where: { userId: req.user.id },
      include: {
        fromEnvelope: { select: { id: true, name: true } },
        toEnvelope: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    const total = await db.transfer.count({
      where: { userId: req.user.id },
    });

    res.json({
      transfers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching transfers');
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
});

// Create transfer
router.post('/', async (req: any, res) => {
  try {
    const { fromId, toId, amountCents, note } = req.body;

    if (amountCents <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    // Use transaction to ensure balance consistency
    const transfer = await db.$transaction(async (tx) => {
      // If moving from an envelope, deduct the amount
      if (fromId) {
        await tx.envelope.update({
          where: { id: fromId, userId: req.user.id },
          data: {
            balanceCents: {
              decrement: amountCents,
            },
          },
        });
      }

      // If moving to an envelope, add the amount
      if (toId) {
        await tx.envelope.update({
          where: { id: toId, userId: req.user.id },
          data: {
            balanceCents: {
              increment: amountCents,
            },
          },
        });
      }

      // Create the transfer record
      return tx.transfer.create({
        data: {
          fromId,
          toId,
          amountCents,
          note,
          userId: req.user.id,
        },
        include: {
          fromEnvelope: { select: { id: true, name: true } },
          toEnvelope: { select: { id: true, name: true } },
        },
      });
    });

    res.status(201).json({ transfer });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error creating transfer');
    res.status(500).json({ error: 'Failed to create transfer' });
  }
});

export default router;