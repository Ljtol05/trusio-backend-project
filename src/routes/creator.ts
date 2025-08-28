
import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { auth } from '../services/auth.js';
import { contentCreatorAgent } from '../agents/core/ContentCreatorAgent.js';
import type { FinancialContext } from '../agents/tools/types.js';
import { db } from '../lib/db.js';

const router = Router();

// Validation schemas
const CreatorAnalysisSchema = z.object({
  includeEquipment: z.boolean().default(true),
  includeTaxOptimization: z.boolean().default(true),
  platformFocus: z.enum(['all', 'youtube', 'twitch', 'tiktok', 'instagram', 'patreon']).optional(),
});

const RevenueTrackingSchema = z.object({
  platform: z.enum(['youtube', 'twitch', 'tiktok', 'instagram', 'patreon', 'onlyfans', 'substack', 'other']),
  revenueType: z.enum(['ad_revenue', 'sponsorship', 'subscription', 'donation', 'merchandise', 'affiliate', 'course_sales']),
  amount: z.number().positive(),
  date: z.string().datetime(),
  description: z.string().min(1),
  verified: z.boolean().default(false),
});

const EquipmentTrackingSchema = z.object({
  category: z.enum(['camera', 'audio', 'lighting', 'computer', 'software', 'storage', 'networking', 'accessories']),
  item: z.string().min(1),
  cost: z.number().positive(),
  purchaseDate: z.string().datetime(),
  businessUse: z.number().min(0).max(100).default(80),
  depreciationPeriod: z.number().positive().optional(),
});

// GET /api/creator/analysis - Get comprehensive creator financial analysis
router.get('/analysis', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = CreatorAnalysisSchema.parse(req.query);

    // Check if user is a creator
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    if (user?.userType !== 'creator') {
      return res.status(403).json({
        ok: false,
        error: 'Creator-only feature',
        code: 'NOT_CREATOR'
      });
    }

    logger.info({ userId, query }, 'Generating creator financial analysis');

    // Build financial context
    const envelopes = await db.envelope.findMany({
      where: { userId }
    });

    const transactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    const context: FinancialContext = {
      user: {
        id: userId,
        type: 'creator',
        onboardingCompleted: true,
      },
      envelopes,
      transactions,
      goals: envelopes
        .filter(e => e.category === 'savings')
        .map(e => ({
          name: e.name,
          currentAmount: e.balance,
          targetAmount: e.targetAmount,
        })),
    };

    // Get comprehensive creator analysis
    const analysis = await contentCreatorAgent.analyzeCreatorFinances(userId, context);

    res.json({
      ok: true,
      analysis: {
        revenueAnalysis: analysis.revenueAnalysis,
        platformDiversification: analysis.platformDiversification,
        equipmentROI: query.includeEquipment ? analysis.equipmentROI : undefined,
        incomeStability: analysis.incomeStability,
        taxOptimization: query.includeTaxOptimization ? analysis.taxOptimization : undefined,
        insights: analysis.insights,
      },
      recommendations: {
        immediate: analysis.insights.filter(i => i.priority === 'high').slice(0, 3),
        longTerm: analysis.insights.filter(i => i.priority === 'medium').slice(0, 3),
      },
      summary: {
        monthlyRevenue: analysis.revenueAnalysis.totalMonthly,
        platformCount: Object.keys(analysis.revenueAnalysis.platformBreakdown).length,
        diversificationScore: analysis.platformDiversification.diversificationScore,
        stabilityScore: analysis.incomeStability.stabilityScore,
      },
      lastUpdated: new Date().toISOString(),
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Creator analysis failed');

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
      error: 'Failed to generate creator analysis',
      code: 'ANALYSIS_ERROR'
    });
  }
});

// GET /api/creator/insights - Get creator-specific insights
router.get('/insights', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    if (user?.userType !== 'creator') {
      return res.status(403).json({
        ok: false,
        error: 'Creator-only feature',
        code: 'NOT_CREATOR'
      });
    }

    logger.info({ userId }, 'Fetching creator insights');

    // Build context
    const envelopes = await db.envelope.findMany({
      where: { userId }
    });

    const transactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const context: FinancialContext = {
      user: {
        id: userId,
        type: 'creator',
        onboardingCompleted: true,
      },
      envelopes,
      transactions,
      goals: [],
    };

    const insights = await contentCreatorAgent.getCreatorInsights(userId, context);

    res.json({
      ok: true,
      insights: insights.map(insight => ({
        type: insight.type,
        platform: insight.platform,
        message: insight.message,
        actionable: insight.actionable,
        priority: insight.priority,
        suggestedActions: insight.suggestedActions,
        financialImpact: insight.financialImpact,
      })),
      summary: {
        totalInsights: insights.length,
        highPriority: insights.filter(i => i.priority === 'high').length,
        actionableInsights: insights.filter(i => i.actionable).length,
      },
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Failed to fetch creator insights');
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch creator insights',
      code: 'INSIGHTS_ERROR'
    });
  }
});

// POST /api/creator/advice - Get personalized creator advice
router.post('/advice', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.length < 5) {
      return res.status(400).json({
        ok: false,
        error: 'Query must be at least 5 characters long',
        code: 'INVALID_QUERY'
      });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    if (user?.userType !== 'creator') {
      return res.status(403).json({
        ok: false,
        error: 'Creator-only feature',
        code: 'NOT_CREATOR'
      });
    }

    logger.info({ userId, queryLength: query.length }, 'Generating creator advice');

    // Build context
    const envelopes = await db.envelope.findMany({
      where: { userId }
    });

    const transactions = await db.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const context: FinancialContext = {
      user: {
        id: userId,
        type: 'creator',
        onboardingCompleted: true,
      },
      envelopes,
      transactions,
      goals: envelopes
        .filter(e => e.category === 'savings')
        .map(e => ({
          name: e.name,
          currentAmount: e.balance,
          targetAmount: e.targetAmount,
        })),
    };

    const advice = await contentCreatorAgent.generateCreatorAdvice(userId, query, context);

    res.json({
      ok: true,
      advice,
      query,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Creator advice generation failed');
    res.status(500).json({
      ok: false,
      error: 'Failed to generate creator advice',
      code: 'ADVICE_ERROR'
    });
  }
});

// POST /api/creator/track/revenue - Manually track revenue
router.post('/track/revenue', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const revenueData = RevenueTrackingSchema.parse(req.body);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    if (user?.userType !== 'creator') {
      return res.status(403).json({
        ok: false,
        error: 'Creator-only feature',
        code: 'NOT_CREATOR'
      });
    }

    logger.info({ userId, platform: revenueData.platform, amount: revenueData.amount }, 'Tracking creator revenue');

    // Create a manual transaction record for the revenue
    const transaction = await db.transaction.create({
      data: {
        userId,
        amountCents: -Math.abs(revenueData.amount * 100), // Negative for income
        description: `${revenueData.platform} ${revenueData.revenueType}: ${revenueData.description}`,
        merchantName: revenueData.platform,
        category: 'creator_income',
        createdAt: new Date(revenueData.date),
        metadata: JSON.stringify({
          platform: revenueData.platform,
          revenueType: revenueData.revenueType,
          verified: revenueData.verified,
          manualEntry: true,
        }),
      }
    });

    res.json({
      ok: true,
      transaction: {
        id: transaction.id,
        amount: Math.abs(transaction.amountCents) / 100,
        platform: revenueData.platform,
        revenueType: revenueData.revenueType,
        date: transaction.createdAt,
        verified: revenueData.verified,
      },
      message: 'Revenue tracked successfully',
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Revenue tracking failed');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid revenue data',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to track revenue',
      code: 'TRACKING_ERROR'
    });
  }
});

// POST /api/creator/track/equipment - Track equipment purchases
router.post('/track/equipment', auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const equipmentData = EquipmentTrackingSchema.parse(req.body);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    if (user?.userType !== 'creator') {
      return res.status(403).json({
        ok: false,
        error: 'Creator-only feature',
        code: 'NOT_CREATOR'
      });
    }

    logger.info({ userId, category: equipmentData.category, cost: equipmentData.cost }, 'Tracking equipment purchase');

    // Create a transaction record for the equipment purchase
    const transaction = await db.transaction.create({
      data: {
        userId,
        amountCents: Math.abs(equipmentData.cost * 100), // Positive for expense
        description: `${equipmentData.category}: ${equipmentData.item}`,
        merchantName: 'Equipment Purchase',
        category: 'business_equipment',
        createdAt: new Date(equipmentData.purchaseDate),
        metadata: JSON.stringify({
          category: equipmentData.category,
          businessUse: equipmentData.businessUse,
          depreciationPeriod: equipmentData.depreciationPeriod,
          taxDeductible: true,
          manualEntry: true,
        }),
      }
    });

    res.json({
      ok: true,
      transaction: {
        id: transaction.id,
        cost: transaction.amountCents / 100,
        category: equipmentData.category,
        item: equipmentData.item,
        businessUse: equipmentData.businessUse,
        date: transaction.createdAt,
      },
      message: 'Equipment purchase tracked successfully',
    });

  } catch (error: any) {
    logger.error({ error, userId: req.user?.id }, 'Equipment tracking failed');

    if (error.name === 'ZodError') {
      return res.status(400).json({
        ok: false,
        error: 'Invalid equipment data',
        details: error.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      ok: false,
      error: 'Failed to track equipment',
      code: 'TRACKING_ERROR'
    });
  }
});

// GET /api/creator/tax/summary - Get tax optimization summary
router.get('/tax/summary', auth, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { userType: true }
    });

    if (user?.userType !== 'creator') {
      return res.status(403).json({
        ok: false,
        error: 'Creator-only feature',
        code: 'NOT_CREATOR'
      });
    }

    logger.info({ userId }, 'Generating tax summary for creator');

    // Get transactions for current tax year
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    const transactions = await db.transaction.findMany({
      where: {
        userId,
        createdAt: {
          gte: yearStart,
          lte: yearEnd,
        }
      }
    });

    // Separate income and business expenses
    const income = transactions
      .filter(t => t.amountCents < 0)
      .reduce((sum, t) => sum + Math.abs(t.amountCents), 0) / 100;

    const businessExpenses = transactions
      .filter(t => t.amountCents > 0 && (
        t.category?.includes('equipment') ||
        t.category?.includes('business') ||
        t.description?.toLowerCase().includes('business')
      ))
      .reduce((sum, t) => sum + t.amountCents, 0) / 100;

    // Estimate tax liability
    const netIncome = income - businessExpenses;
    const estimatedTaxRate = netIncome > 100000 ? 0.30 : netIncome > 50000 ? 0.25 : 0.20;
    const estimatedTaxLiability = netIncome * estimatedTaxRate;
    const quarterlyPayment = estimatedTaxLiability / 4;

    res.json({
      ok: true,
      taxYear: currentYear,
      summary: {
        grossIncome: income,
        businessExpenses,
        netIncome,
        estimatedTaxLiability,
        quarterlyPayment,
        effectiveTaxRate: estimatedTaxRate * 100,
      },
      recommendations: [
        'Keep detailed records of all business expenses',
        'Consider setting aside 25-30% of income for taxes',
        'Make quarterly estimated tax payments to avoid penalties',
        'Track business use percentage for equipment',
        'Consult with a tax professional familiar with creator taxes',
      ],
      nextQuarterlyDue: this.getNextQuarterlyDue(),
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Tax summary generation failed');
    res.status(500).json({
      ok: false,
      error: 'Failed to generate tax summary',
      code: 'TAX_SUMMARY_ERROR'
    });
  }
});

// Helper function to get next quarterly tax due date
function getNextQuarterlyDue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const quarterlyDates = [
    new Date(year, 3, 15), // Q1 - April 15
    new Date(year, 5, 15), // Q2 - June 15
    new Date(year, 8, 15), // Q3 - September 15
    new Date(year + 1, 0, 15), // Q4 - January 15 (next year)
  ];

  const nextDue = quarterlyDates.find(date => date > now);
  return nextDue ? nextDue.toISOString().split('T')[0] : quarterlyDates[0].toISOString().split('T')[0];
}

export default router;
