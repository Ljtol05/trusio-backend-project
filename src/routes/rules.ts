
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { authenticateToken } from './auth.js';

const router = Router();
router.use(authenticateToken);

// Validation schemas
const CreateRuleSchema = z.object({
  priority: z.number().min(0).optional(),
  mcc: z.string().optional(),
  merchant: z.string().optional(),
  geofence: z.string().optional(),
  envelopeId: z.number().optional(),
});

const UpdateRuleSchema = z.object({
  priority: z.number().min(0).optional(),
  mcc: z.string().optional(),
  merchant: z.string().optional(),
  geofence: z.string().optional(),
  envelopeId: z.number().optional(),
  enabled: z.boolean().optional(),
});

// Get all routing rules
router.get('/', async (req: any, res) => {
  try {
    const rules = await db.rule.findMany({
      where: { userId: req.user.id },
      include: {
        envelope: { select: { id: true, name: true } },
      },
      orderBy: { priority: 'asc' },
    });
    
    res.json({ rules });
  } catch (error) {
    logger.error(error, 'Error fetching routing rules');
    res.status(500).json({ error: 'Failed to fetch routing rules' });
  }
});

// Get rule by ID
router.get('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const rule = await db.rule.findFirst({
      where: { id, userId: req.user.id },
      include: {
        envelope: { select: { id: true, name: true } },
      },
    });
    
    if (!rule) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    
    res.json({ rule });
  } catch (error) {
    logger.error(error, 'Error fetching routing rule');
    res.status(500).json({ error: 'Failed to fetch routing rule' });
  }
});

// Create routing rule
router.post('/', async (req: any, res) => {
  try {
    const data = CreateRuleSchema.parse(req.body);
    
    // Validate envelope exists and belongs to user if provided
    if (data.envelopeId) {
      const envelope = await db.envelope.findFirst({
        where: { id: data.envelopeId, userId: req.user.id },
      });
      
      if (!envelope) {
        return res.status(400).json({ error: 'Invalid envelope selection' });
      }
    }
    
    const rule = await db.rule.create({
      data: {
        ...data,
        userId: req.user.id,
      },
      include: {
        envelope: { select: { id: true, name: true } },
      },
    });
    
    res.status(201).json({ rule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error creating routing rule');
    res.status(500).json({ error: 'Failed to create routing rule' });
  }
});

// Update routing rule
router.patch('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = UpdateRuleSchema.parse(req.body);
    
    const rule = await db.rule.updateMany({
      where: { id, userId: req.user.id },
      data,
    });
    
    if (rule.count === 0) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    
    const updatedRule = await db.rule.findUnique({
      where: { id },
      include: {
        envelope: { select: { id: true, name: true } },
      },
    });
    
    res.json({ rule: updatedRule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error updating routing rule');
    res.status(500).json({ error: 'Failed to update routing rule' });
  }
});

// Delete routing rule
router.delete('/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const deleted = await db.rule.deleteMany({
      where: { id, userId: req.user.id },
    });
    
    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Routing rule not found' });
    }
    
    res.json({ message: 'Routing rule deleted successfully' });
  } catch (error) {
    logger.error(error, 'Error deleting routing rule');
    res.status(500).json({ error: 'Failed to delete routing rule' });
  }
});

// Reorder rules
router.post('/reorder', async (req: any, res) => {
  try {
    const { ruleIds } = req.body;
    
    if (!Array.isArray(ruleIds)) {
      return res.status(400).json({ error: 'ruleIds must be an array' });
    }
    
    // Update priorities based on array order
    const updates = ruleIds.map((id, index) => 
      db.rule.updateMany({
        where: { id: parseInt(id), userId: req.user.id },
        data: { priority: index },
      })
    );
    
    await Promise.all(updates);
    
    const rules = await db.rule.findMany({
      where: { userId: req.user.id },
      include: {
        envelope: { select: { id: true, name: true } },
      },
      orderBy: { priority: 'asc' },
    });
    
    res.json({ rules });
  } catch (error) {
    logger.error(error, 'Error reordering rules');
    res.status(500).json({ error: 'Failed to reorder rules' });
  }
});

export default router;
