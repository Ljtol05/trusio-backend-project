import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { authenticateToken } from './auth.js';
import { CreateCardSchema, UpdateCardSchema } from '../types/dto.js';

const router = Router();
router.use(authenticateToken);

// Get all cards
router.get('/', async (req: any, res) => {
  try {
    const cards = await db.card.findMany({
      where: { userId: req.user.id },
      include: {
        envelope: { 
          select: { 
            id: true, 
            name: true, 
            icon: true, 
            color: true, 
            balanceCents: true 
          } 
        },
        _count: {
          select: {
            transactions: true,
          },
        },
      },
      orderBy: [
        { inWallet: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    res.json({ cards });
  } catch (error) {
    logger.error(error, 'Error fetching cards');
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// Get card usage analytics
router.get('/analytics', async (req: any, res) => {
  try {
    const { timeframe = '30' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const cardsWithUsage = await db.card.findMany({
      where: { userId: req.user.id },
      include: {
        envelope: { 
          select: { 
            id: true, 
            name: true, 
            icon: true, 
            color: true, 
            balanceCents: true 
          } 
        },
        transactions: {
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
      },
    });

    const analytics = cardsWithUsage.map(card => {
      const totalSpent = card.transactions.reduce(
        (sum, txn) => sum + Math.abs(txn.amountCents), 
        0
      );
      const transactionCount = card.transactions.length;
      const uniqueMerchants = new Set(card.transactions.map(txn => txn.merchant)).size;
      const avgTransactionSize = transactionCount > 0 ? totalSpent / transactionCount : 0;

      // Usage frequency
      const daysWithTransactions = new Set(
        card.transactions.map(txn => txn.createdAt.toISOString().split('T')[0])
      ).size;

      const usageFrequency = daysWithTransactions / days;

      return {
        cardId: card.id,
        last4: card.last4,
        label: card.label,
        inWallet: card.inWallet,
        envelope: card.envelope,
        usage: {
          totalSpentCents: totalSpent,
          transactionCount,
          avgTransactionCents: Math.round(avgTransactionSize),
          uniqueMerchants,
          daysActive: daysWithTransactions,
          usageFrequency: Math.round(usageFrequency * 100) / 100,
          lastUsed: card.transactions[0]?.createdAt || null,
          isHighUsage: usageFrequency > 0.3, // Used more than 30% of days
        },
        topMerchants: Object.entries(
          card.transactions.reduce((acc: any, txn) => {
            acc[txn.merchant] = (acc[txn.merchant] || 0) + Math.abs(txn.amountCents);
            return acc;
          }, {})
        )
        .sort(([,a]: any, [,b]: any) => b - a)
        .slice(0, 3)
        .map(([merchant, amount]) => ({ merchant, amountCents: amount })),
      };
    });

    const summary = {
      totalCards: cardsWithUsage.length,
      activeCards: analytics.filter(card => card.usage.transactionCount > 0).length,
      cardsInWallet: cardsWithUsage.filter(card => card.inWallet).length,
      totalSpentAllCards: analytics.reduce((sum, card) => sum + card.usage.totalSpentCents, 0),
      mostUsedCard: analytics.sort((a, b) => b.usage.transactionCount - a.usage.transactionCount)[0],
      timeframeDays: days,
    };

    res.json({ 
      analytics,
      summary,
      recommendations: {
        unusedCards: analytics.filter(card => card.usage.transactionCount === 0 && card.inWallet),
        highUsageCards: analytics.filter(card => card.usage.isHighUsage),
        needsAttention: analytics.filter(card => 
          card.envelope && card.envelope.balanceCents < card.usage.avgTransactionCents * 3
        ),
      }
    });
  } catch (error) {
    logger.error(error, 'Error fetching card analytics');
    res.status(500).json({ error: 'Failed to fetch card analytics' });
  }
});

// Get card spending by envelope
router.get('/:id/spending', async (req: any, res) => {
  try {
    const cardId = parseInt(req.params.id);
    const { timeframe = '30' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const card = await db.card.findFirst({
      where: { id: cardId, userId: req.user.id },
      include: {
        envelope: true,
        transactions: {
          where: {
            createdAt: { gte: startDate },
            status: 'SETTLED',
          },
          include: {
            envelope: { select: { name: true, icon: true, color: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const spendingByCategory = card.transactions.reduce((acc: any, txn) => {
      const category = txn.envelope?.name || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = {
          envelope: txn.envelope || { name: 'Uncategorized', icon: 'question', color: 'gray' },
          totalCents: 0,
          transactionCount: 0,
          transactions: [],
        };
      }
      acc[category].totalCents += Math.abs(txn.amountCents);
      acc[category].transactionCount += 1;
      acc[category].transactions.push({
        id: txn.id,
        merchant: txn.merchant,
        amountCents: txn.amountCents,
        createdAt: txn.createdAt,
      });
      return acc;
    }, {});

    res.json({
      card: {
        id: card.id,
        last4: card.last4,
        label: card.label,
        envelope: card.envelope,
      },
      spendingByCategory: Object.values(spendingByCategory),
      summary: {
        totalTransactions: card.transactions.length,
        totalSpentCents: card.transactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0),
        timeframeDays: days,
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching card spending');
    res.status(500).json({ error: 'Failed to fetch card spending' });
  }
});

// Get card by ID
router.get('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const card = await db.card.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({ card });
  } catch (error) {
    logger.error(error, 'Error fetching card');
    res.status(500).json({ error: 'Failed to fetch card' });
  }
});

// Create card
router.post('/', async (req: any, res) => {
  try {
    const data = CreateCardSchema.parse(req.body);

    // Enforce 4-card maximum limit
    const existingCardCount = await db.card.count({
      where: { userId: req.user.id },
    });

    if (existingCardCount >= 4) {
      return res.status(400).json({ 
        error: 'Card limit reached', 
        message: 'Maximum of 4 virtual cards allowed per user',
        code: 'CARD_LIMIT_EXCEEDED',
        currentCount: existingCardCount,
        maxAllowed: 4
      });
    }

    // Generate mock card number and security details
    const last4 = Math.floor(1000 + Math.random() * 9000).toString();
    const cardNumber = `4000${Math.floor(100000000000 + Math.random() * 900000000000)}`;
    const expiryMonth = Math.floor(Math.random() * 12) + 1;
    const expiryYear = new Date().getFullYear() + Math.floor(Math.random() * 5) + 1;
    const cvv = Math.floor(100 + Math.random() * 900).toString();

    const card = await db.card.create({
      data: {
        ...data,
        last4,
        userId: req.user.id,
        // Add wallet integration preparation fields
        walletEligible: true,
        walletProvisioned: false,
        cardNumber: cardNumber.slice(0, -4) + last4, // Full card number for wallet provisioning
        expiryMonth,
        expiryYear,
        cvv,
        status: 'ACTIVE',
        spendingLimitCents: data.spendingLimitCents || 50000, // Default $500 limit
      },
    });

    // Log card creation for audit trail
    logger.info({
      userId: req.user.id,
      cardId: card.id,
      envelopeId: card.envelopeId,
      label: card.label,
      cardCount: existingCardCount + 1
    }, 'Virtual card created');

    // Return card without sensitive data
    const { cardNumber: _, cvv: __, ...safeCard } = card;
    res.status(201).json({ 
      card: safeCard,
      walletIntegration: {
        eligible: card.walletEligible,
        provisioned: card.walletProvisioned,
        supportedWallets: ['apple_pay', 'google_pay']
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error creating card');
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// Update card
router.patch('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = UpdateCardSchema.parse(req.body);

    // If setting as default, unset other default cards
    if (data.isDefault) {
      await db.card.updateMany({
        where: { userId: req.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const card = await db.card.updateMany({
      where: { id, userId: req.user.id },
      data,
    });

    if (card.count === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const updatedCard = await db.card.findUnique({ where: { id } });
    res.json({ card: updatedCard });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error updating card');
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// Add/remove card from wallet
router.post('/:id/wallet', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { inWallet } = req.body;


// Wallet provisioning endpoints for Apple Pay/Google Pay integration
router.post('/:id/provision-wallet', async (req: any, res) => {
  try {
    const cardId = parseInt(req.params.id);
    const { walletType, deviceId } = req.body;

    if (!['apple_pay', 'google_pay'].includes(walletType)) {
      return res.status(400).json({ error: 'Unsupported wallet type' });
    }

    const card = await db.card.findFirst({
      where: { id: cardId, userId: req.user.id },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    if (!card.walletEligible) {
      return res.status(400).json({ error: 'Card not eligible for wallet provisioning' });
    }

    // In production, this would integrate with actual wallet APIs
    const provisioningData = {
      cardId: card.id,
      walletType,
      deviceId,
      provisioningToken: `prov_${Math.random().toString(36).substring(2, 15)}`,
      status: 'pending',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    };

    // Update card status
    await db.card.update({
      where: { id: cardId },
      data: { 
        walletProvisioned: true,
        inWallet: true,
        lastWalletActivity: new Date()
      },
    });

    logger.info({
      userId: req.user.id,
      cardId,
      walletType,
      deviceId
    }, 'Wallet provisioning initiated');

    res.json({
      message: 'Wallet provisioning initiated',
      provisioningData,
      nextSteps: [
        'Complete device authentication',
        'Verify card details in wallet app',
        'Activate card for payments'
      ]
    });
  } catch (error) {
    logger.error(error, 'Error provisioning wallet');
    res.status(500).json({ error: 'Failed to provision wallet' });
  }
});

// Get wallet status
router.get('/:id/wallet-status', async (req: any, res) => {
  try {
    const cardId = parseInt(req.params.id);

    const card = await db.card.findFirst({
      where: { id: cardId, userId: req.user.id },
      select: {
        id: true,
        last4: true,
        label: true,
        walletEligible: true,
        walletProvisioned: true,
        inWallet: true,
        lastWalletActivity: true,
        status: true,
      },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({
      card: {
        id: card.id,
        last4: card.last4,
        label: card.label,
      },
      walletStatus: {
        eligible: card.walletEligible,
        provisioned: card.walletProvisioned,
        inWallet: card.inWallet,
        lastActivity: card.lastWalletActivity,
        supportedWallets: ['apple_pay', 'google_pay'],
        cardStatus: card.status,
      }
    });
  } catch (error) {
    logger.error(error, 'Error fetching wallet status');
    res.status(500).json({ error: 'Failed to fetch wallet status' });
  }
});

// Advanced spending analytics with predictive insights
router.get('/:id/analytics/advanced', async (req: any, res) => {
  try {
    const cardId = parseInt(req.params.id);
    const { timeframe = '90' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const card = await db.card.findFirst({
      where: { id: cardId, userId: req.user.id },
      include: {
        envelope: true,
        transactions: {
          where: {
            createdAt: { gte: startDate },
            status: 'SETTLED',
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Calculate spending patterns
    const transactions = card.transactions;
    const totalSpent = transactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0);
    const avgTransaction = transactions.length > 0 ? totalSpent / transactions.length : 0;

    // Daily spending analysis
    const dailySpending = transactions.reduce((acc: any, txn) => {
      const date = txn.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + Math.abs(txn.amountCents);
      return acc;
    }, {});

    // Spending trends
    const spendingDays = Object.keys(dailySpending).length;
    const avgDailySpending = spendingDays > 0 ? totalSpent / spendingDays : 0;

    // Merchant analysis
    const merchantFrequency = transactions.reduce((acc: any, txn) => {
      acc[txn.merchant] = (acc[txn.merchant] || 0) + 1;
      return acc;
    }, {});

    const topMerchants = Object.entries(merchantFrequency)
      .sort(([,a]: any, [,b]: any) => b - a)
      .slice(0, 5)
      .map(([merchant, count]) => ({ merchant, visits: count }));

    // Predictive analysis
    const recentTransactions = transactions.slice(0, 10);
    const recentSpending = recentTransactions.reduce((sum, txn) => sum + Math.abs(txn.amountCents), 0);
    const spendingVelocity = recentTransactions.length > 0 ? recentSpending / Math.min(10, spendingDays) : 0;

    // Risk indicators
    const riskFactors = [];
    if (spendingVelocity > avgDailySpending * 1.5) {
      riskFactors.push('increased_spending_velocity');
    }
    if (card.envelope && card.envelope.balanceCents < avgTransaction * 3) {
      riskFactors.push('low_envelope_balance');
    }

    res.json({
      card: {
        id: card.id,
        last4: card.last4,
        label: card.label,
        envelope: card.envelope,
      },
      analytics: {
        timeframeDays: days,
        spending: {
          totalCents: totalSpent,
          transactionCount: transactions.length,
          avgTransactionCents: Math.round(avgTransaction),
          avgDailyCents: Math.round(avgDailySpending),
        },
        patterns: {
          topMerchants,
          spendingDays,
          dailySpending,
          spendingVelocity: Math.round(spendingVelocity),
        },
        predictions: {
          projectedMonthlySpending: Math.round(avgDailySpending * 30),
          envelopeRunoutDays: card.envelope ? Math.floor(card.envelope.balanceCents / Math.max(avgDailySpending, 1)) : null,
          riskLevel: riskFactors.length > 1 ? 'high' : riskFactors.length > 0 ? 'medium' : 'low',
          riskFactors,
        },
        recommendations: [
          ...(riskFactors.includes('low_envelope_balance') ? ['Consider transferring funds to envelope'] : []),
          ...(riskFactors.includes('increased_spending_velocity') ? ['Monitor recent spending increase'] : []),
          ...(transactions.length < 5 ? ['Use card more frequently to build spending patterns'] : []),
        ],
      },
    });
  } catch (error) {
    logger.error(error, 'Error fetching advanced card analytics');
    res.status(500).json({ error: 'Failed to fetch advanced analytics' });
  }
});


    if (typeof inWallet !== 'boolean') {
      return res.status(400).json({ error: 'inWallet must be a boolean' });
    }

    const card = await db.card.updateMany({
      where: { id, userId: req.user.id },
      data: { inWallet },
    });

    if (card.count === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const updatedCard = await db.card.findUnique({
      where: { id },
      include: {
        envelope: { select: { id: true, name: true } },
      },
    });

    res.json({ card: updatedCard });
  } catch (error) {
    logger.error(error, 'Error updating card wallet status');
    res.status(500).json({ error: 'Failed to update card wallet status' });
  }
});

// Delete card
router.delete('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);

    const deleted = await db.card.deleteMany({
      where: { id, userId: req.user.id },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({ message: 'Card deleted successfully' });
  } catch (error) {
    logger.error(error, 'Error deleting card');
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

export default router;