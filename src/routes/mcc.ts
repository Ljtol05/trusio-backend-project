
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { db } from '../lib/db.js';
import { mccDatabase } from '../lib/mccDatabase.js';
import { transactionIntelligence } from '../lib/transactionIntelligence.js';

const router = Router();

// GET /api/mcc/analyze - Analyze transaction and get suggestions
router.get('/analyze', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = z.object({
      merchant: z.string(),
      amount: z.string().transform(val => parseFloat(val)),
      mcc: z.string().optional(),
      location: z.string().optional(),
    }).parse(req.query);

    // Get user context
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    const envelopes = await db.envelope.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        category: true,
        balanceCents: true,
      }
    });

    // Check for tithe envelope
    const hasTitheEnvelope = envelopes.some(env => 
      env.category === 'giving' || env.name.toLowerCase().includes('tithe')
    );

    const analysisResult = await mccDatabase.generateTransactionSuggestions(
      query,
      envelopes.map(env => ({
        id: env.id,
        name: env.name,
        category: env.category || undefined,
        balance: env.balanceCents / 100,
      })),
      {
        hasTitheEnvelope,
        userType: (user?.userType as 'consumer' | 'creator' | 'hybrid') || 'consumer',
      }
    );

    res.json({
      ok: true,
      analysis: {
        merchant: query.merchant,
        amount: query.amount,
        mcc: query.mcc,
        suggestions: analysisResult.suggestions,
        splitSuggestion: analysisResult.splitSuggestion,
        canSplit: analysisResult.canSplit,
      },
      intelligence: {
        suggestionsCount: analysisResult.suggestions.length,
        topConfidence: analysisResult.suggestions[0]?.confidence,
        titheApplicable: analysisResult.splitSuggestion?.splits.some(
          split => split.reason.includes('tithe')
        ) || false,
      },
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to analyze transaction');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid analysis parameters',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to analyze transaction',
      code: 'ANALYSIS_ERROR'
    });
  }
});

// GET /api/mcc/codes - Get list of supported MCC codes
router.get('/codes', auth, async (req, res) => {
  try {
    const query = z.object({
      category: z.string().optional(),
      search: z.string().optional(),
    }).parse(req.query);

    // This would typically come from a comprehensive MCC database
    const sampleMCCs = [
      { code: '5411', description: 'Grocery Stores, Supermarkets', category: 'food' },
      { code: '5812', description: 'Eating Places, Restaurants', category: 'food' },
      { code: '5814', description: 'Fast Food Restaurants', category: 'food' },
      { code: '5541', description: 'Service Stations', category: 'transportation' },
      { code: '4900', description: 'Utilities', category: 'housing' },
      { code: '8661', description: 'Religious Organizations', category: 'giving' },
      { code: '5734', description: 'Computer Software Stores', category: 'business' },
    ];

    let filteredMCCs = sampleMCCs;

    if (query.category) {
      filteredMCCs = filteredMCCs.filter(mcc => mcc.category === query.category);
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      filteredMCCs = filteredMCCs.filter(mcc => 
        mcc.description.toLowerCase().includes(searchLower) ||
        mcc.code.includes(query.search!)
      );
    }

    res.json({
      ok: true,
      mccCodes: filteredMCCs,
      total: filteredMCCs.length,
      filters: {
        category: query.category,
        search: query.search,
      },
    });

  } catch (error: any) {
    logger.error({ error }, 'Failed to get MCC codes');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid query parameters',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to get MCC codes',
      code: 'MCC_CODES_ERROR'
    });
  }
});

// POST /api/mcc/learn - Learn from user categorization choices
router.post('/learn', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const data = z.object({
      merchant: z.string(),
      mcc: z.string().optional(),
      amount: z.number().positive(),
      chosenEnvelopeId: z.string(),
      feedback: z.object({
        satisfactionScore: z.number().min(1).max(5).optional(),
        wasExpectedChoice: z.boolean().optional(),
        comment: z.string().optional(),
      }).optional(),
    }).parse(req.body);

    await transactionIntelligence.learnFromUserChoice(userId, {
      merchant: data.merchant,
      mcc: data.mcc,
      amount: data.amount,
    }, data.chosenEnvelopeId);

    // Store additional feedback if provided
    if (data.feedback) {
      await db.userMemory.create({
        data: {
          userId,
          type: 'categorization_feedback',
          content: JSON.stringify({
            merchant: data.merchant,
            mcc: data.mcc,
            amount: data.amount,
            chosenEnvelopeId: data.chosenEnvelopeId,
            ...data.feedback,
            timestamp: new Date(),
          }),
          metadata: JSON.stringify({
            feedbackType: 'categorization',
            version: '1.0',
          }),
        }
      });
    }

    res.json({
      ok: true,
      message: 'Learning recorded successfully',
      learned: {
        merchant: data.merchant,
        mcc: data.mcc,
        feedbackProvided: !!data.feedback,
      },
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Failed to record learning');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid learning data',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to record learning',
      code: 'LEARNING_ERROR'
    });
  }
});

export default router;
