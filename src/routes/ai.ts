import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';
import { chatJSON, isAIEnabled } from '../lib/openai.js';
import {
  AICoachRequestSchema,
  RoutingExplanationRequestSchema,
} from '../types/dto.js';

const router = Router();

/**
 * Health check (no auth) – pings OpenAI with a tiny JSON response.
 */
router.get('/health', async (_req, res) => {
  try {
    const { openaiPing } = await import('../lib/openai.js');
    const result = await openaiPing();
    res.json({ openai: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res
      .status(500)
      .json({ error: 'OpenAI health check failed', details: String((error as any)?.message ?? error) });
  }
});

/**
 * Simple test (no auth) – calls chatJSON and expects a JSON object back.
 */
router.post('/test', async (req, res) => {
  try {
    const { prompt = 'Say hello in JSON format' } = req.body ?? {};
    const result = await chatJSON({
      user: prompt,
      schemaName: 'testResponse',
      temperature: 0.1,
    });
    res.json({ success: true, result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    if (error?.code === 'NO_KEY') {
      return res.status(503).json({
        error: 'OpenAI API key not configured',
        message: 'Please set OPENAI_API_KEY in Replit Secrets',
      });
    }
    res
      .status(500)
      .json({ error: 'OpenAI test failed', details: error?.message ?? 'Unknown error' });
  }
});

router.use(requireAuth);

/**
 * Helper: cents → "12.34"
 */
const toDollars = (cents: number | null | undefined) =>
  typeof cents === 'number' ? (cents / 100).toFixed(2) : '0.00';

/**
 * AI budgeting coach
 */
router.post('/coach', async (req: any, res) => {
  try {
    if (!isAIEnabled()) {
      return res
        .status(503)
        .json({ error: 'AI service not available', message: 'OpenAI API key not configured' });
    }

    const { question, context } = AICoachRequestSchema.parse(req.body);

    // Envelopes (valid fields per Prisma schema)
    const envelopes = await db.envelope.findMany({
      where: { userId: req.user.id },
      select: {
        name: true,
        icon: true,
        color: true,
        balanceCents: true,
        spentThisMonth: true,
      },
    });

    const envelopeContext = envelopes.map((e) => ({
      name: e.name,
      icon: e.icon,
      color: e.color,
      balance: toDollars(e.balanceCents),
      spentThisMonth: toDollars(e.spentThisMonth),
    }));

    // Get recent transactions for context
    const recentTransactions = await db.transaction.findMany({
      where: { userId: req.user.id },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        amountCents: true,
        merchant: true,
        mcc: true,
        location: true,
      },
    });

    const txContext = recentTransactions.map(t => ({
      amount: toDollars(t.amountCents),
      merchant: t.merchant,
      mcc: t.mcc,
      location: t.location,
    }));

    const systemPrompt = `You are a helpful financial coach for an envelope budgeting app.
The user has these envelopes: ${JSON.stringify(envelopeContext, null, 2)}
Recent transactions: ${JSON.stringify(txContext, null, 2)}
${context ? `User-provided context: ${JSON.stringify(context, null, 2)}` : ''}

Provide practical, actionable advice about budgeting and spending habits. Keep responses concise. Return JSON only.`;

    const result = await chatJSON({
      system: systemPrompt,
      user: question,
      schemaName: 'coachResponse',
      validate: (obj: any) => {
        // Accept either { advice } or { response } and normalize
        if (obj && typeof obj.advice === 'string' && obj.advice.trim()) {
          return obj;
        }
        if (obj && typeof obj.response === 'string' && obj.response.trim()) {
          return { advice: obj.response };
        }
        // Fallback for empty or malformed responses
        return { 
          advice: "I'm having trouble processing your request right now. Please try asking about your specific spending patterns or budget goals." 
        };
      },
    });

    res.json({ response: result.advice });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    
    logger.error({ err: error }, 'Error in AI coach');
    
    // Provide a helpful fallback response
    if (error?.code === 'NO_KEY') {
      return res.status(503).json({
        error: 'AI service not configured',
        message: 'Please set OPENAI_API_KEY in Replit Secrets',
      });
    }
    
    res.status(500).json({ 
      error: 'AI service temporarily unavailable',
      message: 'Please try again in a moment or rephrase your question.'
    });
  }
});

/**
 * Auto-routing explanation - optimized for approval workflow
 */
router.post('/explain-routing', async (req: any, res) => {
  try {
    const { transactionData } = RoutingExplanationRequestSchema.parse(req.body);

    // Get active rules and envelopes for routing decision
    const [rules, envelopes] = await Promise.all([
      db.rule.findMany({
        where: { userId: req.user.id, enabled: true },
        orderBy: { priority: 'asc' },
        select: { id: true, priority: true, mcc: true, merchant: true, geofence: true, envelope: { select: { id: true, name: true, icon: true, color: true } } },
      }),
      db.envelope.findMany({
        where: { userId: req.user.id, isActive: true },
        select: { id: true, name: true, icon: true, color: true },
        orderBy: { order: 'asc' },
      }),
    ]);

    if (envelopes.length === 0) {
      return res.status(404).json({ error: 'No active envelopes found' });
    }

    // Find matching rule
    let matchedRule: any = null;
    let targetEnvelope: any = null;

    for (const rule of rules) {
      let matches = true;

      if (rule.mcc && transactionData.mcc && rule.mcc !== transactionData.mcc) {
        matches = false;
      }

      if (
        rule.merchant &&
        transactionData.merchant &&
        !transactionData.merchant.toLowerCase().includes(rule.merchant.toLowerCase())
      ) {
        matches = false;
      }

      if (
        rule.geofence &&
        transactionData.location &&
        !transactionData.location.toLowerCase().includes(rule.geofence.toLowerCase())
      ) {
        matches = false;
      }

      if (matches && rule.envelope) {
        matchedRule = { id: rule.id, priority: rule.priority };
        targetEnvelope = rule.envelope;
        break;
      }
    }

    if (!targetEnvelope) {
      // Use 'Misc' envelope as default, or first available
      targetEnvelope = envelopes.find(e => e.name === 'Misc') || envelopes[0];
    }

    // Generate concise explanation if AI is available
    let explanation = `Routed to ${targetEnvelope.name}`;
    
    if (isAIEnabled()) {
      try {
        const result = await chatJSON({
          system: `Explain why this $${Math.abs(Number(transactionData.amountCents || 0)) / 100} transaction at ${transactionData.merchant || 'Unknown'} was routed to ${targetEnvelope.name}. ${matchedRule ? 'A rule matched.' : 'No rules matched, using default.'} Keep it to 1 sentence. Return JSON only.`,
          user: 'Explain this routing decision briefly.',
          schemaName: 'explanationResponse',
          temperature: 0.1,
          validate: (obj: any) => {
            if (obj && typeof obj.explanation === 'string' && obj.explanation.trim()) {
              return obj;
            }
            return { explanation };
          },
        });
        explanation = result.explanation;
      } catch (aiError) {
        // Fallback to simple explanation if AI fails
        explanation = matchedRule 
          ? `Routed to ${targetEnvelope.name} based on your routing rules`
          : `Routed to ${targetEnvelope.name} (default category)`;
      }
    }

    // Return optimized response for approval workflow
    res.json({
      envelope: {
        id: targetEnvelope.id,
        name: targetEnvelope.name,
        icon: targetEnvelope.icon,
        color: targetEnvelope.color,
      },
      rule: matchedRule,
      explanation,
      alternativeEnvelopes: envelopes.filter(e => e.id !== targetEnvelope.id),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    
    logger.error({ err: error }, 'Error explaining routing');
    res.status(500).json({ error: 'Failed to process routing explanation' });
  }
});

export default router;