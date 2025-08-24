
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export const AGENT_CONFIG = {
  // Default model settings
  defaultModel: env.OPENAI_MODEL_AGENTIC,
  fallbackModel: env.OPENAI_MODEL_PRIMARY,
  
  // Agent behavior settings
  maxTokens: 2000,
  temperature: 0.7,
  
  // Tool execution settings
  maxToolCalls: 5,
  toolTimeout: 30000, // 30 seconds
  
  // Routing settings
  routingConfidence: 0.8,
  fallbackToDefault: true,
  
  // Logging settings
  logAgentCalls: env.NODE_ENV === 'development',
  logToolCalls: env.NODE_ENV === 'development',
} as const;

export const AGENT_PROMPTS = {
  systemBase: `You are a helpful financial assistant using the envelope budgeting method. 
  You have access to various tools to help users manage their finances effectively.
  Always be supportive, encouraging, and provide actionable advice.`,
  
  budgetCoach: `You specialize in budget creation and envelope management. 
  Focus on helping users set up sustainable budgeting systems.`,
  
  transactionAnalyst: `You specialize in transaction analysis and spending insights. 
  Help users understand their spending patterns and identify improvement opportunities.`,
  
  financialAdvisor: `You provide comprehensive financial guidance and can coordinate 
  with other specialists when needed. Think holistically about the user's financial situation.`,
  
  insightGenerator: `You generate actionable insights from financial data. 
  Focus on trends, patterns, and personalized recommendations.`,
} as const;

export function validateAgentConfig(): boolean {
  try {
    const requiredEnvVars = [
      'OPENAI_API_KEY',
      'OPENAI_MODEL_AGENTIC',
      'OPENAI_MODEL_PRIMARY'
    ];
    
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      logger.error({ missing }, 'Missing required environment variables for agents');
      return false;
    }
    
    logger.info('Agent configuration validated successfully');
    return true;
  } catch (error) {
    logger.error({ error }, 'Agent configuration validation failed');
    return false;
  }
}
