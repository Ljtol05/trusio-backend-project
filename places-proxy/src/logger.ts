
import type { Config } from './types.js';

export interface LogContext {
  reqId?: string;
  method?: string;
  path?: string;
  status?: number;
  latencyMs?: number;
  cacheHit?: boolean;
  upstreamStatus?: number;
  errorCode?: string;
  ip?: string;
}

class Logger {
  private logLevel: string;

  constructor(config: Config) {
    this.logLevel = config.logLevel;
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const targetLevelIndex = levels.indexOf(level);
    return targetLevelIndex >= currentLevelIndex;
  }

  private log(level: string, message: string, context: LogContext = {}) {
    if (!this.shouldLog(level)) return;

    const logEntry = {
      level,
      ts: new Date().toISOString(),
      message,
      ...context,
    };

    console.log(JSON.stringify(logEntry));
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }
}

export const logger = new Logger({ logLevel: process.env.LOG_LEVEL || 'info' } as Config);
import pino from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  } : undefined,
});
