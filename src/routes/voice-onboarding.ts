
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

    logger.info({ userId, sessionId }, 'Getting session status');

    // Get session from personal AI
    const session = await personalAI.getSessionStatus(sessionId, userId);
    
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    res.json({
      ok: true,
      sessionId,
      isActive: session.isActive,
      isVoiceActive: session.isVoiceActive,
      onboardingComplete: session.onboardingComplete,
      progress: {
        questionsAnswered: session.currentContext?.questionsAnswered || 0,
        totalQuestions: session.currentContext?.totalQuestions || 12,
        currentStage: session.currentContext?.stage || 'greeting'
      },
      hasTransactionData: !!session.transactionInsights,
      conversationLength: session.conversationHistory?.length || 0
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

    // Get session data for budget recommendations
    const session = await personalAI.getSessionStatus(sessionId, userId);
    
    res.json({
      ok: true,
      message: 'Switched to text mode for budget review',
      chatEndpoint: '/api/ai/coach',
      budgetReviewReady: true,
      budgetRecommendations: session?.budgetRecommendations || null
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

// POST /api/voice-onboarding/end - End voice onboarding session
router.post('/end', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.body;

    logger.info({ userId, sessionId }, 'Ending voice onboarding session');

    await personalAI.endSession(sessionId);

    res.json({
      ok: true,
      message: 'Voice onboarding session ended successfully'
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to end session');
    res.status(500).json({
      ok: false,
      error: 'Failed to end session',
      code: 'SESSION_END_ERROR'
    });
  }
});

export default router;
