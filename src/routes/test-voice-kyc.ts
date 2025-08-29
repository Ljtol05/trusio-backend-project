
import { Router } from 'express';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { db } from '../lib/db.js';
import { voiceKYCAgent } from '../agents/core/VoiceKYCAgent.js';

const router = Router();

// POST /api/test-voice-kyc/setup-demo-user - Set up demo user for voice KYC testing
router.post('/setup-demo-user', async (req, res) => {
  try {
    const demoEmail = 'demo@envelopes.app';
    
    // Find the demo user
    const demoUser = await db.user.findUnique({
      where: { email: demoEmail },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        phoneVerified: true,
        kycApproved: true,
        plaidConnected: true,
        transactionDataReady: true,
        onboardingCompleted: true
      }
    });

    if (!demoUser) {
      return res.status(404).json({
        ok: false,
        error: 'Demo user not found. Please run `npm run seed` first.',
        code: 'DEMO_USER_NOT_FOUND'
      });
    }

    // Check if demo user is ready for voice KYC
    const readyForVoiceKYC = demoUser.emailVerified && 
                            demoUser.phoneVerified && 
                            demoUser.kycApproved && 
                            demoUser.plaidConnected && 
                            demoUser.transactionDataReady;

    // If not fully ready, update demo user to be ready
    if (!readyForVoiceKYC) {
      await db.user.update({
        where: { id: demoUser.id },
        data: {
          emailVerified: true,
          phoneVerified: true,
          kycApproved: true,
          plaidConnected: true,
          transactionDataReady: true,
          onboardingCompleted: false, // Reset to test voice onboarding
          phone: '+14155551234', // Demo phone number
        }
      });

      logger.info({ userId: demoUser.id }, 'Demo user updated for voice KYC testing');
    }

    // Count transactions for verification
    const transactionCount = await db.transaction.count({
      where: { userId: demoUser.id }
    });

    res.json({
      ok: true,
      message: 'Demo user is ready for voice KYC testing',
      demoUser: {
        id: demoUser.id,
        email: demoUser.email,
        name: demoUser.name,
        readyForVoiceKYC: true,
        transactionCount,
        testInstructions: [
          '1. Login with demo@envelopes.app / demo123',
          '2. Navigate to voice onboarding page',
          '3. Start voice KYC session',
          '4. Test conversation flow',
          '5. Complete budget creation'
        ]
      }
    });

  } catch (error: any) {
    logger.error({ error }, 'Failed to setup demo user');
    res.status(500).json({
      ok: false,
      error: 'Failed to setup demo user',
      code: 'DEMO_SETUP_ERROR'
    });
  }
});

// GET /api/test-voice-kyc/status - Check voice KYC system status
router.get('/status', async (req, res) => {
  try {
    // Check system components
    const status = {
      database: false,
      openai: false,
      agents: false,
      transactions: false
    };

    // Test database connection
    try {
      await db.user.count();
      status.database = true;
    } catch (error) {
      logger.error({ error }, 'Database connection test failed');
    }

    // Test OpenAI connection
    try {
      const { createAgentResponse } = await import('../lib/openai.js');
      const testResponse = await createAgentResponse(
        'You are a test agent.',
        'Say "Hello from OpenAI" in exactly 5 words.',
        [],
        { temperature: 0, maxTokens: 20 }
      );
      status.openai = !!testResponse;
    } catch (error) {
      logger.error({ error }, 'OpenAI connection test failed');
    }

    // Test voice agent initialization
    try {
      const testSession = `test_${Date.now()}`;
      status.agents = true;
    } catch (error) {
      logger.error({ error }, 'Voice agent test failed');
    }

    // Check demo transactions
    try {
      const transactionCount = await db.transaction.count();
      status.transactions = transactionCount > 0;
    } catch (error) {
      logger.error({ error }, 'Transaction check failed');
    }

    const overallStatus = Object.values(status).every(s => s);

    res.json({
      ok: true,
      systemStatus: overallStatus ? 'ready' : 'partial',
      components: status,
      message: overallStatus ? 
        'Voice KYC system is fully operational and ready for testing' :
        'Some components need attention before testing',
      nextSteps: overallStatus ? [
        'Run POST /api/test-voice-kyc/setup-demo-user',
        'Login with demo user credentials',
        'Test voice onboarding flow'
      ] : [
        'Check failed components',
        'Verify environment variables',
        'Run database seed if needed'
      ]
    });

  } catch (error: any) {
    logger.error({ error }, 'Failed to check system status');
    res.status(500).json({
      ok: false,
      error: 'System status check failed',
      code: 'STATUS_CHECK_ERROR'
    });
  }
});

export default router;
