
import { Router } from 'express';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

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
  const rules = await db.routingRule.findMany({
    where: {
      userId,
      isActive: true,
    },
    include: {
      envelope: true,
    },
    orderBy: { priority: 'asc' },
  });
  
  // Apply rules in priority order
  for (const rule of rules) {
    const conditions = rule.conditions as any;
    let matches = true;
    
    // Check MCC condition
    if (conditions.mcc && transactionData.mcc) {
      const allowedMccs = Array.isArray(conditions.mcc) ? conditions.mcc : [conditions.mcc];
      matches = matches && allowedMccs.includes(transactionData.mcc);
    }
    
    // Check merchant name condition
    if (conditions.merchantName && transactionData.merchantName) {
      const merchantPatterns = Array.isArray(conditions.merchantName) 
        ? conditions.merchantName 
        : [conditions.merchantName];
      matches = matches && merchantPatterns.some((pattern: string) => 
        transactionData.merchantName!.toLowerCase().includes(pattern.toLowerCase())
      );
    }
    
    // Check amount condition
    if (conditions.amountRange) {
      const { min, max } = conditions.amountRange;
      matches = matches && 
        transactionData.amount >= (min || 0) && 
        transactionData.amount <= (max || Infinity);
    }
    
    // Check location condition
    if (conditions.location && transactionData.location) {
      matches = matches && transactionData.location.toLowerCase()
        .includes(conditions.location.toLowerCase());
    }
    
    if (matches && rule.envelope.isActive) {
      return {
        envelope: rule.envelope,
        rule,
        reason: `Matched rule: ${rule.name}`,
      };
    }
  }
  
  // Fallback to default envelope (first active envelope)
  const defaultEnvelope = await db.envelope.findFirst({
    where: {
      userId,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
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

export default router;
