import 'dotenv/config';
import { z } from 'zod';

/**
 * Base environment schema. Project secrets are dynamic (per project name)
 * and are validated separately in config/projects.ts.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  CORS_ORIGINS: z.string().default('*'),
  // Optional: when set, enables the Redis adapter (horizontal scaling) and the
  // Redis publish bridge (path B). When absent, the server runs single-process
  // with the in-memory adapter and the HTTP trigger API (path A) only —
  // suitable for Hostinger's Node app hosting, which has no Redis.
  REDIS_URL: z.string().min(1).optional(),
  PROJECTS: z.string().min(1, 'PROJECTS must list at least one project'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Invalid environment configuration:\n',
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;

/** Whether the Redis-backed features (adapter + publish bridge) are enabled. */
export const redisEnabled = Boolean(env.REDIS_URL);

/** Parsed list of allowed CORS origins, or "*" for any. */
export const corsOrigins: string | string[] =
  env.CORS_ORIGINS === '*'
    ? '*'
    : env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean);
