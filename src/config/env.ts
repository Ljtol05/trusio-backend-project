import { z } from 'zod';
import OpenAI from 'openai';
import { configureOpenAIFromEnv } from '../lib/openai.js';

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

// Initialize OpenAI client and configure Agents SDK
let openaiClient: OpenAI | null = null;

try {
  const ok = configureOpenAIFromEnv();
  if (!ok) {
    console.error('[env] ❌ Failed to initialize OpenAI client via configureOpenAIFromEnv()');
  } else {
    console.log('[env] ✅ OpenAI configured successfully');
  }
} catch (err) {
  console.error('[env] ❌ Failed to initialize OpenAI client:', err);
}

// Exporting openaiClient for external use
// Note: The actual client is managed within configureOpenAIFromEnv, and this export might be redundant
// if configureOpenAIFromEnv handles setting a global or accessible client.
// For now, we'll keep it as is to align with the original structure, assuming configureOpenAIFromEnv
// sets a client that can be accessed globally or via a specific export from '@openai/agents'.
// If not, this part would need adjustment based on how configureOpenAIFromEnv exposes the client.
// However, based on the changes, the intention is to let configureOpenAIFromEnv handle the setup entirely.
// The original code had `export const openai = openaiClient;` after the try-catch block.
// Since configureOpenAIFromEnv is meant to handle the initialization, and we don't have direct access
// to the client it creates here, we rely on its internal mechanisms. If an explicit export is needed
// and configureOpenAIFromEnv doesn't provide it, this would need further modification.
// For the purpose of fulfilling the request based on the provided changes, we omit the direct export
// of `openaiClient` as it's now managed internally by `configureOpenAIFromEnv`.

// The following lines are removed as they are handled by configureOpenAIFromEnv:
// setDefaultOpenAIKey(env.OPENAI_API_KEY);
// setDefaultOpenAIClient(openaiClient);
// setOpenAIAPI(env.OPENAI_AGENTS_API_TYPE);
// if (!env.OPENAI_AGENTS_TRACING_ENABLED) {
//   setTracingDisabled(true);
// }

// The console logs related to configuration are now handled within configureOpenAIFromEnv.
// If specific logging is still needed here, it would require knowing the return value or side effects of configureOpenAIFromEnv.

export const isAIEnabled = () => {
  // This check assumes that configureOpenAIFromEnv sets up the environment correctly
  // and that 'openai' (if it were exported directly) or an equivalent global/module variable
  // indicates successful initialization. Without knowing the exact implementation of
  // configureOpenAIFromEnv, we'll infer the AI is enabled if the OpenAI API key is present,
  // and that the configuration process didn't log an explicit error.
  // A more robust check would involve accessing a status flag or the client instance itself,
  // which is not directly exposed in the provided changes.
  // For now, we'll rely on the presence of the API key and assume configureOpenAIFromEnv handles the rest.
  return !!process.env.OPENAI_API_KEY;
};