
import { config } from 'dotenv';
import type { Config } from './types.js';

config();

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

export const appConfig: Config = {
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
  port: parseNumber(process.env.PORT, 8787),
  allowedOrigins: parseStringArray(process.env.ALLOWED_ORIGINS),
  cacheAcTtlSeconds: parseNumber(process.env.CACHE_AC_TTL_SECONDS, 60),
  cacheDetailsTtlSeconds: parseNumber(process.env.CACHE_DETAILS_TTL_SECONDS, 86400),
  cacheMaxItems: parseNumber(process.env.CACHE_MAX_ITEMS, 2000),
  rateLimitGlobalWindowSeconds: parseNumber(process.env.RATE_LIMIT_GLOBAL_WINDOW_SECONDS, 300),
  rateLimitGlobalMax: parseNumber(process.env.RATE_LIMIT_GLOBAL_MAX, 300),
  rateLimitIpWindowSeconds: parseNumber(process.env.RATE_LIMIT_IP_WINDOW_SECONDS, 60),
  rateLimitIpMax: parseNumber(process.env.RATE_LIMIT_IP_MAX, 30),
  softFailAutocomplete: parseBoolean(process.env.SOFT_FAIL_AUTOCOMPLETE, false),
  logLevel: process.env.LOG_LEVEL || 'info',
  requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS, 2500),
};

// Validation
if (!appConfig.googlePlacesApiKey) {
  throw new Error('GOOGLE_PLACES_API_KEY environment variable is required');
}
