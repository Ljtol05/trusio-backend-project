
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { personalAI } from '../agents/core/PersonalAI.js';

const router = Router();

// Schema for voice input
const VoiceInputSchema = z.object({
  sessionId: z.string(),
  audioData: z.string().optional(), // Base64 encoded audio
  transcription: z.string(),
  audioMetadata: z.object({
    duration: z.number(),
    sampleRate: z.number().optional(),
    language: z.string().default('en-US')
  }).optional()
});

// POST /api/voice-onboarding/start - Initialize voice onboarding
router.post('/start', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    logger.info({ userId }, 'Starting voice onboarding session');

    // Initialize personal AI and start voice session
    const session = await personalAI.startVoiceOnboarding(userId);

    res.json({
      ok: true,
      sessionId: session.sessionId,
      initialGreeting: session.conversationHistory[0]?.content,
      isVoiceActive: session.isVoiceActive,
      context: {
        stage: session.currentContext.stage,
        progress: {
          questionsAnswered: session.currentContext.questionsAnswered,
          totalQuestions: session.currentContext.totalQuestions
        }
      },
      transactionInsights: {
        hasData: !!session.transactionInsights,
        summary: session.transactionInsights ? {
          billCount: session.transactionInsights.billCount,
          monthlySpending: session.transactionInsights.averageMonthlySpending
        } : null
      }
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to start voice onboarding');
    res.status(500).json({
      ok: false,
      error: 'Failed to start voice onboarding session',
      code: 'VOICE_ONBOARDING_START_ERROR'
    });
  }
});

// POST /api/voice-onboarding/input - Process voice input
router.post('/input', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId, transcription, audioMetadata } = VoiceInputSchema.parse(req.body);

    logger.info({ userId, sessionId }, 'Processing voice input');

    const result = await personalAI.processVoiceInput(
      sessionId,
      transcription,
      audioMetadata
    );

    res.json({
      ok: true,
      response: result.response,
      shouldContinueVoice: result.shouldContinueVoice,
      onboardingComplete: result.onboardingComplete,
      nextAction: result.nextAction,
      progress: result.onboardingComplete ? null : {
        // Progress tracking would be available from session
      }
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to process voice input');
    res.status(500).json({
      ok: false,
      error: 'Failed to process voice input',
      code: 'VOICE_INPUT_PROCESSING_ERROR'
    });
  }
});

// GET /api/voice-onboarding/status/:sessionId - Get session status
router.get('/status/:sessionId', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    // Implementation would get session status
    // For now, return basic structure
    res.json({
      ok: true,
      sessionId,
      isActive: true,
      isVoiceActive: true,
      onboardingComplete: false,
      progress: {
        questionsAnswered: 3,
        totalQuestions: 12,
        currentStage: 'financial_goals'
      }
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get session status');
    res.status(500).json({
      ok: false,
      error: 'Failed to get session status',
      code: 'SESSION_STATUS_ERROR'
    });
  }
});

// POST /api/voice-onboarding/switch-to-text - Switch from voice to text mode
router.post('/switch-to-text', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.body;

    logger.info({ userId, sessionId }, 'Switching to text mode for budget review');

    // Implementation would switch session mode
    res.json({
      ok: true,
      message: 'Switched to text mode for budget review',
      chatEndpoint: '/api/ai/coach',
      budgetReviewReady: true
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to switch to text mode');
    res.status(500).json({
      ok: false,
      error: 'Failed to switch to text mode',
      code: 'MODE_SWITCH_ERROR'
    });
  }
});

export default router;
