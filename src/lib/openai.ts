// src/lib/openai.ts
import OpenAI from "openai";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const MODELS = {
  primary: env.OPENAI_MODEL_PRIMARY,
  fallback: env.OPENAI_MODEL_FALLBACK,
} as const;

export const openai = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      project: env.OPENAI_PROJECT_ID || undefined,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: env.OPENAI_MAX_RETRIES,
    })
  : null;

export const isAIEnabled = () => !!openai && !!env.OPENAI_API_KEY;

// Models that should not receive a custom temperature on chat.completions
const NO_TEMP_MODELS = [/^gpt-4\.1/, /^gpt-5/];
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
    throw Object.assign(new Error("OPENAI_API_KEY missing"), { code: "NO_KEY" });
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

      const res = await openai.chat.completions.create(payload);
      const content = res.choices[0]?.message?.content ?? "{}";
      const obj = JSON.parse(content);
      return validate ? validate(obj) : (obj as T);
    } catch (err: any) {
      lastErr = err;
      logger.error({ error: err, model: m }, "OpenAI request failed");

      // keep fallback behavior on common transient or permission errors
      const status = Number(err?.status ?? err?.code);
      const retriable = [400, 403, 408, 409, 429, 500, 502, 503, 504].includes(status);
      if (!retriable && m !== MODELS.primary) break;
    }
  }
  throw lastErr ?? new Error("OpenAI request failed");
}

export async function openaiPing(model = MODELS.primary) {
  if (!env.OPENAI_API_KEY || !openai) return { ok: false, reason: "NO_KEY" as const };
  try {
    const payload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model,
      messages: [{ role: "user", content: 'reply with {"ok":true}' }],
      response_format: { type: "json_object" },
      // don't set temperature here
    };
    const res = await openai.chat.completions.create(payload);
    const json = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    return { ok: Boolean(json.ok), model };
  } catch (e: any) {
    return { ok: false, model, reason: e?.message ?? "unknown" };
  }
}

export const createChatCompletion = async (
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
) => {
  if (!openai) throw new Error("OpenAI not configured");
  const res = await openai.chat.completions.create({
    model: MODELS.primary,
    messages,
    // omit temperature here as well
    max_tokens: 500,
  });
  return res.choices[0]?.message?.content || "";
};