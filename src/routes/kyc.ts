import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { startKyc, getKycStatus, updateKycStatusByRef, getKycStatusByRef } from '../lib/kycStore.js';
import { authenticateToken } from './auth.js';
import { db } from '../lib/db.js';

const router = Router();

// Validation schemas
const kycFormSchema = z.object({
  legalFirstName: z.string().min(1).max(50),
  legalLastName: z.string().min(1).max(50),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  ssnLast4: z.string().regex(/^\d{4}$/, 'SSN last 4 must be exactly 4 digits'),
  addressLine1: z.string().min(1).max(100),
  addressLine2: z.string().max(100).optional(),
  city: z.string().min(1).max(50),
  state: z.string().length(2, 'State must be 2 characters'),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid postal code format'),
});

const webhookPayloadSchema = z.object({
  providerRef: z.string(),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
});

// POST /api/kyc/start - Start KYC process
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const validatedData = kycFormSchema.parse(req.body);

    // Validate DOB is not in the future and person is at least 18
    const dob = new Date(validatedData.dob);
    const now = new Date();
    const age = now.getFullYear() - dob.getFullYear();

    if (dob > now) {
      return res.status(400).json({ 
        error: 'Date of birth cannot be in the future' 
      });
    }

    if (age < 18) {
      return res.status(400).json({ 
        error: 'Must be at least 18 years old' 
      });
    }

    // Set KYC status to pending in database
    await db.user.update({
      where: { id: req.user.id },
      data: { kycApproved: false },
    });

    const result = startKyc(req.user.id, validatedData);

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid input',
        details: error.errors,
      });
    }

    logger.error({ error, userId: req.user?.id }, 'Error starting KYC process');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/kyc/status - Get current KYC status
router.get('/status', authenticateToken, (req, res) => {
  try {
    const status = getKycStatus(req.user.id);
    res.json(status);
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Error getting KYC status');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/webhooks/kyc - Webhook endpoint for KYC provider callbacks
router.post('/webhooks/kyc', async (req, res) => {
  try {
    const payload = webhookPayloadSchema.parse(req.body);

    const updated = updateKycStatusByRef(
      payload.providerRef,
      payload.decision,
      payload.reason
    );

    if (!updated) {
      return res.status(404).json({ 
        error: 'Provider reference not found' 
      });
    }

    // Update user's KYC approval status in database
    if (payload.decision === 'approved') {
      // Find user by provider reference and update their KYC status
      const kycStatus = getKycStatusByRef(payload.providerRef);
      if (kycStatus?.userId) {
        await db.user.update({
          where: { id: parseInt(kycStatus.userId) },
          data: { kycApproved: true },
        });
      }
    }

    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid webhook payload',
        details: error.errors,
      });
    }

    logger.error({ error }, 'Error processing KYC webhook');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;