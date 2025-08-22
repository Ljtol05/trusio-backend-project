
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { authenticateToken } from './auth.js';

const router = Router();

// Validation schemas
const createServiceAccountSchema = z.object({
  name: z.string().min(1, 'Service account name is required'),
  description: z.string().optional(),
  permissions: z.array(z.enum(['mcp:read', 'mcp:write', 'api:read', 'api:write'])).default(['mcp:read']),
});

const updateServiceAccountSchema = z.object({
  name: z.string().min(1, 'Service account name is required').optional(),
  description: z.string().optional(),
  permissions: z.array(z.enum(['mcp:read', 'mcp:write', 'api:read', 'api:write'])).optional(),
  enabled: z.boolean().optional(),
});

// Generate secure service account token
function generateServiceAccountToken(): { token: string; hash: string } {
  const token = `sa_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

// Middleware to authenticate service account tokens
export const authenticateServiceAccount = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || !token.startsWith('sa_')) {
    return res.status(401).json({ error: 'Service account token required' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const serviceAccount = await db.serviceAccount.findFirst({
      where: { 
        tokenHash,
        enabled: true,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    if (!serviceAccount) {
      return res.status(401).json({ error: 'Invalid or expired service account token' });
    }

    // Update last used timestamp
    await db.serviceAccount.update({
      where: { id: serviceAccount.id },
      data: { lastUsedAt: new Date() }
    });

    req.serviceAccount = serviceAccount;
    req.user = serviceAccount.user;
    next();
  } catch (error) {
    logger.error({ error: error.message }, 'Service account authentication failed');
    return res.status(403).json({ error: 'Invalid service account token' });
  }
};

// POST /api/service-accounts - Create new service account
router.post('/', authenticateToken, async (req: any, res) => {
  try {
    const { name, description, permissions } = createServiceAccountSchema.parse(req.body);

    // Check if user already has a service account with this name
    const existing = await db.serviceAccount.findFirst({
      where: { 
        userId: req.user.id,
        name
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Service account with this name already exists' });
    }

    const { token, hash } = generateServiceAccountToken();
    
    // Default expiration: 1 year
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const serviceAccount = await db.serviceAccount.create({
      data: {
        userId: req.user.id,
        name,
        description,
        tokenHash: hash,
        permissions,
        expiresAt,
      }
    });

    logger.info({ 
      userId: req.user.id,
      serviceAccountId: serviceAccount.id,
      name,
      permissions 
    }, 'Service account created');

    res.status(201).json({
      id: serviceAccount.id,
      name: serviceAccount.name,
      description: serviceAccount.description,
      permissions: serviceAccount.permissions,
      token, // Only returned once during creation
      expiresAt: serviceAccount.expiresAt,
      createdAt: serviceAccount.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Service account creation error');
    res.status(500).json({ error: 'Failed to create service account' });
  }
});

// GET /api/service-accounts - List user's service accounts
router.get('/', authenticateToken, async (req: any, res) => {
  try {
    const serviceAccounts = await db.serviceAccount.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        name: true,
        description: true,
        permissions: true,
        enabled: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ serviceAccounts });
  } catch (error) {
    logger.error(error, 'Error fetching service accounts');
    res.status(500).json({ error: 'Failed to fetch service accounts' });
  }
});

// PUT /api/service-accounts/:id - Update service account
router.put('/:id', authenticateToken, async (req: any, res) => {
  try {
    const serviceAccountId = parseInt(req.params.id);
    const updates = updateServiceAccountSchema.parse(req.body);

    const serviceAccount = await db.serviceAccount.findFirst({
      where: { 
        id: serviceAccountId,
        userId: req.user.id
      }
    });

    if (!serviceAccount) {
      return res.status(404).json({ error: 'Service account not found' });
    }

    const updated = await db.serviceAccount.update({
      where: { id: serviceAccountId },
      data: updates,
    });

    logger.info({ 
      userId: req.user.id,
      serviceAccountId,
      updates 
    }, 'Service account updated');

    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      permissions: updated.permissions,
      enabled: updated.enabled,
      lastUsedAt: updated.lastUsedAt,
      expiresAt: updated.expiresAt,
      createdAt: updated.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    logger.error(error, 'Service account update error');
    res.status(500).json({ error: 'Failed to update service account' });
  }
});

// DELETE /api/service-accounts/:id - Delete service account
router.delete('/:id', authenticateToken, async (req: any, res) => {
  try {
    const serviceAccountId = parseInt(req.params.id);

    const serviceAccount = await db.serviceAccount.findFirst({
      where: { 
        id: serviceAccountId,
        userId: req.user.id
      }
    });

    if (!serviceAccount) {
      return res.status(404).json({ error: 'Service account not found' });
    }

    await db.serviceAccount.delete({
      where: { id: serviceAccountId }
    });

    logger.info({ 
      userId: req.user.id,
      serviceAccountId,
      name: serviceAccount.name 
    }, 'Service account deleted');

    res.json({ message: 'Service account deleted successfully' });
  } catch (error) {
    logger.error(error, 'Service account deletion error');
    res.status(500).json({ error: 'Failed to delete service account' });
  }
});

// POST /api/service-accounts/:id/regenerate - Regenerate token
router.post('/:id/regenerate', authenticateToken, async (req: any, res) => {
  try {
    const serviceAccountId = parseInt(req.params.id);

    const serviceAccount = await db.serviceAccount.findFirst({
      where: { 
        id: serviceAccountId,
        userId: req.user.id
      }
    });

    if (!serviceAccount) {
      return res.status(404).json({ error: 'Service account not found' });
    }

    const { token, hash } = generateServiceAccountToken();

    await db.serviceAccount.update({
      where: { id: serviceAccountId },
      data: { tokenHash: hash }
    });

    logger.info({ 
      userId: req.user.id,
      serviceAccountId,
      name: serviceAccount.name 
    }, 'Service account token regenerated');

    res.json({
      message: 'Token regenerated successfully',
      token // Only returned during regeneration
    });
  } catch (error) {
    logger.error(error, 'Service account token regeneration error');
    res.status(500).json({ error: 'Failed to regenerate token' });
  }
});

export default router;
