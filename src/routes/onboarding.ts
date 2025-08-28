
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { onboardingAgent } from '../agents/core/OnboardingAgent.js';
import { db } from '../lib/db.js';

const router = Router();

// Validation schemas
const OnboardingResponsesSchema = z.object({
  work: z.string().min(1),
  monthlyIncome: z.number().positive().optional(),
  incomeStability: z.string().min(1),
  church: z.boolean(),
  tithe: z.boolean().optional(),
  decisionMaking: z.string().min(1),
  shoppingHabits: z.string().min(1),
  goals: z.array(z.string()).min(1),
  concerns: z.array(z.string()).min(1),
  businessExpenses: z.boolean(),
  riskTolerance: z.string().min(1),
  additionalInfo: z.string().optional(),
});

// GET /api/onboarding/questions - Get onboarding questions
router.get('/questions', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    logger.info({ userId }, 'Fetching onboarding questions');

    const questions = await onboardingAgent.getOnboardingQuestions();

    res.json({
      ok: true,
      questions,
      totalQuestions: questions.length,
      estimatedTime: '5-7 minutes',
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to fetch onboarding questions');
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch onboarding questions',
      code: 'QUESTIONS_FETCH_ERROR'
    });
  }
});

// POST /api/onboarding/submit - Submit onboarding responses
router.post('/submit', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const responses = OnboardingResponsesSchema.parse(req.body);

    logger.info({ 
      userId, 
      churchAttendance: responses.church,
      tithes: responses.tithe,
      workType: responses.work
    }, 'Processing onboarding submission');

    // Check if user already completed onboarding
    const existingUser = await db.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true }
    });

    if (existingUser?.onboardingCompleted) {
      return res.status(400).json({
        ok: false,
        error: 'Onboarding already completed',
        code: 'ALREADY_COMPLETED'
      });
    }

    // Process onboarding with intelligent user detection
    const result = await onboardingAgent.processOnboarding(userId, responses);

    // Create recommended envelopes
    const envelopePromises = result.recommendedEnvelopes.map(envelope => 
      db.envelope.create({
        data: {
          userId,
          name: envelope.name,
          targetAmount: result.profile.monthlyIncome 
            ? (result.profile.monthlyIncome * envelope.suggestedAllocation) / 100
            : envelope.suggestedAllocation * 50, // Default assumption
          balance: 0,
          category: envelope.category,
          description: envelope.purpose,
          autoAllocate: envelope.autoRoutePercentage ? true : false,
          allocationPercentage: envelope.autoRoutePercentage || null,
        }
      })
    );

    const createdEnvelopes = await Promise.all(envelopePromises);

    // Mark onboarding as completed
    await db.user.update({
      where: { id: userId },
      data: { 
        onboardingCompleted: true,
        userType: result.profile.userType,
      }
    });

    // Log critical tithe setup
    if (result.profile.needsTitheEnvelope) {
      logger.info({
        userId,
        titheEnvelopeCreated: true,
        autoRoute: '10%',
        churchAttendance: result.profile.churchAttendance,
        paysTithes: result.profile.paysTithes
      }, 'Tithe envelope auto-routing enabled');
    }

    res.json({
      ok: true,
      message: 'Onboarding completed successfully',
      profile: {
        userType: result.profile.userType,
        spendingPersonality: result.profile.spendingPersonality,
        needsTitheEnvelope: result.profile.needsTitheEnvelope,
        monthlyIncome: result.profile.monthlyIncome,
        coachingFocus: result.coachingFocus,
      },
      envelopes: {
        created: createdEnvelopes.length,
        titheEnvelope: result.profile.needsTitheEnvelope,
        autoRouting: result.profile.needsTitheEnvelope ? '10% to Tithe & Giving' : 'None',
      },
      billAnalysis: result.billAnalysis ? {
        detectedBills: result.billAnalysis.detectedBills.length,
        totalMonthlyBills: result.billAnalysis.totalMonthlyBills,
        recommendedBillsAmount: result.billAnalysis.recommendedBillsEnvelopeAmount,
        topBills: result.billAnalysis.detectedBills.slice(0, 5),
      } : null,
      welcome: result.personalizedWelcome,
      nextSteps: result.nextSteps,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Onboarding submission failed');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid onboarding responses',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to process onboarding',
      code: 'ONBOARDING_ERROR'
    });
  }
});

// GET /api/onboarding/status - Check onboarding status
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { 
        onboardingCompleted: true,
        userType: true,
        createdAt: true,
      }
    });

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const envelopeCount = await db.envelope.count({
      where: { userId }
    });

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

    res.json({
      ok: true,
      onboardingCompleted: user.onboardingCompleted || false,
      userType: user.userType,
      memberSince: user.createdAt,
      envelopeCount,
      hasTitheEnvelope: !!hasTitheEnvelope,
      titheAutoRouting: hasTitheEnvelope?.autoAllocate || false,
      needsOnboarding: !user.onboardingCompleted,
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to check onboarding status');
    res.status(500).json({
      ok: false,
      error: 'Failed to check onboarding status',
      code: 'STATUS_CHECK_ERROR'
    });
  }
});

// POST /api/onboarding/retake - Allow users to retake onboarding
router.post('/retake', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    logger.info({ userId }, 'User requesting to retake onboarding');

    // Reset onboarding status (but keep existing envelopes)
    await db.user.update({
      where: { id: userId },
      data: { 
        onboardingCompleted: false,
        userType: null,
      }
    });

    res.json({
      ok: true,
      message: 'Onboarding reset successfully',
      note: 'Your existing envelopes have been preserved',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to reset onboarding');
    res.status(500).json({
      ok: false,
      error: 'Failed to reset onboarding',
      code: 'RESET_ERROR'
    });
  }
});

export default router;
