import { Router } from 'express';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Replit Auth middleware
export const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const userId = req.headers['x-replit-user-id'];
    const userName = req.headers['x-replit-user-name'];
    const userEmail = req.headers['x-replit-user-name'] + '@replit.com'; // Fallback email

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Find or create user
    let user = await db.user.findFirst({
      where: { email: userEmail },
    });

    if (!user) {
      user = await db.user.create({
        data: {
          email: userEmail,
          name: userName,
        },
      });
      logger.info({ userId: user.id, email: userEmail }, 'Created new user');
    }

    req.user = { id: user.id };
    next();
  } catch (error) {
    logger.error(error, 'Auth middleware error');
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Get current user
router.get('/me', requireAuth, async (req: any, res) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true },
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