
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';
import { CreateCardSchema, UpdateCardSchema } from '../types/dto.js';

const router = Router();
router.use(requireAuth);

// Get all cards
router.get('/', async (req: any, res) => {
  try {
    const cards = await db.card.findMany({
      where: { userId: req.user.id },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'asc' },
      ],
    });
    
    res.json({ cards });
  } catch (error) {
    logger.error(error, 'Error fetching cards');
    res.status(500).json({ error: 'Failed to fetch cards' });
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
    
    // Generate mock last4 digits
    const last4 = Math.floor(1000 + Math.random() * 9000).toString();
    
    const card = await db.card.create({
      data: {
        ...data,
        last4,
        userId: req.user.id,
      },
    });
    
    res.status(201).json({ card });
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
