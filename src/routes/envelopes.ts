import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { db } from '../lib/db.js';
import { envelopeSystem } from '../lib/envelopeSystem.js';
import { envelopeAutoRouter } from '../lib/envelopeAutoRouter.js';
import { apiSecurityMiddleware } from '../middleware/security.js';
import { validateEnvelope, validateParams } from '../middleware/validation.js';

const router = Router();

// Apply security middleware to all envelope routes
router.use(apiSecurityMiddleware);

// Validation schemas
const CreateEnvelopeSchema = z.object({
  name: z.string().min(1).max(50),
  icon: z.string().optional(),
  color: z.string().optional(),
  targetAmount: z.number().positive().optional(),
  autoAllocate: z.boolean().default(false),
  allocationPercentage: z.number().min(0).max(100).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
});

const UpdateEnvelopeSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  targetAmount: z.number().positive().optional(),
  autoAllocate: z.boolean().optional(),
  allocationPercentage: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/envelopes - Get all user envelopes
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const envelopes = await db.envelope.findMany({
      where: { userId },
      orderBy: [
        { order: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    // Get auto-routing configuration
    const autoRoutingConfig = await envelopeAutoRouter.getAutoRoutingConfig(userId);

    res.json({
      ok: true,
      envelopes: envelopes.map(envelope => ({
        id: envelope.id,
        name: envelope.name,
        icon: envelope.icon,
        color: envelope.color,
        balance: envelope.balanceCents / 100,
        targetAmount: envelope.targetAmount,
        spentThisMonth: envelope.spentThisMonth / 100,
        category: envelope.category,
        description: envelope.description,
        priority: envelope.priority,
        autoAllocate: envelope.autoAllocate,
        allocationPercentage: envelope.allocationPercentage,
        isActive: envelope.isActive,
        order: envelope.order,
        createdAt: envelope.createdAt,
      })),
      count: envelopes.length,
      maxEnvelopes: 10,
      autoRouting: autoRoutingConfig,
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to fetch envelopes');
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch envelopes',
      code: 'ENVELOPE_FETCH_ERROR'
    });
  }
});

// POST /api/envelopes - Create new envelope
router.post('/', auth, validateEnvelope.create, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = CreateEnvelopeSchema.parse(req.body);

    // Validate envelope count limit
    const validation = await envelopeSystem.validateEnvelopeCount(userId);
    if (validation.isAtLimit) {
      return res.status(400).json({
        ok: false,
        error: 'Cannot create more envelopes',
        details: `Maximum of 10 envelopes allowed. Current: ${validation.currentCount}`,
        code: 'ENVELOPE_LIMIT_REACHED'
      });
    }

    // Check for duplicate names
    const existingEnvelope = await db.envelope.findFirst({
      where: {
        userId,
        name: data.name,
        isActive: true
      }
    });

    if (existingEnvelope) {
      return res.status(400).json({
        ok: false,
        error: 'Envelope name already exists',
        code: 'DUPLICATE_ENVELOPE_NAME'
      });
    }

    // Validate auto-allocation percentage
    if (data.autoAllocate && !data.allocationPercentage) {
      return res.status(400).json({
        ok: false,
        error: 'Auto-allocation percentage required when auto-allocate is enabled',
        code: 'MISSING_ALLOCATION_PERCENTAGE'
      });
    }

    const envelope = await db.envelope.create({
      data: {
        userId,
        name: data.name,
        icon: data.icon,
        color: data.color || 'blue',
        targetAmount: data.targetAmount || 0,
        balanceCents: 0,
        autoAllocate: data.autoAllocate,
        allocationPercentage: data.autoAllocate ? data.allocationPercentage : null,
        category: data.category,
        description: data.description,
        priority: 'important', // Default priority
      }
    });

    logger.info({
      userId,
      envelopeId: envelope.id,
      name: envelope.name,
      autoAllocate: envelope.autoAllocate,
      allocationPercentage: envelope.allocationPercentage
    }, 'Envelope created');

    res.status(201).json({
      ok: true,
      envelope: {
        id: envelope.id,
        name: envelope.name,
        icon: envelope.icon,
        color: envelope.color,
        balance: 0,
        targetAmount: envelope.targetAmount,
        autoAllocate: envelope.autoAllocate,
        allocationPercentage: envelope.allocationPercentage,
        category: envelope.category,
        description: envelope.description,
        isActive: envelope.isActive,
        createdAt: envelope.createdAt,
      },
      message: 'Envelope created successfully',
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to create envelope');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid envelope data',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to create envelope',
      code: 'ENVELOPE_CREATE_ERROR'
    });
  }
});

// GET /api/envelopes/recommendations - Get envelope recommendations
router.get('/recommendations', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get user profile information
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        userType: true,
        onboardingCompleted: true,
      }
    });

    if (!user?.onboardingCompleted) {
      return res.status(400).json({
        ok: false,
        error: 'Please complete onboarding first',
        code: 'ONBOARDING_REQUIRED'
      });
    }

    // Check if user has tithe envelope (indicates church attendance + tithing)
    const hasTitheEnvelope = await db.envelope.findFirst({
      where: { 
        userId,
        OR: [
          { name: { contains: 'tithe', mode: 'insensitive' } },
          { name: { contains: 'giving', mode: 'insensitive' } },
          { category: 'giving' }
        ]
      }
    });

    const config = {
      userId,
      userType: (user.userType as 'consumer' | 'creator' | 'hybrid') || 'consumer',
      needsTitheEnvelope: !!hasTitheEnvelope,
      hasBusinessExpenses: user.userType !== 'consumer',
      preferredCount: 8,
    };

    const recommendations = await envelopeSystem.generateEnvelopeRecommendations(config);

    res.json({
      ok: true,
      recommendations: recommendations.envelopes.map(env => ({
        name: env.name,
        icon: env.icon,
        color: env.color,
        category: env.category,
        description: env.description,
        suggestedAllocation: env.suggestedAllocation,
        priority: env.priority,
        autoRoutePercentage: env.autoRoutePercentage,
        isConditional: env.isConditional,
      })),
      totalAllocation: recommendations.totalAllocation,
      titheIncluded: recommendations.titheIncluded,
      adjustmentsNeeded: recommendations.adjustmentsNeeded,
      maxEnvelopes: 10,
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get envelope recommendations');
    res.status(500).json({
      ok: false,
      error: 'Failed to get envelope recommendations',
      code: 'RECOMMENDATIONS_ERROR'
    });
  }
});

// POST /api/envelopes/create-from-template - Create envelopes from recommendations
router.post('/create-from-template', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { envelopes: selectedEnvelopes, monthlyIncome } = z.object({
      envelopes: z.array(z.string()),
      monthlyIncome: z.number().positive().optional(),
    }).parse(req.body);

    // Get available templates
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    const userType = (user?.userType as 'consumer' | 'creator' | 'hybrid') || 'consumer';
    const templates = envelopeSystem.getEnvelopeTemplates(userType, true);

    // Filter templates by selected names
    const selectedTemplates = templates.filter(template => 
      selectedEnvelopes.includes(template.name)
    );

    if (selectedTemplates.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'No valid envelope templates selected',
        code: 'NO_TEMPLATES_SELECTED'
      });
    }

    // Validate envelope count
    const validation = await envelopeSystem.validateEnvelopeCount(userId);
    if (selectedTemplates.length > validation.availableSlots) {
      return res.status(400).json({
        ok: false,
        error: `Cannot create ${selectedTemplates.length} envelopes. Only ${validation.availableSlots} slots available.`,
        code: 'ENVELOPE_LIMIT_EXCEEDED'
      });
    }

    // Create envelopes
    const result = await envelopeSystem.createUserEnvelopes(
      userId,
      selectedTemplates,
      monthlyIncome
    );

    res.status(201).json({
      ok: true,
      message: 'Envelopes created successfully from templates',
      created: result.created,
      envelopes: result.envelopes,
      titheSetup: result.titheSetup,
      autoRouting: result.titheSetup ? '10% automatically routed to Tithe & Giving' : 'None',
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to create envelopes from template');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid request data',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to create envelopes from templates',
      code: 'TEMPLATE_CREATE_ERROR'
    });
  }
});

// PUT /api/envelopes/:id - Update envelope
router.put('/:id', auth, validateParams.id, validateEnvelope.update, async (req, res) => {
  try {
    const userId = req.user!.id;
    const envelopeId = parseInt(req.params.id);
    const data = UpdateEnvelopeSchema.parse(req.body);

    const envelope = await db.envelope.findFirst({
      where: { id: envelopeId, userId }
    });

    if (!envelope) {
      return res.status(404).json({
        ok: false,
        error: 'Envelope not found',
        code: 'ENVELOPE_NOT_FOUND'
      });
    }

    // Check for duplicate names if name is being changed
    if (data.name && data.name !== envelope.name) {
      const existingEnvelope = await db.envelope.findFirst({
        where: {
          userId,
          name: data.name,
          id: { not: envelopeId },
          isActive: true
        }
      });

      if (existingEnvelope) {
        return res.status(400).json({
          ok: false,
          error: 'Envelope name already exists',
          code: 'DUPLICATE_ENVELOPE_NAME'
        });
      }
    }

    const updatedEnvelope = await db.envelope.update({
      where: { id: envelopeId },
      data: {
        ...data,
        allocationPercentage: data.autoAllocate ? data.allocationPercentage : null,
      }
    });

    logger.info({
      userId,
      envelopeId,
      changes: data
    }, 'Envelope updated');

    res.json({
      ok: true,
      envelope: {
        id: updatedEnvelope.id,
        name: updatedEnvelope.name,
        icon: updatedEnvelope.icon,
        color: updatedEnvelope.color,
        balance: updatedEnvelope.balanceCents / 100,
        targetAmount: updatedEnvelope.targetAmount,
        autoAllocate: updatedEnvelope.autoAllocate,
        allocationPercentage: updatedEnvelope.allocationPercentage,
        category: updatedEnvelope.category,
        description: updatedEnvelope.description,
        isActive: updatedEnvelope.isActive,
        updatedAt: updatedEnvelope.updatedAt,
      },
      message: 'Envelope updated successfully',
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to update envelope');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid update data',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to update envelope',
      code: 'ENVELOPE_UPDATE_ERROR'
    });
  }
});

// GET /api/envelopes/validation - Validate envelope system status
router.get('/validation', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const validation = await envelopeSystem.validateEnvelopeCount(userId);
    const autoRouting = await envelopeAutoRouter.getAutoRoutingConfig(userId);

    res.json({
      ok: true,
      validation,
      autoRouting,
      systemLimits: {
        maxEnvelopes: 10,
        maxAutoRoutePercentage: 100,
      }
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to validate envelope system');
    res.status(500).json({
      ok: false,
      error: 'Failed to validate envelope system',
      code: 'VALIDATION_ERROR'
    });
  }
});

export default router;