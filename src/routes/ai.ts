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

    const systemPrompt = `You are an expert financial advisor for an envelope budgeting system. Analyze this specific situation and provide actionable advice with concrete numbers and steps.

CURRENT FINANCIAL STATE:
Total Balance: $${toDollars(totalBalance)}
Total Spent This Month: $${totalSpent.toFixed(2)}
Number of Envelopes: ${envelopeContext.length}

ENVELOPE BREAKDOWN:
${envelopeContext.map(e => `• ${e.name}: $${e.balance} available (spent $${e.spentThisMonth} this month)`).join('\n')}

SPENDING INSIGHTS:
• Highest spending: ${highestSpendingEnv.name} ($${highestSpendingEnv.spentThisMonth})
• Lowest balance: ${lowestBalanceEnv.name} ($${lowestBalanceEnv.balance})
• Average per category: $${avgSpendingPerEnvelope.toFixed(2)}

RECENT TRANSACTIONS:
${recentTransactions.slice(0, 5).map(t => `• $${toDollars(Math.abs(t.amountCents))} at ${t.merchant || 'Unknown'} → ${t.envelope?.name || 'Unassigned'}`).join('\n')}

USER QUESTION: "${question}"

Provide specific advice addressing their exact question. Include dollar amounts, envelope names, and actionable steps. If recommending transfers or new envelopes, be specific about amounts and reasons.

Respond in JSON format only:
{
  "advice": "Detailed, specific advice addressing the user's question with actual numbers and envelope names",
  "actions": [
    {
      "type": "transfer|create_envelope", 
      "description": "Clear description with specific amounts", 
      "params": {
        "fromEnvelope": "Source envelope name",
        "toEnvelope": "Target envelope name", 
        "amount": 100
      }
    }
  ]
}

Be conversational but specific. Reference their actual envelope names and balances in your advice.`;

    let result;
    let aiSuccess = false;

    try {
      // Try AI with optimized settings and faster timeout
      result = await Promise.race([
        chatJSON({
          system: systemPrompt,
          user: question,
          schemaName: 'coachResponse',
          temperature: undefined, // Let the model use its default
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
            throw new Error('Invalid AI response format');
          },
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI timeout - using smart fallback')), 15000)
        )
      ]);

      aiSuccess = true;
    } catch (aiError) {
      logger.warn({ err: aiError, question }, 'AI Coach timeout/error, using smart fallback');

      // Enhanced smart fallback using actual user data
      let contextualAdvice = '';
      let suggestedActions = [];
      const questionLower = question.toLowerCase();

      // Analyze user's actual financial state for smarter recommendations
      const hasLowBalances = envelopeContext.filter(env => env.balanceCents < 2000).length;
      const hasHighBalances = envelopeContext.filter(env => env.balanceCents > 10000);
      const totalSpentThisMonth = envelopeContext.reduce((sum, env) => sum + parseFloat(env.spentThisMonth), 0);
      const avgBalance = totalBalance / 100 / envelopeContext.length;

      if (questionLower.includes('raise') || questionLower.includes('income') || questionLower.includes('money')) {
        // Handle income/raise questions
        const suggestedAmount = Math.min(1000, avgBalance * 2); // Base on current avg
        contextualAdvice = `With your current $${toDollars(totalBalance)} across ${envelopeContext.length} envelopes (avg: $${avgBalance.toFixed(0)} each), I'd allocate new income strategically: 40% to ${lowestBalanceEnv.name} (currently $${lowestBalanceEnv.balance}), 35% to ${highestSpendingEnv.name} (your top spending at $${highestSpendingEnv.spentThisMonth}), and 25% to emergency savings.`;
        suggestedActions = [{
          type: 'transfer',
          description: `Boost ${lowestBalanceEnv.name} with 40% of new income`,
          params: { fromEnvelope: 'Income Allocation', toEnvelope: lowestBalanceEnv.name, amount: suggestedAmount * 0.4 }
        }];
      } else if (questionLower.includes('car') || questionLower.includes('repair') || questionLower.includes('emergency')) {
        // Handle emergency/repair questions with real envelope analysis
        const fundingSources = envelopeContext.filter(env => env.balanceCents > 5000).sort((a, b) => b.balanceCents - a.balanceCents);
        const neededAmount = 800; // Default repair amount

        if (fundingSources.length > 0) {
          const primarySource = fundingSources[0];
          const canCoverAmount = Math.min(neededAmount, primarySource.balanceCents / 100 * 0.4);
          contextualAdvice = `For the $${neededAmount} repair: Pull $${canCoverAmount.toFixed(0)} from ${primarySource.name} ($${primarySource.balance} available). ${fundingSources.length > 1 ? `Additional backup: ${fundingSources[1].name} ($${fundingSources[1].balance}).` : ''} Consider setting aside $${(totalBalance / 100 * 0.1).toFixed(0)}/month for future emergencies.`;
          suggestedActions = [{
            type: 'transfer',
            description: `Use ${primarySource.name} for repair ($${canCoverAmount.toFixed(0)})`,
            params: { fromEnvelope: primarySource.name, toEnvelope: 'Emergency Repair', amount: canCoverAmount }
          }];
        } else {
          contextualAdvice = `For the $${neededAmount} repair, you'll need to combine multiple envelopes. Your top options: ${envelopeContext.slice(0, 3).map(e => `${e.name} ($${e.balance})`).join(', ')}. Total available: $${toDollars(totalBalance)}.`;
        }

        const emergencyFundAmount = Math.max(50, totalBalance / 100 * 0.05);
        contextualAdvice += ` Start building an emergency fund with $${emergencyFundAmount.toFixed(0)}/month.`;
      } else if (questionLower.includes('dining') || questionLower.includes('food') || questionLower.includes('restaurant') || questionLower.includes('overspending')) {
        // Handle dining/food overspending questions with envelope analysis
        const diningEnv = envelopeContext.find(env => 
          env.name.toLowerCase().includes('dining') || 
          env.name.toLowerCase().includes('food') || 
          env.name.toLowerCase().includes('restaurant')
        );
        const currentSpending = parseFloat(diningEnv?.spentThisMonth || '0');
        const currentBalance = parseFloat(diningEnv?.balance || '0');
        const suggestedMonthlyLimit = Math.max(avgBalance, 150); // Based on user's average or minimum

        contextualAdvice = `Your ${diningEnv?.name || 'dining'} spending: $${currentSpending.toFixed(2)} this month with $${currentBalance.toFixed(2)} remaining. For your budget level ($${avgBalance.toFixed(0)} avg/envelope), target $${suggestedMonthlyLimit.toFixed(0)}/month dining. Weekly limit: $${(suggestedMonthlyLimit / 4).toFixed(0)}. ${currentBalance > suggestedMonthlyLimit * 0.5 ? `Consider moving $${(currentBalance * 0.3).toFixed(0)} to ${lowestBalanceEnv.name}.` : 'Focus on meal prep 3x/week.'}`;

        if (diningEnv && currentBalance > suggestedMonthlyLimit * 0.5) {
          suggestedActions = [{
            type: 'transfer',
            description: `Reallocate excess dining funds to ${lowestBalanceEnv.name}`,
            params: { fromEnvelope: diningEnv.name, toEnvelope: lowestBalanceEnv.name, amount: currentBalance * 0.3 }
          }];
        }
      } else if (questionLower.includes('vacation') || questionLower.includes('save') || questionLower.includes('trip')) {
        // Handle vacation/savings questions
        const targetAmount = questionLower.match(/\$?(\d+)/)?.[1] ? parseInt(questionLower.match(/\$?(\d+)/)?.[1] || '2000') : 2000;
        const timeframe = questionLower.match(/(\d+)\s*(month|week)/)?.[1] ? parseInt(questionLower.match(/(\d+)\s*(month|week)/)?.[1] || '6') : 6;
        const monthlyNeeded = targetAmount / timeframe;
        const canContribute = envelopeContext.filter(env => env.balanceCents > 5000);

        contextualAdvice = `For $${targetAmount} in ${timeframe} months, save $${monthlyNeeded.toFixed(0)}/month. With your $${toDollars(totalBalance)} total, ${canContribute.length > 0 ? `transfer $${(canContribute.reduce((sum, env) => sum + env.balanceCents, 0) / 100 * 0.15).toFixed(0)} from higher-balance envelopes (${canContribute.map(e => e.name).join(', ')}) to start.` : `reduce spending by $${monthlyNeeded.toFixed(0)}/month across all categories.`}`;

        if (canContribute.length > 0) {
          suggestedActions = [{
            type: 'create_envelope',
            description: `Create vacation fund with initial $${(canContribute[0].balanceCents / 100 * 0.2).toFixed(0)}`,
            params: { name: 'Vacation Fund', initialAmount: canContribute[0].balanceCents / 100 * 0.2, icon: 'gift', color: 'purple' }
          }];
        }
      } else {
        // Enhanced general advice based on spending patterns and balance distribution
        const needsAttention = envelopeContext.filter(env => env.balanceCents < avgBalance * 50); // Below 50% of average
        const overFunded = envelopeContext.filter(env => env.balanceCents > avgBalance * 200); // Above 200% of average
        const topSpenders = envelopeContext.sort((a, b) => parseFloat(b.spentThisMonth) - parseFloat(a.spentThisMonth)).slice(0, 3);

        contextualAdvice = `Your $${toDollars(totalBalance)} budget analysis: Average $${avgBalance.toFixed(0)} per envelope. `;

        if (needsAttention.length > 0 && overFunded.length > 0) {
          const rebalanceAmount = Math.min(avgBalance, overFunded[0].balanceCents / 100 * 0.25);
          contextualAdvice += `Rebalancing opportunity: ${needsAttention.map(env => `${env.name} ($${env.balance})`).join(', ')} are underfunded. Transfer $${rebalanceAmount.toFixed(0)} from ${overFunded[0].name} ($${overFunded[0].balance}). `;
          suggestedActions = [{
            type: 'transfer',
            description: `Rebalance $${rebalanceAmount.toFixed(0)} from ${overFunded[0].name} to ${needsAttention[0].name}`,
            params: { fromEnvelope: overFunded[0].name, toEnvelope: needsAttention[0].name, amount: rebalanceAmount }
          }];
        } else if (topSpenders.length > 0) {
          contextualAdvice += `Top spending: ${topSpenders.map(env => `${env.name} ($${env.spentThisMonth})`).join(', ')}. `;
        }

        // Add specific budget health insights
        const budgetHealth = totalSpentThisMonth / (totalBalance / 100) * 100;
        if (budgetHealth > 50) {
          contextualAdvice += `You've spent ${budgetHealth.toFixed(0)}% of available funds this month - consider slowing discretionary spending.`;
        } else {
          contextualAdvice += `Good spending pace at ${budgetHealth.toFixed(0)}% of budget used this month.`;
        }
      }

      result = { advice: contextualAdvice, actions: suggestedActions };

      result = contextualAdvice;
    }

    res.json({ 
      response: result?.advice || result,
      suggestedActions: result?.actions || [],
      analytics: {
        totalBalance: toDollars(totalBalance),
        totalSpent: totalSpent.toFixed(2),
        envelopeCount: envelopeContext.length,
        highestSpending: highestSpendingEnv.name,
        lowestBalance: lowestBalanceEnv.name,
        averageBalance: avgBalance.toFixed(0),
        budgetUtilization: (totalSpentThisMonth / (totalBalance / 100) * 100).toFixed(0) + '%'
      },
      isAiFallback: !aiSuccess,
      confidence: aiSuccess ? 90 : 80, // Higher confidence for data-driven fallbacks
      processingTime: aiSuccess ? 'AI response' : 'Smart fallback (AI timeout)',
      recommendations: result?.actions?.length > 0 ? 'Actions available' : 'Informational only'
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