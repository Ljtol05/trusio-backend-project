
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';
import { CreateEnvelopeSchema, UpdateEnvelopeSchema } from '../types/dto.js';

const router = Router();
router.use(requireAuth);

// Get all envelopes
router.get('/', async (req: any, res) => {
  try {
    const envelopes = await db.envelope.findMany({
      where: { userId: req.user.id },
      orderBy: { name: 'asc' },
    });
    
    res.json({ envelopes });
  } catch (error) {
    logger.error(error, 'Error fetching envelopes');
    res.status(500).json({ error: 'Failed to fetch envelopes' });
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
    const data = CreateEnvelopeSchema.parse(req.body);
    
    const envelope = await db.envelope.create({
      data: {
        ...data,
        userId: req.user.id,
      },
    });
    
    res.status(201).json({ envelope });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
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
