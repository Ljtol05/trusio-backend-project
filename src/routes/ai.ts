
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';
import { chatJSON, isAIEnabled } from '../lib/openai.js';
import { AICoachRequestSchema, RoutingExplanationRequestSchema } from '../types/dto.js';

const router = Router();

// Health check endpoint (no auth required for testing)
router.get('/health', async (req, res) => {
  try {
    const { openaiPing } = await import('../lib/openai.js');
    const result = await openaiPing();
    
    res.json({
      openai: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: 'OpenAI health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Simple test endpoint (no auth required for testing)
router.post('/test', async (req, res) => {
  try {
    const { prompt = "Say hello in JSON format" } = req.body;
    
    const result = await chatJSON({
      user: prompt,
      schemaName: "testResponse",
      temperature: 0.1
    });
    
    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error.code === 'NO_KEY') {
      return res.status(503).json({
        error: 'OpenAI API key not configured',
        message: 'Please set OPENAI_API_KEY in Replit Secrets'
      });
    }
    
    res.status(500).json({
      error: 'OpenAI test failed',
      details: error.message || 'Unknown error'
    });
  }
});

router.use(requireAuth);

// AI coach endpoint
router.post('/coach', async (req: any, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service not available',
        message: 'OpenAI API key not configured'
      });
    }

    const { question, context } = AICoachRequestSchema.parse(req.body);

    // Get envelopes with correct field names
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

    // Helper to convert cents to dollars
    const toDollars = (cents: number | null) =>
      typeof cents === "number" ? (cents / 100).toFixed(2) : "0.00";

    // Context for envelopes
    const envelopeContext = envelopes.map(e => ({
      name: e.name,
      icon: e.icon,
      color: e.color,
      balance: toDollars(e.balanceCents),
      spentThisMonth: toDollars(e.spentThisMonth),
    }));

    // Get recent transactions with correct field names
    const recentTransactions = await db.transaction.findMany({
      where: { userId: req.user.id },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { amountCents: true, description: true, merchantName: true },
    });

    const txContext = recentTransactions.map(t => ({
      amount: toDollars(t.amountCents),
      description: t.description,
      merchant: t.merchantName,
    }));

    const systemPrompt = `You are a helpful financial coach for an envelope budgeting app.
The user has these envelopes: ${JSON.stringify(envelopeContext, null, 2)}
Recent transactions: ${JSON.stringify(txContext, null, 2)}

Provide helpful, actionable advice about budgeting and spending habits. Keep responses concise and practical.`;

    const result = await chatJSON({
      system: systemPrompt,
      user: question,
      schemaName: "coachResponse",
      validate: (obj: any) => {
        if (obj && typeof obj.advice === "string") return obj;
        if (obj && typeof obj.response === "string") return { advice: obj.response };
        throw new Error("Invalid response format");
      },
    });

    res.json({ response: result.advice });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error in AI coach');
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

// Auto-routing explanation endpoint
router.post('/explain-routing', async (req: any, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service not available',
        message: 'OpenAI API key not configured'
      });
    }

    const { transactionData } = RoutingExplanationRequestSchema.parse(req.body);

    // Get user's routing rules for context
    const rules = await db.rule.findMany({
      where: { userId: req.user.id, enabled: true },
      orderBy: { priority: 'asc' },
      include: { envelope: true }
    });

    // Get user's envelopes
    const envelopes = await db.envelope.findMany({
      where: { userId: req.user.id, isActive: true }
    });

    if (envelopes.length === 0) {
      return res.status(404).json({ error: 'No active envelopes found' });
    }

    // Find the best matching rule or use default routing logic
    let matchedRule = null;
    let targetEnvelope = null;
    let reason = 'Default routing - no specific rule matched';

    // Check rules in priority order
    for (const rule of rules) {
      let matches = true;

      if (rule.mcc && transactionData.mcc && rule.mcc !== transactionData.mcc) {
        matches = false;
      }

      if (rule.merchant && transactionData.merchant &&
          !transactionData.merchant.toLowerCase().includes(rule.merchant.toLowerCase())) {
        matches = false;
      }

      if (rule.geofence && transactionData.location &&
          !transactionData.location.toLowerCase().includes(rule.geofence.toLowerCase())) {
        matches = false;
      }

      if (matches && rule.envelope) {
        matchedRule = rule;
        targetEnvelope = rule.envelope;
        reason = `Matched rule: ${rule.mcc ? `MCC ${rule.mcc}` : ''}${rule.merchant ? ` Merchant "${rule.merchant}"` : ''}${rule.geofence ? ` Location "${rule.geofence}"` : ''}`;
        break;
      }
    }

    // If no rule matched, use the first available envelope
    if (!targetEnvelope) {
      targetEnvelope = envelopes[0];
      reason = 'No matching rule found, using default envelope';
    }

    // Create AI explanation
    const systemPrompt = `You are a financial advisor explaining why a transaction was routed to a specific envelope in a budgeting app.

Transaction details:
- Merchant: ${transactionData.merchant || 'Unknown'}
- Amount: $${Math.abs(transactionData.amountCents) / 100}
- MCC: ${transactionData.mcc || 'Unknown'}
- Location: ${transactionData.location || 'Unknown'}

Routing result:
- Envelope: ${targetEnvelope.name}
- Rule matched: ${matchedRule ? 'Yes' : 'No'}
- Reason: ${reason}

Available rules: ${rules.map(r => `Priority ${r.priority}: ${r.mcc ? `MCC ${r.mcc}` : ''}${r.merchant ? ` "${r.merchant}"` : ''}${r.geofence ? ` at "${r.geofence}"` : ''} → ${r.envelope?.name || 'Unknown'}`).join(', ')}

Provide a brief, friendly explanation (2-3 sentences) of why this transaction was routed to this envelope.`;

    const result = await chatJSON({
      system: systemPrompt,
      user: 'Please explain this routing decision.',
      schemaName: "explanationResponse",
      validate: (obj: any) => {
        if (obj && typeof obj.explanation === 'string') return obj;
        if (obj && typeof obj.response === 'string') return { explanation: obj.response };
        throw new Error('Invalid response format');
      }
    });

    res.json({
      envelope: targetEnvelope,
      rule: matchedRule,
      explanation: result.explanation,
      reason,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error(error, 'Error explaining routing');
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

export default router;
