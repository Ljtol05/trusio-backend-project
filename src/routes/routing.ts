import { Router } from 'express';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { authenticateToken } from './auth.js';

const router = Router();
router.use(authenticateToken);

// Smart routing logic for transactions
export const findBestEnvelope = async (
  userId: number,
  transactionData: {
    amount: number;
    merchantName?: string;
    mcc?: string;
    location?: string;
  }
) => {
  // Get all active routing rules for the user, ordered by priority
  const rules = await db.rule.findMany({
    where: {
      userId,
      enabled: true,
    },
    include: {
      envelope: true,
    },
    orderBy: { priority: 'asc' },
  });

  // Apply rules in priority order
  for (const rule of rules) {
    let matches = true;

    // Check MCC condition
    if (rule.mcc && transactionData.mcc) {
      matches = matches && rule.mcc === transactionData.mcc;
    }

    // Check merchant name condition (contains, case-insensitive)
    if (rule.merchant && transactionData.merchantName) {
      matches = matches && transactionData.merchantName.toLowerCase()
        .includes(rule.merchant.toLowerCase());
    }

    // Check location/geofence condition
    if (rule.geofence && transactionData.location) {
      matches = matches && transactionData.location.toLowerCase()
        .includes(rule.geofence.toLowerCase());
    }

    if (matches && rule.envelope && rule.envelope.isActive) {
      return {
        envelope: rule.envelope,
        rule,
        reason: `Matched rule: ${rule.merchant || rule.mcc || rule.geofence}`,
      };
    }
  }

  // Fallback to default envelope (first active envelope)
  const defaultEnvelope = await db.envelope.findFirst({
    where: {
      userId,
      isActive: true,
    },
    orderBy: { order: 'asc' },
  });

  return {
    envelope: defaultEnvelope,
    rule: null,
    reason: 'No rules matched, using default envelope',
  };
};

// Get routing suggestion for transaction
router.post('/suggest', async (req: any, res) => {
  try {
    const { amount, merchantName, mcc, location } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const result = await findBestEnvelope(req.user.id, {
      amount,
      merchantName,
      mcc,
      location,
    });

    if (!result.envelope) {
      return res.status(404).json({ error: 'No suitable envelope found' });
    }

    res.json({
      envelope: result.envelope,
      rule: result.rule,
      reason: result.reason,
    });
  } catch (error) {
    logger.error(error, 'Error getting routing suggestion');
    res.status(500).json({ error: 'Failed to get routing suggestion' });
  }
});

// Get routing configuration
router.get('/config', async (req: any, res) => {
  try {
    const config = await db.routingConfig.findUnique({
      where: { userId: req.user.id },
    });
    
    if (!config) {
      return res.status(404).json({ error: 'Routing config not found' });
    }
    
    res.json({ config });
  } catch (error) {
    logger.error(error, 'Error fetching routing config');
    res.status(500).json({ error: 'Failed to fetch routing config' });
  }
});

// Update routing configuration
router.patch('/config', async (req: any, res) => {
  try {
    const { spendMode, lockedEnvelopeId, confidence, useGeneralPool, bufferCents } = req.body;
    
    const config = await db.routingConfig.upsert({
      where: { userId: req.user.id },
      update: {
        ...(spendMode && { spendMode }),
        ...(lockedEnvelopeId !== undefined && { lockedEnvelopeId }),
        ...(confidence !== undefined && { confidence }),
        ...(useGeneralPool !== undefined && { useGeneralPool }),
        ...(bufferCents !== undefined && { bufferCents }),
      },
      create: {
        userId: req.user.id,
        spendMode: spendMode || 'SMART_AUTO',
        lockedEnvelopeId,
        confidence: confidence || 75,
        useGeneralPool: useGeneralPool !== undefined ? useGeneralPool : true,
        bufferCents: bufferCents || 0,
      },
    });
    
    res.json({ config });
  } catch (error) {
    logger.error(error, 'Error updating routing config');
    res.status(500).json({ error: 'Failed to update routing config' });
  }
});

// Preview routing decision
router.post('/preview', async (req: any, res) => {
  try {
    const { merchant, mcc, amountCents, location } = req.body;
    
    const result = await findBestEnvelope(req.user.id, {
      amount: amountCents,
      merchantName: merchant,
      mcc,
      location,
    });
    
    if (!result.envelope) {
      return res.status(404).json({ error: 'No suitable envelope found' });
    }
    
    res.json({
      envelopeId: result.envelope.id,
      reason: result.reason,
      confidence: 85, // Mock confidence for now
    });
  } catch (error) {
    logger.error(error, 'Error previewing routing');
    res.status(500).json({ error: 'Failed to preview routing' });
  }
});

// Commit transaction to envelope
router.post('/commit', async (req: any, res) => {
  try {
    const { merchant, mcc, amountCents, location } = req.body;
    
    const result = await findBestEnvelope(req.user.id, {
      amount: amountCents,
      merchantName: merchant,
      mcc,
      location,
    });
    
    if (!result.envelope) {
      return res.status(404).json({ error: 'No suitable envelope found' });
    }
    
    const transaction = await db.transaction.create({
      data: {
        userId: req.user.id,
        merchant,
        mcc,
        amountCents: -Math.abs(amountCents), // Negative for spending
        location,
        envelopeId: result.envelope.id,
        reason: result.reason,
        status: 'SETTLED',
        postedAt: new Date(),
      },
      include: {
        envelope: { select: { id: true, name: true } },
      },
    });
    
    res.status(201).json({ transaction });
  } catch (error) {
    logger.error(error, 'Error committing transaction');
    res.status(500).json({ error: 'Failed to commit transaction' });
  }
});

export default router;