import pino from 'pino';

// Create a simple logger that doesn't depend on config to avoid circular deps
const createTransport = () => {
  if (process.env.NODE_ENV === 'development') {
    try {
      return {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      };
    } catch (error) {
      // Fallback to basic console if pino-pretty is not available
      console.warn('pino-pretty not available, using basic transport');
      return undefined;
    }
  }
  return undefined;
};

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: createTransport(),
});