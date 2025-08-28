
import { Router } from 'express';
import { auth } from '../services/auth.js';
import { billAnalyzer } from '../lib/billAnalyzer.js';
import { logger } from '../lib/logger.js';
import { z } from 'zod';

const router = Router();
router.use(auth);

// Analyze bills from transaction history
router.post('/analyze', async (req: any, res) => {
  try {
    const { timeframeDays = 90 } = req.body;
    
    const analysis = await billAnalyzer.analyzeBillsFromTransactions(
      req.user.id,
      timeframeDays
    );

    res.json({
      success: true,
      analysis,
      message: `Found ${analysis.detectedBills.length} recurring bills totaling $${analysis.totalMonthlyBills}/month`
    });

  } catch (error) {
    logger.error({ error, userId: req.user.id }, 'Bill analysis failed');
    res.status(500).json({ 
      error: 'Failed to analyze bills',
      message: 'Please try again later'
    });
  }
});

// Set up bills envelope based on analysis
router.post('/setup-envelope', async (req: any, res) => {
  try {
    const analysis = await billAnalyzer.analyzeBillsFromTransactions(req.user.id);
    const setup = await billAnalyzer.suggestBillsEnvelopeSetup(req.user.id, analysis);

    if (setup.setupSuccess) {
      res.json({
        success: true,
        envelopeId: setup.envelopeId,
        recommendedAmount: analysis.recommendedBillsEnvelopeAmount,
        detectedBills: analysis.detectedBills,
        message: 'Bills envelope configured successfully'
      });
    } else {
      res.status(500).json({
        error: 'Failed to set up bills envelope'
      });
    }

  } catch (error) {
    logger.error({ error, userId: req.user.id }, 'Bills envelope setup failed');
    res.status(500).json({ 
      error: 'Failed to set up bills envelope'
    });
  }
});

// Check if budget needs rebalancing
router.get('/health-check', async (req: any, res) => {
  try {
    const healthCheck = await billAnalyzer.checkFinancialHealthAndSuggestRebalancing(req.user.id);

    res.json({
      success: true,
      healthCheck,
      requiresAttention: healthCheck.shouldRebalance,
      message: healthCheck.shouldRebalance 
        ? 'Your budget may need rebalancing'
        : 'Your budget looks healthy'
    });

  } catch (error) {
    logger.error({ error, userId: req.user.id }, 'Health check failed');
    res.status(500).json({ 
      error: 'Failed to check financial health'
    });
  }
});

// Get AI chat suggestions for budget improvements
router.post('/chat-suggestions', async (req: any, res) => {
  try {
    const { message } = z.object({
      message: z.string()
    }).parse(req.body);

    // This would integrate with your AI chat system
    // For now, return a structured response about bills
    const analysis = await billAnalyzer.analyzeBillsFromTransactions(req.user.id);
    
    res.json({
      success: true,
      aiResponse: `I've analyzed your bills and found $${analysis.totalMonthlyBills} in recurring expenses. ${analysis.recommendations.join(' ')}`,
      suggestions: analysis.recommendations,
      detectedBills: analysis.detectedBills
    });

  } catch (error) {
    logger.error({ error, userId: req.user.id }, 'AI chat suggestions failed');
    res.status(500).json({ 
      error: 'Failed to generate suggestions'
    });
  }
});

export default router;
