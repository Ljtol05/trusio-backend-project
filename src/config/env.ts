import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000').transform(Number),
  DATABASE_URL: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().min(1).default('fallback-jwt-secret-change-in-production'),

  // Email Configuration (Resend)
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional().default('Verify <verify@owllocate.it.com>'),
  VERIFICATION_CODE_TTL: z.string().default('600000'),

  // OpenAI - Required for AI agent functionality
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required for AI features'),
  OPENAI_PROJECT_ID: z.string().min(1, 'OPENAI_PROJECT_ID is required for proper model access'), 
  OPENAI_MODEL_PRIMARY: z.string().default('gpt-4-1-mini'), // Optimized for agent workflows
  OPENAI_MODEL_FALLBACK: z.string().default('gpt-4o-mini'),
  OPENAI_MODEL_AGENTIC: z.string().default('gpt-5'), // For complex agentic tasks
  OPENAI_MODEL_EMBEDDING: z.string().default('text-embedding-3-small'),

  //timeouts/retries - optimized for agent interactions
  OPENAI_TIMEOUT_MS: z.string().default('90000').transform(Number), // Longer for complex agent responses
  OPENAI_MAX_RETRIES: z.string().default('2').transform(Number), // Fewer retries for faster agent response

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
});

// Parse environment variables and log what we're getting
const rawEnv = {
  ...process.env,
  // Ensure we're reading from the actual environment
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
  MAIL_FROM: process.env.MAIL_FROM,
};

export const env = envSchema.parse(rawEnv);

// Validate OpenAI configuration for agent functionality
if (!env.OPENAI_API_KEY || !env.OPENAI_PROJECT_ID) {
  console.error("[env] Missing required OpenAI configuration:");
  if (!env.OPENAI_API_KEY) console.error("  - OPENAI_API_KEY is required");
  if (!env.OPENAI_PROJECT_ID) console.error("  - OPENAI_PROJECT_ID is required"); 
  console.error("Please set these values in Replit Secrets for AI agent functionality.");
}

// Log successful OpenAI configuration
if (env.OPENAI_API_KEY && env.OPENAI_PROJECT_ID) {
  console.log("[env] OpenAI configured successfully for project:", env.OPENAI_PROJECT_ID);
}