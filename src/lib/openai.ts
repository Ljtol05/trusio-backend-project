
import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const MODELS = {
  primary: env.OPENAI_MODEL_PRIMARY,     // default: gpt-4o-mini
  fallback: env.OPENAI_MODEL_FALLBACK,   // default: gpt-3.5-turbo
} as const;

export const openai = env.OPENAI_API_KEY ? new OpenAI({
  apiKey: env.OPENAI_API_KEY, // service-account project key
  timeout: env.OPENAI_TIMEOUT_MS,
  maxRetries: env.OPENAI_MAX_RETRIES,
}) : null;

export const isAIEnabled = () => !!openai && !!env.OPENAI_API_KEY;

type ChatJSONParams<T> = {
  system?: string;
  user: string;
  schemaName?: string;   // optional label for the expected JSON
  temperature?: number;
  model?: string;        // override
  validate?: (obj: unknown) => T; // optional validator (zod.parse)
};

/**
 * Calls OpenAI and expects a single JSON object in the response.
 * If the primary model fails with permission/overload, falls back.
 */
export async function chatJSON<T = unknown>({
  system,
  user,
  schemaName = "result",
  temperature = 0.2,
  model,
  validate,
}: ChatJSONParams<T>): Promise<T> {
  if (!env.OPENAI_API_KEY || !openai) {
    // surface a clean error the route can catch and turn into 503
    throw Object.assign(new Error("OPENAI_API_KEY missing"), { code: "NO_KEY" });
  }

  const modelsToTry = [model ?? MODELS.primary, MODELS.fallback];

  let lastErr: unknown;
  for (const m of modelsToTry) {
    try {
      const res = await openai.chat.completions.create({
        model: m,
        messages: [
          ...(system ? [{ role: "system" as const, content: system }] : []),
          { role: "user", content: `${user}\n\nRespond with a single JSON object named "${schemaName}".` },
        ],
        temperature,
        response_format: { type: "json_object" },
      });

      const content = res.choices[0]?.message?.content ?? "{}";
      const obj = JSON.parse(content);
      return validate ? validate(obj) : (obj as T);
    } catch (err: any) {
      lastErr = err;
      logger.error({ error: err, model: m }, 'OpenAI request failed');
      
      // Permission/rate-limit/overload cases can try fallback once
      const status = err?.status ?? err?.code;
      const retriable = [403, 408, 409, 429, 500, 502, 503, 504].includes(Number(status));
      if (!retriable && m !== MODELS.primary) break;
      // continue to next model
    }
  }
  throw lastErr ?? new Error("OpenAI request failed");
}

/** Light-weight ping to confirm the key works and the model is reachable. */
export async function openaiPing(model = MODELS.primary) {
  if (!env.OPENAI_API_KEY || !openai) return { ok: false, reason: "NO_KEY" as const };
  try {
    const res = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: "reply with {\"ok\":true}" }],
      response_format: { type: "json_object" },
      temperature: 0,
      timeout: 8000,
    });
    const json = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    return { ok: Boolean(json.ok), model };
  } catch (e: any) {
    return { ok: false, model, reason: e?.message ?? "unknown" };
  }
}

// Legacy function for backward compatibility with existing routes
export const createChatCompletion = async (messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]) => {
  if (!openai) {
    throw new Error('OpenAI not configured');
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODELS.primary,
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
