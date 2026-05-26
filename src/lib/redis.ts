import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Create an ioredis client from REDIS_URL with sane reconnect behaviour and
 * error logging. We create several clients because Redis connections in
 * subscriber mode cannot also issue normal commands.
 */
function createClient(role: string): Redis {
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL is not set; Redis features are disabled');
  }
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  client.on('connect', () => logger.info({ role }, 'redis connecting'));
  client.on('ready', () => logger.info({ role }, 'redis ready'));
  client.on('error', (err) => logger.error({ role, err }, 'redis error'));
  client.on('close', () => logger.warn({ role }, 'redis connection closed'));

  return client;
}

/**
 * The three connections we need:
 *  - pubClient / subClient: the Socket.IO Redis adapter pair (scale-out).
 *  - eventSubscriber: the publish-bridge subscriber for `socket:*` channels.
 *
 * They are created lazily via getters so importing this module in tests
 * (without a Redis server) doesn't force connections until used.
 */
let _pub: Redis | undefined;
let _adapterSub: Redis | undefined;
let _eventSub: Redis | undefined;

export function getPubClient(): Redis {
  return (_pub ??= createClient('adapter-pub'));
}

export function getAdapterSubClient(): Redis {
  return (_adapterSub ??= createClient('adapter-sub'));
}

export function getEventSubscriber(): Redis {
  return (_eventSub ??= createClient('event-sub'));
}

/** Gracefully close every client we opened. */
export async function closeRedis(): Promise<void> {
  await Promise.allSettled(
    [_pub, _adapterSub, _eventSub].filter((c): c is Redis => Boolean(c)).map((c) => c.quit()),
  );
}
