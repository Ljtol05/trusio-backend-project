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
 * AI budgeting coach with envelope management capabilities
 */
router.post('/coach', async (req: any, res) => {
  try {
    if (!isAIEnabled()) {
      return res
        .status(503)
        .json({ error: 'AI service not available', message: 'OpenAI API key not configured' });
    }

    const { question, context } = AICoachRequestSchema.parse(req.body);

    // Get comprehensive user data
    const [envelopes, recentTransactions, transfers] = await Promise.all([
      db.envelope.findMany({
        where: { userId: req.user.id },
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
          balanceCents: true,
          spentThisMonth: true,
          order: true,
        },
        orderBy: { order: 'asc' },
      }),
      db.transaction.findMany({
        where: { userId: req.user.id },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          amountCents: true,
          merchant: true,
          mcc: true,
          location: true,
          envelope: { select: { name: true } },
          createdAt: true,
        },
      }),
      db.transfer.findMany({
        where: { userId: req.user.id },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          amountCents: true,
          note: true,
          fromEnvelope: { select: { name: true } },
          toEnvelope: { select: { name: true } },
          createdAt: true,
        },
      }),
    ]);

    const envelopeContext = envelopes.map((e) => ({
      id: e.id,
      name: e.name,
      icon: e.icon,
      color: e.color,
      balance: toDollars(e.balanceCents),
      spentThisMonth: toDollars(e.spentThisMonth),
      balanceCents: e.balanceCents,
    }));

    // Calculate analytics
    const totalBalance = envelopeContext.reduce((sum, env) => sum + env.balanceCents, 0);
    const totalSpent = envelopeContext.reduce((sum, env) => sum + parseFloat(env.spentThisMonth), 0);
    const avgSpendingPerEnvelope = totalSpent / envelopeContext.length;
    
    // Find highest/lowest spending categories
    const highestSpendingEnv = envelopeContext.reduce((max, env) => 
      parseFloat(env.spentThisMonth) > parseFloat(max.spentThisMonth) ? env : max
    );
    const lowestBalanceEnv = envelopeContext.reduce((min, env) => 
      env.balanceCents < min.balanceCents ? env : min
    );

    const systemPrompt = `You are an expert financial advisor for an envelope budgeting system. Analyze the user's financial situation and provide specific, actionable advice.

CURRENT FINANCIAL STATE:
Total Balance: $${toDollars(totalBalance)}
Total Spent This Month: $${totalSpent.toFixed(2)}
Number of Envelopes: ${envelopeContext.length}

ENVELOPE BREAKDOWN:
${envelopeContext.map(e => `• ${e.name}: $${e.balance} available (spent $${e.spentThisMonth} this month)`).join('\n')}

SPENDING INSIGHTS:
• Highest spending category: ${highestSpendingEnv.name} ($${highestSpendingEnv.spentThisMonth})
• Lowest balance envelope: ${lowestBalanceEnv.name} ($${lowestBalanceEnv.balance})
• Average spending per category: $${avgSpendingPerEnvelope.toFixed(2)}

RECENT ACTIVITY:
${recentTransactions.slice(0, 5).map(t => `• $${toDollars(Math.abs(t.amountCents))} at ${t.merchant || 'Unknown'} → ${t.envelope?.name || 'Unassigned'}`).join('\n')}

CAPABILITIES I CAN HELP WITH:
1. Transfer money between envelopes
2. Create new envelopes (max 8 total)
3. Analyze spending patterns
4. Suggest budget rebalancing
5. Emergency fund planning

USER QUESTION: "${question}"

Respond with specific, actionable advice. If the user needs money moved between envelopes or new envelopes created, include those recommendations. Return JSON with:
- "advice": detailed financial advice
- "actions": array of suggested actions (if any), each with "type", "description", and "params"

Example actions:
- {"type": "transfer", "description": "Move $200 from Bills to Groceries", "params": {"fromEnvelope": "Bills", "toEnvelope": "Groceries", "amount": 200}}
- {"type": "create_envelope", "description": "Create Emergency Fund", "params": {"name": "Emergency Fund", "initialAmount": 500, "icon": "shield", "color": "red"}}`;

    const result = await chatJSON({
      system: systemPrompt,
      user: question,
      schemaName: 'coachResponse',
      temperature: 0.4,
      validate: (obj: any) => {
        if (obj && typeof obj === 'object') {
          const advice = obj.advice || obj.response || obj.recommendation || obj.suggestion;
          const actions = obj.actions || obj.suggestions || obj.recommendations || [];
          
          if (typeof advice === 'string' && advice.trim()) {
            return { 
              advice: advice.trim(),
              actions: Array.isArray(actions) ? actions : []
            };
          }
        }
        
        // Enhanced fallback with specific advice based on user's situation
        let specificAdvice = '';
        if (lowestBalanceEnv.balanceCents < 1000) {
          specificAdvice = `Your ${lowestBalanceEnv.name} envelope is running low ($${lowestBalanceEnv.balance}). `;
        }
        if (parseFloat(highestSpendingEnv.spentThisMonth) > avgSpendingPerEnvelope * 1.5) {
          specificAdvice += `You've been spending heavily in ${highestSpendingEnv.name} this month ($${highestSpendingEnv.spentThisMonth}). `;
        }
        specificAdvice += `Consider rebalancing your ${envelopeContext.length} envelopes based on your actual spending patterns.`;
        
        return { 
          advice: specificAdvice || `Based on your $${toDollars(totalBalance)} across ${envelopeContext.length} envelopes, your budget looks balanced. Keep monitoring your spending patterns.`,
          actions: []
        };
      },
    });

    res.json({ 
      response: result.advice,
      suggestedActions: result.actions || [],
      analytics: {
        totalBalance: toDollars(totalBalance),
        totalSpent: totalSpent.toFixed(2),
        envelopeCount: envelopeContext.length,
        highestSpending: highestSpendingEnv.name,
        lowestBalance: lowestBalanceEnv.name,
      }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    
    logger.error({ err: error }, 'Error in AI coach');
    
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
      confidence: matchedRule ? 85 : 45, // Higher confidence when rule matched
      amount: toDollars(Math.abs(Number(transactionData.amountCents || 0))),
      merchant: transactionData.merchant || 'Unknown Merchant',
      alternativeEnvelopes: envelopes.filter(e => e.id !== targetEnvelope.id).map(e => ({
        ...e,
        availableBalance: toDollars(e.balanceCents || 0)
      })),
      canAfford: (targetEnvelope.balanceCents || 0) >= Math.abs(Number(transactionData.amountCents || 0)),
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    
    logger.error({ err: error }, 'Error explaining routing');
    res.status(500).json({ error: 'Failed to process routing explanation' });
  }
});

/**
 * AI-powered envelope setup for new users
 */
router.post('/setup-envelopes', async (req: any, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({ error: 'AI service not available' });
    }

    const { totalBudget, goals, lifestyle } = req.body;
    
    if (!totalBudget || totalBudget <= 0) {
      return res.status(400).json({ error: 'Valid total budget required' });
    }

    // Check current envelope count
    const existingCount = await db.envelope.count({ where: { userId: req.user.id } });
    if (existingCount >= 8) {
      return res.status(400).json({ error: 'Maximum 8 envelopes allowed' });
    }

    const systemPrompt = `You are a financial advisor setting up envelope budgets. The user has $${totalBudget} to allocate across envelopes.

USER PROFILE:
- Total Budget: $${totalBudget}
- Goals: ${goals || 'Not specified'}
- Lifestyle: ${lifestyle || 'Not specified'}
- Current Envelopes: ${existingCount}
- Max Envelopes: 8

Create an optimal envelope structure. Consider:
1. Essential categories (housing, utilities, groceries, transportation)
2. Lifestyle categories (dining, entertainment)
3. Savings/emergency fund
4. User's specific goals

Return JSON with "envelopes" array, each containing:
- "name": clear category name
- "percentage": % of total budget (all must sum to 100)
- "description": why this amount/category
- "icon": one of [cart, utensils, home, car, fuel, shield, heart, bank, gift, phone]
- "color": one of [blue, green, amber, red, purple, teal, pink, gray]

Also include "rationale" explaining the allocation strategy.`;

    const result = await chatJSON({
      system: systemPrompt,
      user: `Set up my envelopes with $${totalBudget} budget. Goals: ${goals || 'general budgeting'}. Lifestyle: ${lifestyle || 'moderate'}`,
      schemaName: 'envelopeSetup',
      temperature: 0.3,
      validate: (obj: any) => {
        if (obj?.envelopes && Array.isArray(obj.envelopes) && obj.envelopes.length > 0) {
          const totalPercentage = obj.envelopes.reduce((sum: number, env: any) => sum + (env.percentage || 0), 0);
          if (Math.abs(totalPercentage - 100) < 5) { // Allow 5% tolerance
            return obj;
          }
        }
        
        // Fallback envelope structure
        return {
          envelopes: [
            { name: 'Groceries', percentage: 25, description: 'Food and household essentials', icon: 'cart', color: 'green' },
            { name: 'Bills', percentage: 30, description: 'Utilities and fixed expenses', icon: 'home', color: 'blue' },
            { name: 'Dining', percentage: 15, description: 'Restaurants and takeout', icon: 'utensils', color: 'amber' },
            { name: 'Gas', percentage: 10, description: 'Transportation fuel', icon: 'fuel', color: 'teal' },
            { name: 'Emergency', percentage: 20, description: 'Emergency savings buffer', icon: 'shield', color: 'red' }
          ],
          rationale: 'Balanced allocation focusing on essentials with emergency savings'
        };
      },
    });

    res.json({
      proposedEnvelopes: result.envelopes.map((env: any) => ({
        ...env,
        allocatedAmount: Math.round((totalBudget * env.percentage) / 100 * 100) / 100
      })),
      rationale: result.rationale,
      totalBudget,
      needsApproval: true
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error in AI envelope setup');
    res.status(500).json({ error: 'Failed to generate envelope setup' });
  }
});

/**
 * Execute AI-suggested actions (transfers, envelope creation)
 */
router.post('/execute-action', async (req: any, res) => {
  try {
    const { actionType, params, approved } = req.body;
    
    if (!approved) {
      return res.status(400).json({ error: 'Action not approved' });
    }

    switch (actionType) {
      case 'transfer': {
        const { fromEnvelope, toEnvelope, amount } = params;
        const amountCents = Math.round(amount * 100);

        const [fromEnv, toEnv] = await Promise.all([
          db.envelope.findFirst({ where: { userId: req.user.id, name: fromEnvelope } }),
          db.envelope.findFirst({ where: { userId: req.user.id, name: toEnvelope } })
        ]);

        if (!fromEnv || !toEnv) {
          return res.status(404).json({ error: 'Envelope not found' });
        }

        if (fromEnv.balanceCents < amountCents) {
          return res.status(400).json({ error: 'Insufficient funds' });
        }

        const transfer = await db.$transaction(async (tx) => {
          await tx.envelope.update({
            where: { id: fromEnv.id },
            data: { balanceCents: { decrement: amountCents } }
          });
          
          await tx.envelope.update({
            where: { id: toEnv.id },
            data: { balanceCents: { increment: amountCents } }
          });
          
          return tx.transfer.create({
            data: {
              userId: req.user.id,
              fromId: fromEnv.id,
              toId: toEnv.id,
              amountCents,
              note: `AI Coach suggestion: Move $${amount} from ${fromEnvelope} to ${toEnvelope}`
            }
          });
        });

        res.json({ success: true, transfer, message: `Transferred $${amount} from ${fromEnvelope} to ${toEnvelope}` });
        break;
      }

      case 'create_envelope': {
        const { name, initialAmount, icon, color } = params;
        const amountCents = Math.round((initialAmount || 0) * 100);

        const envelopeCount = await db.envelope.count({ where: { userId: req.user.id } });
        if (envelopeCount >= 8) {
          return res.status(400).json({ error: 'Maximum 8 envelopes allowed' });
        }

        const envelope = await db.envelope.create({
          data: {
            userId: req.user.id,
            name,
            balanceCents: amountCents,
            icon: icon || 'dots',
            color: color || 'gray',
            order: envelopeCount + 1
          }
        });

        res.json({ success: true, envelope, message: `Created ${name} envelope with $${initialAmount || 0}` });
        break;
      }

      case 'create_envelopes_batch': {
        const { envelopes, totalBudget } = params;
        const envelopeCount = await db.envelope.count({ where: { userId: req.user.id } });
        
        if (envelopeCount + envelopes.length > 8) {
          return res.status(400).json({ error: 'Would exceed maximum 8 envelopes' });
        }

        const created = await db.$transaction(async (tx) => {
          const results = [];
          for (let i = 0; i < envelopes.length; i++) {
            const env = envelopes[i];
            const allocatedAmount = Math.round((totalBudget * env.percentage) / 100 * 100);
            
            const envelope = await tx.envelope.create({
              data: {
                userId: req.user.id,
                name: env.name,
                balanceCents: allocatedAmount,
                icon: env.icon || 'dots',
                color: env.color || 'gray',
                order: envelopeCount + i + 1
              }
            });
            results.push(envelope);
          }
          return results;
        });

        res.json({ 
          success: true, 
          envelopes: created, 
          message: `Created ${created.length} envelopes with total budget $${totalBudget}` 
        });
        break;
      }

      default:
        res.status(400).json({ error: 'Unknown action type' });
    }
  } catch (error: any) {
    logger.error({ err: error }, 'Error executing AI action');
    res.status(500).json({ error: 'Failed to execute action' });
  }
});

/**
 * Get pending transactions for approval workflow
 */
router.get('/pending-approvals', async (req: any, res) => {
  try {
    const pendingTransactions = await db.transaction.findMany({
      where: { 
        userId: req.user.id, 
        status: 'PENDING' 
      },
      include: {
        envelope: { select: { id: true, name: true, icon: true, color: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Get alternative envelopes for each transaction
    const allEnvelopes = await db.envelope.findMany({
      where: { userId: req.user.id, isActive: true },
      select: { id: true, name: true, icon: true, color: true, balanceCents: true }
    });

    const pendingWithAlternatives = pendingTransactions.map(tx => ({
      ...tx,
      amount: toDollars(Math.abs(tx.amountCents)),
      assignedEnvelope: tx.envelope,
      alternativeEnvelopes: allEnvelopes.filter(env => env.id !== tx.envelopeId)
    }));

    res.json({ pendingTransactions: pendingWithAlternatives });
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching pending approvals');
    res.status(500).json({ error: 'Failed to fetch pending transactions' });
  }
});

/**
 * Approve or reassign pending transaction
 */
router.post('/approve-transaction/:id', async (req: any, res) => {
  try {
    const transactionId = parseInt(req.params.id);
    const { approved, newEnvelopeId } = req.body;

    const transaction = await db.transaction.findFirst({
      where: { id: transactionId, userId: req.user.id, status: 'PENDING' },
      include: { envelope: true }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Pending transaction not found' });
    }

    const targetEnvelopeId = approved ? transaction.envelopeId : newEnvelopeId;
    
    if (!targetEnvelopeId) {
      return res.status(400).json({ error: 'Target envelope required' });
    }

    const updatedTransaction = await db.$transaction(async (tx) => {
      // Update transaction status and envelope if reassigned
      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: { 
          status: 'SETTLED',
          envelopeId: targetEnvelopeId,
          reason: approved ? transaction.reason : 'User reassigned category'
        },
        include: { envelope: { select: { id: true, name: true, icon: true, color: true } } }
      });

      // Deduct from envelope balance
      await tx.envelope.update({
        where: { id: targetEnvelopeId },
        data: { 
          balanceCents: { decrement: Math.abs(transaction.amountCents) },
          spentThisMonth: { increment: Math.abs(transaction.amountCents) }
        }
      });

      return updated;
    });

    res.json({ 
      success: true, 
      transaction: updatedTransaction,
      message: approved ? 'Transaction approved' : 'Transaction reassigned and approved'
    });
  } catch (error: any) {
    logger.error({ err: error }, 'Error approving transaction');
    res.status(500).json({ error: 'Failed to approve transaction' });
  }
});

export default router;