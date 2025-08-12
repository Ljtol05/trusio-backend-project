import { Router } from 'express';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Stub auth middleware
export const requireAuth = (req: any, res: any, next: any) => {
  // For now, always use the first user (stub)
  req.user = { id: 1 };
  next();
};

// Get current user (stub)
router.get('/me', async (req, res) => {
  try {
    const user = await db.user.findUnique({
      where: { id: 1 },
      select: { id: true, email: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    logger.error(error, 'Error fetching user');
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;