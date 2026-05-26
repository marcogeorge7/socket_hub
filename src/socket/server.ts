import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { corsOrigins, redisEnabled } from '../config/env.js';
import { getPubClient, getAdapterSubClient } from '../lib/redis.js';
import { registerNamespaces } from './namespaces.js';
import { bindServer } from './emit.js';
import { logger } from '../lib/logger.js';

/**
 * Create the Socket.IO server attached to an existing HTTP server, wire the
 * Redis adapter (so multiple instances broadcast to each other), and register
 * the per-project namespaces.
 */
export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    transports: ['websocket', 'polling'],
  });

  if (redisEnabled) {
    // The adapter uses its own internal channel prefix, kept separate from the
    // publish-bridge `socket:*` channels handled by the event subscriber.
    io.adapter(createAdapter(getPubClient(), getAdapterSubClient(), { key: 'socket-hub' }));
    logger.info('redis adapter attached');
  } else {
    logger.warn(
      'REDIS_URL not set — running single-process (in-memory) mode. ' +
        'Horizontal scaling and the Redis publish bridge are disabled; ' +
        'use the HTTP trigger API (POST /api/trigger) to publish.',
    );
  }

  bindServer(io);
  registerNamespaces(io);

  return io;
}
