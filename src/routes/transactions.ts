import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { authenticateToken } from './auth.js';
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
        envelope: { select: { id: true, name: true, icon: true, color: true } },
        card: { select: { id: true, last4: true, label: true } },
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

// Get spending analytics
router.get('/analytics/spending', async (req: any, res) => {
  try {
    const { timeframe = '30', groupBy = 'envelope' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const transactions = await db.transaction.findMany({
      where: {
        userId: req.user.id,
        status: 'SETTLED',
        createdAt: { gte: startDate },
        amountCents: { lt: 0 }, // Only spending transactions
      },
      include: {
        envelope: { select: { id: true, name: true, icon: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by envelope
    const envelopeSpending = transactions.reduce((acc: any, txn) => {
      const envelopeName = txn.envelope?.name || 'Uncategorized';
      if (!acc[envelopeName]) {
        acc[envelopeName] = {
          envelope: txn.envelope || { name: 'Uncategorized', icon: 'question', color: 'gray' },
          totalCents: 0,
          transactionCount: 0,
          avgTransactionCents: 0,
          merchants: new Set(),
          mccs: new Set(),
        };
      }
      acc[envelopeName].totalCents += Math.abs(txn.amountCents);
      acc[envelopeName].transactionCount += 1;
      acc[envelopeName].merchants.add(txn.merchant);
      if (txn.mcc) acc[envelopeName].mccs.add(txn.mcc);
      return acc;
    }, {});

    // Calculate averages and convert sets to arrays
    Object.keys(envelopeSpending).forEach(key => {
      const data = envelopeSpending[key];
      data.avgTransactionCents = Math.round(data.totalCents / data.transactionCount);
      data.merchants = Array.from(data.merchants);
      data.mccs = Array.from(data.mccs);
    });

    // Top merchants analysis
    const merchantSpending = transactions.reduce((acc: any, txn) => {
      if (!acc[txn.merchant]) {
        acc[txn.merchant] = {
          merchant: txn.merchant,
          totalCents: 0,
          transactionCount: 0,
          envelope: txn.envelope?.name || 'Uncategorized',
          mcc: txn.mcc,
        };
      }
      acc[txn.merchant].totalCents += Math.abs(txn.amountCents);
      acc[txn.merchant].transactionCount += 1;
      return acc;
    }, {});

    const topMerchants = Object.values(merchantSpending)
      .sort((a: any, b: any) => b.totalCents - a.totalCents)
      .slice(0, 10);

    // Spending patterns
    const dailySpending = transactions.reduce((acc: any, txn) => {
      const date = txn.createdAt.toISOString().split('T')[0];
      if (!acc[date]) acc[date] = 0;
      acc[date] += Math.abs(txn.amountCents);
      return acc;
    }, {});

    res.json({
      summary: {
        totalSpentCents: transactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0),
        totalTransactions: transactions.length,
        avgTransactionCents: Math.round(
          transactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0) / transactions.length
        ),
        uniqueMerchants: new Set(transactions.map(txn => txn.merchant)).size,
        timeframeDays: days,
      },
      envelopeSpending: Object.values(envelopeSpending),
      topMerchants,
      dailySpending,
      spendingTrends: {
        highestSpendingDay: Object.entries(dailySpending)
          .sort(([,a]: any, [,b]: any) => b - a)[0],
        mostFrequentMerchant: topMerchants[0]?.merchant || 'N/A',
        avgDailySpending: Math.round(
          Object.values(dailySpending).reduce((sum: number, amount: any) => sum + amount, 0) / 
          Object.keys(dailySpending).length
        ),
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching spending analytics');
    res.status(500).json({ error: 'Failed to fetch spending analytics' });
  }
});

// Get pending transactions for approval
router.get('/pending', async (req: any, res) => {
  try {
    const pendingTransactions = await db.transaction.findMany({
      where: { 
        userId: req.user.id, 
        status: 'PENDING' 
      },
      include: {
        envelope: { select: { id: true, name: true, icon: true, color: true } },
        card: { select: { id: true, last4: true, label: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get available envelopes for potential reassignment
    const availableEnvelopes = await db.envelope.findMany({
      where: { userId: req.user.id, isActive: true },
      select: { 
        id: true, 
        name: true, 
        icon: true, 
        color: true, 
        balanceCents: true 
      },
      orderBy: { order: 'asc' },
    });

    res.json({ 
      pendingTransactions,
      availableEnvelopes,
      totalPending: pendingTransactions.length,
      totalPendingAmount: pendingTransactions.reduce(
        (sum, txn) => sum + Math.abs(txn.amountCents), 
        0
      ),
    });
  } catch (error) {
    logger.error(error, 'Error fetching pending transactions');
    res.status(500).json({ error: 'Failed to fetch pending transactions' });
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