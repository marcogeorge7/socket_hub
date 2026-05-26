import { createServer } from 'node:http';
import { env, redisEnabled } from './config/env.js';
import { projectNames } from './config/projects.js';
import { createApp } from './http/app.js';
import { createSocketServer } from './socket/server.js';
import { startRedisSubscriber } from './publish/redis-subscriber.js';
import { closeRedis } from './lib/redis.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  // The Redis publish bridge (path B) only runs when Redis is configured.
  if (redisEnabled) {
    await startRedisSubscriber();
  }

  // Under Phusion Passenger (e.g. Hostinger's Node app hosting) the platform
  // intercepts listen() and binds to its own socket regardless of the port.
  // On a VPS / locally we bind to env.PORT directly.
  httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, projects: projectNames },
      'socket-hub listening',
    );
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    const forceExit = setTimeout(() => {
      logger.error('forced exit after timeout');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      await io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await closeRedis();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
