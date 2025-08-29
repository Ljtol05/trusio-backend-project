
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { voiceKYCAgent } from '../agents/core/VoiceKYCAgent.js';

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

// POST /api/voice-onboarding/start - Initialize voice KYC onboarding session
router.post('/start', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    logger.info({ userId }, 'Starting voice KYC onboarding session');

    // Verify prerequisites
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { 
        emailVerified: true,
        phoneVerified: true,
        kycApproved: true,
        plaidConnected: true,
        transactionDataReady: true
      }
    });

    if (!user?.emailVerified) {
      return res.status(400).json({
        ok: false,
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
        nextStep: 'verify_email'
      });
    }

    if (!user?.phoneVerified) {
      return res.status(400).json({
        ok: false,
        error: 'Phone verification required',
        code: 'PHONE_NOT_VERIFIED',
        nextStep: 'verify_phone'
      });
    }

    if (!user?.kycApproved) {
      return res.status(400).json({
        ok: false,
        error: 'KYC verification required',
        code: 'KYC_NOT_APPROVED',
        nextStep: 'complete_kyc'
      });
    }

    if (!user?.plaidConnected || !user?.transactionDataReady) {
      return res.status(400).json({
        ok: false,
        error: 'Bank account connection and transaction sync required',
        code: 'PLAID_NOT_CONNECTED',
        nextStep: 'connect_bank_accounts'
      });
    }

    // Initialize voice KYC session
    const session = await voiceKYCAgent.startVoiceKYCSession(userId);

    // Get transaction insights for frontend display
    const transactionInsights = await voiceKYCAgent.getTransactionInsights(userId);

    res.json({
      ok: true,
      sessionId: session.sessionId,
      initialGreeting: session.conversationHistory[0]?.content,
      isVoiceActive: session.isVoiceActive,
      stage: session.stage,
      transactionAnalysis: {
        totalTransactions: session.transactionAnalysis.totalTransactions,
        monthlySpending: session.transactionAnalysis.averageMonthlySpending,
        monthlyIncome: session.transactionAnalysis.averageMonthlyIncome,
        billCount: session.billAnalysis.detectedBills.length,
        savingsRate: session.transactionAnalysis.savingsRate,
        userType: session.financialProfile.userType,
        topCategories: session.transactionAnalysis.topSpendingCategories.slice(0, 3)
      },
      progress: {
        questionsAnswered: 0,
        totalQuestions: 12,
        stage: session.stage
      }
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to start voice KYC onboarding');
    
    if (error.message.includes('must complete')) {
      return res.status(400).json({
        ok: false,
        error: error.message,
        code: 'PREREQUISITES_NOT_MET'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to start voice KYC onboarding session',
      code: 'VOICE_ONBOARDING_START_ERROR'
    });
  }
});

// POST /api/voice-onboarding/input - Process voice input
router.post('/input', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId, transcription, audioMetadata } = VoiceInputSchema.parse(req.body);

    logger.info({ userId, sessionId, transcriptionLength: transcription.length }, 'Processing voice input');

    const result = await voiceKYCAgent.processVoiceInput(
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
      stage: result.stage,
      progress: result.progress
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

    logger.info({ userId, sessionId }, 'Getting voice KYC session status');

    const session = await voiceKYCAgent.getSessionStatus(sessionId, userId);
    
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    const transactionInsights = await voiceKYCAgent.getTransactionInsights(userId);

    res.json({
      ok: true,
      sessionId,
      isActive: session.isVoiceActive,
      stage: session.stage,
      onboardingComplete: session.stage === 'completed',
      progress: {
        questionsAnswered: Object.keys(session.responses).length,
        totalQuestions: 12,
        currentStage: session.stage
      },
      transactionInsights,
      conversationLength: session.conversationHistory?.length || 0,
      lastActivity: session.lastActivity,
      budgetReady: !!session.responses.budgetRecommendations
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

// POST /api/voice-onboarding/switch-to-text - Switch from voice to text mode for budget review
router.post('/switch-to-text', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.body;

    logger.info({ userId, sessionId }, 'Switching to text mode for budget review');

    const session = await voiceKYCAgent.getSessionStatus(sessionId, userId);
    
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Get budget recommendations from session
    const budgetRecommendations = session.responses.budgetRecommendations;

    res.json({
      ok: true,
      message: 'Switched to text mode for budget review',
      chatEndpoint: '/api/ai/coach',
      budgetReviewReady: true,
      budgetRecommendations,
      sessionSummary: {
        transactionAnalysis: {
          totalTransactions: session.transactionAnalysis.totalTransactions,
          monthlySpending: session.transactionAnalysis.averageMonthlySpending,
          monthlyIncome: session.transactionAnalysis.averageMonthlyIncome,
          savingsRate: session.transactionAnalysis.savingsRate
        },
        userProfile: {
          userType: session.financialProfile.userType,
          spendingPersonality: session.financialProfile.spendingPersonality,
          riskProfile: session.financialProfile.riskProfile
        },
        responses: session.responses
      }
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

// GET /api/voice-onboarding/budget/:sessionId - Get created budget
router.get('/budget/:sessionId', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    const session = await voiceKYCAgent.getSessionStatus(sessionId, userId);
    
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    const budgetRecommendations = session.responses.budgetRecommendations;
    
    if (!budgetRecommendations) {
      return res.status(400).json({
        ok: false,
        error: 'Budget not yet created',
        code: 'BUDGET_NOT_READY'
      });
    }

    res.json({
      ok: true,
      budget: budgetRecommendations,
      sessionSummary: {
        userType: session.financialProfile.userType,
        monthlyIncome: session.transactionAnalysis.averageMonthlyIncome,
        monthlySpending: session.transactionAnalysis.averageMonthlySpending,
        billCount: session.billAnalysis.detectedBills.length,
        savingsRate: session.transactionAnalysis.savingsRate
      }
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to get budget');
    res.status(500).json({
      ok: false,
      error: 'Failed to get budget',
      code: 'BUDGET_FETCH_ERROR'
    });
  }
});

// POST /api/voice-onboarding/approve-budget - Approve and implement the created budget
router.post('/approve-budget', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId, modifications } = req.body;

    logger.info({ userId, sessionId }, 'Approving and implementing budget');

    const session = await voiceKYCAgent.getSessionStatus(sessionId, userId);
    
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    const budgetRecommendations = session.responses.budgetRecommendations;
    
    if (!budgetRecommendations) {
      return res.status(400).json({
        ok: false,
        error: 'Budget not ready for approval',
        code: 'BUDGET_NOT_READY'
      });
    }

    // Create envelopes based on recommendations
    const createdEnvelopes = [];
    let order = 1;

    for (const envelope of budgetRecommendations.recommendedEnvelopes) {
      const suggestedAmount = Math.round(
        (envelope.suggestedAllocation / 100) * session.transactionAnalysis.averageMonthlyIncome * 100
      );

      const createdEnvelope = await db.envelope.create({
        data: {
          userId,
          name: envelope.name,
          balanceCents: 0, // Start with 0, user will allocate funds
          targetCents: suggestedAmount,
          icon: this.getIconForCategory(envelope.category),
          color: this.getColorForCategory(envelope.category),
          category: envelope.category,
          order: order++,
          isActive: true,
          description: envelope.purpose
        }
      });

      createdEnvelopes.push(createdEnvelope);
    }

    // Mark user as onboarded
    await db.user.update({
      where: { id: userId },
      data: {
        onboardingCompleted: true,
        userType: session.financialProfile.userType,
        budgetCreatedAt: new Date()
      }
    });

    // End the voice session
    await voiceKYCAgent.endSession(sessionId);

    res.json({
      ok: true,
      message: 'Budget approved and implemented successfully',
      envelopes: createdEnvelopes,
      nextSteps: [
        'Allocate funds to your envelopes',
        'Set up automatic routing rules',
        'Start tracking your spending',
        'Review your budget monthly'
      ]
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to approve budget');
    res.status(500).json({
      ok: false,
      error: 'Failed to approve budget',
      code: 'BUDGET_APPROVAL_ERROR'
    });
  }
});

// POST /api/voice-onboarding/end - End voice onboarding session
router.post('/end', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.body;

    logger.info({ userId, sessionId }, 'Ending voice KYC onboarding session');

    const success = await voiceKYCAgent.endSession(sessionId);

    if (!success) {
      return res.status(404).json({
        ok: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    res.json({
      ok: true,
      message: 'Voice KYC onboarding session ended successfully'
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

// Helper functions
function getIconForCategory(category: string): string {
  const iconMap: Record<string, string> = {
    'giving': 'heart',
    'necessities': 'home',
    'security': 'shield',
    'taxes': 'receipt',
    'business': 'briefcase',
    'lifestyle': 'coffee',
    'savings': 'piggy-bank',
    'transportation': 'car',
    'food': 'utensils'
  };
  return iconMap[category] || 'wallet';
}

function getColorForCategory(category: string): string {
  const colorMap: Record<string, string> = {
    'giving': 'pink',
    'necessities': 'blue',
    'security': 'green',
    'taxes': 'orange',
    'business': 'purple',
    'lifestyle': 'amber',
    'savings': 'emerald',
    'transportation': 'gray',
    'food': 'red'
  };
  return colorMap[category] || 'slate';
}

export default router;
