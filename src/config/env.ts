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

  // OpenAI
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_PROJECT_ID: z.string().optional().default(''), 
  OPENAI_MODEL_PRIMARY: z.string().default('gpt-4o-mini'),
  OPENAI_MODEL_FALLBACK: z.string().default('gpt-3.5-turbo'),

  //timeouts/retries
  OPENAI_TIMEOUT_MS: z.string().default('60000').transform(Number),
  OPENAI_MAX_RETRIES: z.string().default('3').transform(Number),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
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

if (!env.OPENAI_API_KEY) {
  // Don't throw on boot (so /healthz still works), but log a clear hint
  console.warn("[env] OPENAI_API_KEY is missing. AI routes will return 503.");
}