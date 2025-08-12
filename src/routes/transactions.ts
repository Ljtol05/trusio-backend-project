import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';
import { CreateTransactionSchema, PaginationSchema } from '../types/dto.js';

const router = Router();
router.use(requireAuth);

// Get all transactions with filtering
router.get('/', async (req: any, res) => {
  try {
    const { page, limit } = PaginationSchema.parse(req.query);
    const { month, envelopeId, merchant } = req.query;
    const skip = (page - 1) * limit;

    // Build where clause with filters
    const where: any = { userId: req.user.id };

    if (month) {
      const [year, monthNum] = month.split('-');
      const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59);

      where.postedAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    if (envelopeId) {
      where.envelopeId = parseInt(envelopeId);
    }

    if (merchant) {
      where.merchant = {
        contains: merchant,
        mode: 'insensitive',
      };
    }

    const transactions = await db.transaction.findMany({
      where,
      include: {
        envelope: { select: { id: true, name: true } },
        card: { select: { id: true, last4: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await db.transaction.count({ where });

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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

// Import transactions with auto-routing
router.post('/import', async (req: any, res) => {
  try {
    const { transactions: rawTransactions } = req.body;

    if (!Array.isArray(rawTransactions)) {
      return res.status(400).json({ error: 'Transactions must be an array' });
    }

    const results = [];

    for (const raw of rawTransactions) {
      const { merchant, mcc, amountCents, postedAt, location } = raw;

      // Find best envelope using routing logic
      const { findBestEnvelope } = await import('./routing.js');
      const routing = await findBestEnvelope(req.user.id, {
        amount: Math.abs(amountCents),
        merchantName: merchant,
        mcc,
        location,
      });

      const transaction = await db.transaction.create({
        data: {
          userId: req.user.id,
          merchant,
          mcc,
          amountCents,
          location,
          envelopeId: routing.envelope?.id,
          reason: routing.reason,
          postedAt: postedAt ? new Date(postedAt) : new Date(),
          status: 'SETTLED',
        },
        include: {
          envelope: { select: { id: true, name: true } },
        },
      });

      results.push({
        transaction,
        routing: {
          envelope: routing.envelope,
          reason: routing.reason,
        },
      });
    }

    res.status(201).json({ results, imported: results.length });
  } catch (error) {
    logger.error(error, 'Error importing transactions');
    res.status(500).json({ error: 'Failed to import transactions' });
  }
});

export default router;