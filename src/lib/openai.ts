// src/lib/openai.ts
import { env, openai as envOpenAI, isAIEnabled as envIsAIEnabled } from "../config/env.js";
import { logger } from "./logger.js";

export const MODELS = {
  primary: env.OPENAI_MODEL_PRIMARY,
  fallback: env.OPENAI_MODEL_FALLBACK,
  agentic: env.OPENAI_MODEL_AGENTIC,
  embedding: env.OPENAI_MODEL_EMBEDDING,
} as const;

// Use the OpenAI client from env.ts
export const openai = envOpenAI;
export const isAIEnabled = envIsAIEnabled;

export const isAIEnabled = () => !!openai && !!env.OPENAI_API_KEY;

// Models that should not receive a custom temperature on chat.completions
const NO_TEMP_MODELS = [/^gpt-4-1/, /^gpt-5/, /^gpt-4o/, /^gpt-4-turbo/];
const supportsTemperature = (model: string | undefined) =>
  !!model && !NO_TEMP_MODELS.some((re) => re.test(model));

type ChatJSONParams<T> = {
  system?: string;
  user: string;
  schemaName?: string;
  temperature?: number;
  model?: string;
  validate?: (obj: unknown) => T;
};

export async function chatJSON<T = unknown>({
  system,
  user,
  schemaName = "result",
  temperature = 0.2,
  model,
  validate,
}: ChatJSONParams<T>): Promise<T> {
  if (!env.OPENAI_API_KEY || !openai) {
    throw Object.assign(
      new Error("Missing OpenAI API key"), 
      { code: "NO_CONFIG" }
    );
  }

  const modelsToTry = [model ?? MODELS.primary, MODELS.fallback].filter(Boolean) as string[];

  let lastErr: unknown;
  for (const m of modelsToTry) {
    try {
      const payload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: m,
        messages: [
          ...(system ? [{ role: "system" as const, content: system }] : []),
          {
            role: "user",
            content: `${user}\n\nRespond with a single JSON object named "${schemaName}". Use JSON format.`,
          },
        ],
        response_format: { type: "json_object" },
      };

      // Only attach temperature when the model allows it
      if (supportsTemperature(m) && typeof temperature === "number") {
        payload.temperature = temperature;
      }

      logger.info({ model: m, project: env.OPENAI_PROJECT_ID }, "Making OpenAI request");
      const res = await openai.chat.completions.create(payload);
      const content = res.choices[0]?.message?.content ?? "{}";
      
      // Enhanced JSON parsing with better error handling
      let obj;
      try {
        obj = JSON.parse(content);
        
        // Ensure the response has the expected structure
        if (!obj || typeof obj !== 'object') {
          throw new Error('Response is not a valid object');
        }
        
        // If no schemaName wrapper, try to find the actual content
        if (!obj[schemaName] && Object.keys(obj).length === 1) {
          const firstKey = Object.keys(obj)[0];
          obj = { [schemaName]: obj[firstKey] };
        } else if (!obj[schemaName]) {
          obj = { [schemaName]: obj };
        }
        
      } catch (parseError) {
        logger.error({ content, parseError: parseError.message }, "Failed to parse OpenAI JSON response");
        // Create a fallback response structure
        obj = { [schemaName]: { response: content || "I apologize, but I'm having trouble processing your request right now." } };
      }
      
      return validate ? validate(obj) : (obj as T);
    } catch (err: any) {
      lastErr = err;
      logger.error({ 
        error: err.message, 
        status: err.status, 
        code: err.code,
        model: m,
        project: env.OPENAI_PROJECT_ID 
      }, "OpenAI request failed");

      // Enhanced error logging for debugging
      if (err.status === 403) {
        logger.error("Model access denied - check project permissions for model: " + m);
      }
      if (err.status === 404) {
        logger.error("Model not found - ensure model is available in project: " + m);
      }

      // keep fallback behavior on common transient or permission errors
      const status = Number(err?.status ?? err?.code);
      const retriable = [400, 403, 408, 409, 429, 500, 502, 503, 504].includes(status);
      if (!retriable && m !== MODELS.primary) break;
    }
  }
  throw lastErr ?? new Error("OpenAI request failed");
}

export async function openaiPing(model = MODELS.primary) {
  if (!env.OPENAI_API_KEY || !openai) {
    return { 
      ok: false, 
      reason: "NO_CONFIG" as const,
      project: env.OPENAI_PROJECT_ID || env.OPENAI_ORG_ID || "missing"
    };
  }
  
  try {
    const payload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model,
      messages: [{ role: "user", content: 'Reply with JSON format: {"ok":true}' }],
      response_format: { type: "json_object" },
      // don't set temperature here
    };
    
    logger.info({ model, project: env.OPENAI_PROJECT_ID }, "Testing OpenAI connection");
    const res = await openai.chat.completions.create(payload);
    const json = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    
    return { 
      ok: Boolean(json.ok), 
      model,
      project: env.OPENAI_PROJECT_ID
    };
  } catch (e: any) {
    logger.error({
      error: e.message,
      status: e.status,
      model,
      project: env.OPENAI_PROJECT_ID
    }, "OpenAI ping failed");
    
    return { 
      ok: false, 
      model, 
      project: env.OPENAI_PROJECT_ID,
      reason: e?.message ?? "unknown",
      status: e?.status
    };
  }
}

export const createChatCompletion = async (
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    useAgentModel?: boolean;
  } = {}
) => {
  if (!openai) throw new Error("OpenAI not configured");
  
  const selectedModel = options.useAgentModel ? MODELS.agentic : (options.model || MODELS.primary);
  
  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: selectedModel,
    messages,
    max_tokens: options.maxTokens || 1500, // Increased for agent responses
  };

  // Add temperature if model supports it
  if (supportsTemperature(selectedModel) && options.temperature !== undefined) {
    payload.temperature = options.temperature;
  }

  logger.info({ model: selectedModel, project: env.OPENAI_PROJECT_ID }, "Creating chat completion");
  const res = await openai.chat.completions.create(payload);
  return res.choices[0]?.message?.content || "";
};

// Agent-specific function for financial coaching conversations
export const createAgentResponse = async (
  systemPrompt: string,
  userMessage: string,
  conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [],
  options: {
    temperature?: number;
    maxTokens?: number;
    useAdvancedModel?: boolean;
  } = {}
) => {
  if (!env.OPENAI_API_KEY || !openai) {
    throw Object.assign(
      new Error("OpenAI not properly configured for agent functionality"), 
      { code: "NO_CONFIG" }
    );
  }

  const model = options.useAdvancedModel ? MODELS.agentic : MODELS.primary;
  
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage }
  ];

  const payload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model,
    messages,
    max_tokens: options.maxTokens || 2000,
  };

  if (supportsTemperature(model) && options.temperature !== undefined) {
    payload.temperature = options.temperature;
  }

  try {
    logger.info({ 
      model, 
      project: env.OPENAI_PROJECT_ID,
      messageCount: messages.length 
    }, "Creating agent response");
    
    const res = await openai.chat.completions.create(payload);
    return res.choices[0]?.message?.content || "";
  } catch (error: any) {
    logger.error({
      error: error.message,
      status: error.status,
      model,
      project: env.OPENAI_PROJECT_ID
    }, "Agent response failed");
    throw error;
  }
};