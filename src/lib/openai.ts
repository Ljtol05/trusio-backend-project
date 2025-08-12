import OpenAI from 'openai';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const openai = env.OPENAI_API_KEY ? new OpenAI({
  apiKey: env.OPENAI_API_KEY,
}) : null;

export const isAIEnabled = () => !!openai;

export const createChatCompletion = async (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => {
  if (!openai) {
    throw new Error('OpenAI not configured');
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    logger.error(error, 'OpenAI API error');
    throw new Error('AI service unavailable');
  }
};