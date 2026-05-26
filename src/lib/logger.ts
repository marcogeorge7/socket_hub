import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Application logger. Pretty-prints in development, structured JSON otherwise
 * (so Datadog / log shippers can parse it).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        }
      : undefined,
});
