
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';
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
    const data = CreateTransferSchema.parse(req.body);
    
    // Validate envelopes exist and belong to user
    const fromEnvelope = await db.envelope.findFirst({
      where: { id: data.fromEnvelopeId, userId: req.user.id },
    });
    
    const toEnvelope = await db.envelope.findFirst({
      where: { id: data.toEnvelopeId, userId: req.user.id },
    });
    
    if (!fromEnvelope || !toEnvelope) {
      return res.status(400).json({ error: 'Invalid envelope selection' });
    }
    
    if (fromEnvelope.balance < data.amount) {
      return res.status(400).json({ error: 'Insufficient balance in source envelope' });
    }
    
    // Perform transfer in transaction
    const result = await db.$transaction(async (tx) => {
      // Update balances
      await tx.envelope.update({
        where: { id: data.fromEnvelopeId },
        data: { balance: { decrement: data.amount } },
      });
      
      await tx.envelope.update({
        where: { id: data.toEnvelopeId },
        data: { balance: { increment: data.amount } },
      });
      
      // Create transfer record
      return await tx.transfer.create({
        data: {
          ...data,
          userId: req.user.id,
        },
        include: {
          fromEnvelope: { select: { id: true, name: true } },
          toEnvelope: { select: { id: true, name: true } },
        },
      });
    });
    
    res.status(201).json({ transfer: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error creating transfer');
    res.status(500).json({ error: 'Failed to create transfer' });
  }
});

export default router;
