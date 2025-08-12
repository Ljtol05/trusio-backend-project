
import { Router } from 'express';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

const router = Router();

// TODO: Replace with real authentication
// For now, stub with userId = 1
export const getCurrentUser = async () => {
  let user = await db.user.findUnique({ where: { id: 1 } });
  
  if (!user) {
    user = await db.user.create({
      data: {
        id: 1,
        email: 'user@example.com',
        name: 'Demo User',
      },
    });
  }
  
  return user;
};

// Middleware to inject user into request
export const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const user = await getCurrentUser();
    req.user = user;
    next();
  } catch (error) {
    logger.error(error, 'Auth middleware error');
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Get current user
router.get('/me', requireAuth, async (req: any, res) => {
  res.json({ user: req.user });
});

export default router;
