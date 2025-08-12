import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from './auth.js';
import { createChatCompletion, isAIEnabled } from '../lib/openai.js';
import { AICoachRequestSchema, RoutingExplanationRequestSchema } from '../types/dto.js';
import { findBestEnvelope } from './routing.js';

const router = Router();
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
    
    // Get user's envelope data for context
    const envelopes = await db.envelope.findMany({
      where: { userId: req.user.id },
      select: { name: true, balance: true, budgetLimit: true },
    });
    
    // Get recent transactions for context
    const recentTransactions = await db.transaction.findMany({
      where: { userId: req.user.id },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { amount: true, description: true, merchantName: true },
    });
    
    const systemPrompt = `You are a helpful financial coach for an envelope budgeting app. 
    The user has the following envelopes: ${JSON.stringify(envelopes, null, 2)}
    Recent transactions: ${JSON.stringify(recentTransactions, null, 2)}
    
    Provide helpful, actionable advice about budgeting, spending habits, and envelope management.
    Keep responses concise and practical.`;
    
    const response = await createChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ]);
    
    res.json({ response });
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
    
    const { transactionData } = req.body;

    // Convert amountCents to amount for routing logic
    const routingData = {
      amount: transactionData.amountCents || transactionData.amount,
      merchantName: transactionData.merchantName,
      mcc: transactionData.mcc,
      location: transactionData.location,
    };
    
    // Get routing suggestion
    const routingResult = await findBestEnvelope(req.user.id, routingData);
    
    if (!routingResult.envelope) {
      return res.status(404).json({ error: 'No routing suggestion available' });
    }
    
    // Get user's routing rules for context
    const rules = await db.routingRule.findMany({
      where: { userId: req.user.id, isActive: true },
      include: { envelope: { select: { name: true } } },
      orderBy: { priority: 'asc' },
    });
    
    const systemPrompt = `You are an AI assistant explaining envelope budgeting routing decisions.
    
    Transaction details: ${JSON.stringify(transactionData, null, 2)}
    Chosen envelope: ${routingResult.envelope.name}
    Routing reason: ${routingResult.reason}
    User's routing rules: ${JSON.stringify(rules, null, 2)}
    
    Explain in simple terms why this envelope was chosen for this transaction.
    Include any relevant rules that were applied or why the fallback was used.
    Keep the explanation clear and educational.`;
    
    const explanation = await createChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Explain why this envelope was chosen for my transaction.' },
    ]);
    
    res.json({
      envelope: routingResult.envelope,
      rule: routingResult.rule,
      explanation,
      reason: routingResult.reason,
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