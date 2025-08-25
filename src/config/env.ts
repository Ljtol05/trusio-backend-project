import { z } from 'zod';
import OpenAI from 'openai';
import { setDefaultOpenAIKey, setDefaultOpenAIClient, setOpenAIAPI, setTracingDisabled } from '@openai/agents';

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
  if (env.OPENAI_API_KEY) {
    const clientConfig: any = {
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: env.OPENAI_MAX_RETRIES,
    };

    // Add project or organization ID if available
    if (env.OPENAI_PROJECT_ID) {
      clientConfig.project = env.OPENAI_PROJECT_ID;
    } else if (env.OPENAI_ORG_ID) {
      clientConfig.organization = env.OPENAI_ORG_ID;
    }

    openaiClient = new OpenAI(clientConfig);
    
    // Configure OpenAI Agents SDK
    setDefaultOpenAIKey(env.OPENAI_API_KEY);
    setDefaultOpenAIClient(openaiClient);
    setOpenAIAPI(env.OPENAI_AGENTS_API_TYPE);
    
    // Configure tracing
    if (!env.OPENAI_AGENTS_TRACING_ENABLED) {
      setTracingDisabled(true);
    }
    
    console.log("[env] ✅ OpenAI Client initialized successfully");
    console.log("[env] ✅ Agents SDK configured");
    if (env.OPENAI_PROJECT_ID) console.log("[env] Using Project ID:", env.OPENAI_PROJECT_ID);
    if (env.OPENAI_ORG_ID) console.log("[env] Using Org ID:", env.OPENAI_ORG_ID);
    console.log("[env] Agents API Type:", env.OPENAI_AGENTS_API_TYPE);
    console.log("[env] Tracing Enabled:", env.OPENAI_AGENTS_TRACING_ENABLED);
  } else {
    console.warn("[env] OpenAI configuration incomplete:");
    console.warn("  - OPENAI_API_KEY missing from Replit Secrets");
    console.warn("AI features will be disabled. Set OPENAI_API_KEY in Replit Secrets to enable AI functionality.");
  }
} catch (error) {
  console.error("[env] ❌ Failed to initialize OpenAI client:", error);
  openaiClient = null;
}

export const openai = openaiClient;
export const isAIEnabled = () => !!openaiClient && !!env.OPENAI_API_KEY;