
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';
import { CreateTransactionSchema, PaginationSchema } from '../types/dto.js';

const router = Router();
router.use(requireAuth);

// Get all transactions
router.get('/', async (req: any, res) => {
  try {
    const { page, limit } = PaginationSchema.parse(req.query);
    const offset = (page - 1) * limit;
    
    const transactions = await db.transaction.findMany({
      where: { userId: req.user.id },
      include: {
        fromEnvelope: { select: { id: true, name: true } },
        toEnvelope: { select: { id: true, name: true } },
        card: { select: { id: true, name: true, last4: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
    
    const total = await db.transaction.count({
      where: { userId: req.user.id },
    });
    
    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching transactions');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get transaction by ID
router.get('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const transaction = await db.transaction.findFirst({
      where: { id, userId: req.user.id },
      include: {
        fromEnvelope: { select: { id: true, name: true } },
        toEnvelope: { select: { id: true, name: true } },
        card: { select: { id: true, name: true, last4: true } },
      },
    });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json({ transaction });
  } catch (error) {
    logger.error(error, 'Error fetching transaction');
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Create transaction
router.post('/', async (req: any, res) => {
  try {
    const data = CreateTransactionSchema.parse(req.body);
    
    const transaction = await db.transaction.create({
      data: {
        ...data,
        userId: req.user.id,
        status: 'pending',
      },
      include: {
        fromEnvelope: { select: { id: true, name: true } },
        toEnvelope: { select: { id: true, name: true } },
        card: { select: { id: true, name: true, last4: true } },
      },
    });
    
    res.status(201).json({ transaction });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error creating transaction');
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// Update transaction status
router.patch('/:id/status', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = z.object({ status: z.enum(['pending', 'completed', 'failed']) }).parse(req.body);
    
    const transaction = await db.transaction.updateMany({
      where: { id, userId: req.user.id },
      data: { status },
    });
    
    if (transaction.count === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const updatedTransaction = await db.transaction.findUnique({
      where: { id },
      include: {
        fromEnvelope: { select: { id: true, name: true } },
        toEnvelope: { select: { id: true, name: true } },
        card: { select: { id: true, name: true, last4: true } },
      },
    });
    
    res.json({ transaction: updatedTransaction });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error updating transaction');
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

export default router;
