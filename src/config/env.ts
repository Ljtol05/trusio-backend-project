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

  // OpenAI - Optional for AI agent functionality
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_PROJECT_ID: z.string().optional(), 
  OPENAI_MODEL_PRIMARY: z.string().default('gpt-3.5-turbo'), // Universally available
  OPENAI_MODEL_FALLBACK: z.string().default('gpt-3.5-turbo-0125'), // Reliable fallback
  OPENAI_MODEL_AGENTIC: z.string().default('gpt-4-turbo-preview'), // For complex agentic tasks
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
  console.warn("[env] OpenAI configuration incomplete:");
  if (!env.OPENAI_API_KEY) console.warn("  - OPENAI_API_KEY missing from Replit Secrets");
  if (!env.OPENAI_PROJECT_ID) console.warn("  - OPENAI_PROJECT_ID missing from Replit Secrets"); 
  console.warn("AI features will be disabled. Set these in Replit Secrets to enable AI functionality.");
} else {
  console.log("[env] ✅ OpenAI configured successfully");
  console.log("[env] Project ID:", env.OPENAI_PROJECT_ID);
  console.log("[env] API Key:", env.OPENAI_API_KEY ? `${env.OPENAI_API_KEY.substring(0, 7)}...` : 'missing');
}