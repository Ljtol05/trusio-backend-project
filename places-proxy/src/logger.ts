
import pino from 'pino';
import { appConfig } from './config.js';

export const logger = pino({
  level: appConfig.logLevel || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
});
