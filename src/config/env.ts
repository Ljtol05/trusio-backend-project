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

  // OpenAI Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_PROJECT_ID: z.string().optional(),
  OPENAI_ORG_ID: z.string().optional(),
  OPENAI_MODEL_PRIMARY: z.string().default("gpt-4o"),
  OPENAI_MODEL_FALLBACK: z.string().default("gpt-4o-mini"),
  OPENAI_MODEL_AGENTIC: z.string().default("gpt-4o"),
  OPENAI_MODEL_EMBEDDING: z.string().default("text-embedding-3-small"),
  OPENAI_TIMEOUT_MS: z.coerce.number().default(60000),
  OPENAI_MAX_RETRIES: z.coerce.number().default(3),

  // Agents SDK Configuration
  OPENAI_AGENTS_TRACING_ENABLED: z.string().transform(val => val === "true").default("true"),
  OPENAI_AGENTS_API_TYPE: z.enum(["chat_completions", "responses"]).default("chat_completions"),

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
if (!env.OPENAI_API_KEY) {
  console.warn("[env] OpenAI configuration incomplete:");
  console.warn("  - OPENAI_API_KEY missing from Replit Secrets");
  console.warn("AI features will be disabled. Set OPENAI_API_KEY in Replit Secrets to enable AI functionality.");
} else {
  console.log("[env] ✅ OpenAI configured successfully");
  if (env.OPENAI_PROJECT_ID) console.log("[env] Project ID:", env.OPENAI_PROJECT_ID);
  if (env.OPENAI_ORG_ID) console.log("[env] Org ID:", env.OPENAI_ORG_ID);
  console.log("[env] API Key:", env.OPENAI_API_KEY ? `${env.OPENAI_API_KEY.substring(0, 7)}...` : 'missing');
}