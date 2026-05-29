import type { Socket } from 'socket.io';
import { isChannelAllowed } from './channels.js';
import { logger } from '../lib/logger.js';
import type { SocketUser } from '../types/index.js';

type Ack = (response: { ok: boolean; error?: string }) => void;

/**
 * Wire per-connection event handlers. Clients manage their channel
 * memberships with `subscribe` / `unsubscribe`; each is authorized against
 * the JWT's channel claims before the socket joins/leaves the room.
 */
export function registerHandlers(socket: Socket): void {
  const user = socket.data.user as SocketUser;

  socket.on('subscribe', (channel: unknown, ack?: Ack) => {
    if (typeof channel !== 'string' || !channel) {
      return ack?.({ ok: false, error: 'channel must be a non-empty string' });
    }
    if (!isChannelAllowed(user.channels, channel)) {
      logger.debug({ userId: user.userId, channel }, 'subscribe denied');
      return ack?.({ ok: false, error: 'not authorized for this channel' });
    }
    void socket.join(channel);
    logger.debug({ userId: user.userId, channel }, 'subscribed');
    ack?.({ ok: true });
  });

  socket.on('unsubscribe', (channel: unknown, ack?: Ack) => {
    if (typeof channel !== 'string' || !channel) {
      return ack?.({ ok: false, error: 'channel must be a non-empty string' });
    }
    void socket.leave(channel);
    logger.debug({ userId: user.userId, channel }, 'unsubscribed');
    ack?.({ ok: true });
  });

  // Ephemeral client-to-channel relay (e.g. typing indicators). The sender
  // must already be subscribed to the channel, and the relayed event name must
  // be namespaced `client-*` so it can never spoof a server event. Delivered
  // to the OTHER members of the channel only (never echoed to the sender).
  socket.on('whisper', (payload: unknown, ack?: Ack) => {
    const { channel, event, data } = (payload ?? {}) as {
      channel?: unknown;
      event?: unknown;
      data?: unknown;
    };
    if (typeof channel !== 'string' || typeof event !== 'string') {
      return ack?.({ ok: false, error: 'channel and event are required' });
    }
    if (!event.startsWith('client-')) {
      return ack?.({ ok: false, error: 'whisper events must be prefixed "client-"' });
    }
    if (!socket.rooms.has(channel)) {
      return ack?.({ ok: false, error: 'not subscribed to this channel' });
    }
    socket.to(channel).emit(event, data);
    ack?.({ ok: true });
  });

  socket.on('disconnect', (reason) => {
    logger.debug({ userId: user.userId, sid: socket.id, reason }, 'socket disconnected');
  });
}
