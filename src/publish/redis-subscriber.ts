import { getEventSubscriber } from '../lib/redis.js';
import { getProject } from '../config/projects.js';
import { emitToChannel } from '../socket/emit.js';
import { logger } from '../lib/logger.js';
import type { TriggerPayload } from '../types/index.js';

/** Pattern for the publish-bridge channels: socket:<project>:<channel>. */
const PATTERN = 'socket:*';

/**
 * Start the Redis publish bridge (path B). Backends publish a JSON
 * { event, data } message to `socket:<project>:<channel>`; we forward it to
 * the matching namespace/room via the shared emit core.
 *
 * This is independent of the Socket.IO Redis adapter (which uses its own
 * "socket-hub" prefixed channels for inter-instance broadcast).
 */
export async function startRedisSubscriber(): Promise<void> {
  const sub = getEventSubscriber();

  sub.on('pmessage', (_pattern: string, redisChannel: string, message: string) => {
    // socket:<project>:<channel> — channel may itself contain colons.
    const withoutPrefix = redisChannel.slice('socket:'.length);
    const sep = withoutPrefix.indexOf(':');
    if (sep === -1) {
      logger.warn({ redisChannel }, 'malformed publish channel, ignoring');
      return;
    }
    const project = withoutPrefix.slice(0, sep);
    const channel = withoutPrefix.slice(sep + 1);

    if (!getProject(project)) {
      logger.warn({ project, redisChannel }, 'publish for unknown project, ignoring');
      return;
    }

    let payload: TriggerPayload;
    try {
      const parsed = JSON.parse(message) as Partial<TriggerPayload>;
      if (!parsed.event) {
        logger.warn({ redisChannel }, 'publish message missing "event", ignoring');
        return;
      }
      payload = { channel, event: parsed.event, data: parsed.data };
    } catch (err) {
      logger.warn({ redisChannel, err }, 'invalid JSON in publish message, ignoring');
      return;
    }

    const result = emitToChannel(project, channel, payload.event, payload.data);
    if (!result.ok) {
      logger.warn({ project, channel, error: result.error }, 'redis publish emit failed');
    }
  });

  await sub.psubscribe(PATTERN);
  logger.info({ pattern: PATTERN }, 'redis publish bridge subscribed');
}
