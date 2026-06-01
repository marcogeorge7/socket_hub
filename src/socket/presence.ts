import type { Namespace, Socket } from 'socket.io';
import { logger } from '../lib/logger.js';
import type { SocketUser } from '../types/index.js';

/** Server-side room that holds every live socket belonging to one account. */
export function presenceRoom(userId: string): string {
  return `presence.user.${userId}`;
}

/**
 * Enforce one device per account (newest login wins).
 *
 * On each new connection, evict any earlier socket for the same userId, then
 * add this socket to the user's presence room. The room is keyed off the
 * *authenticated* userId from `socket.data` — never a client-supplied value —
 * so a client can never evict another account.
 *
 * `fetchSockets()` is adapter-aware: it sweeps the whole cluster when the Redis
 * adapter is attached, and the local process otherwise. Any failure is logged
 * and swallowed so a presence hiccup can never reject a legitimate connection.
 *
 * Same-device reconnects (socket-token refresh, network reconnect, app resume)
 * carry the SAME `sid` (session id) as the prior socket; these are dropped
 * quietly — never with `session.revoked`, which would log the device out of
 * itself after the JWT cycles. Only a genuinely different session is evicted.
 *
 * Tie-break: we only evict peers whose JWT `iat` is no newer than this socket's,
 * so two near-simultaneous connects converge on the latest session rather than
 * ping-ponging. The backend revokes the old bearer on login, so in the real
 * flow an older peer can never out-live the newer one anyway.
 */
export async function enforceSingleSession(
  nsp: Namespace,
  socket: Socket,
): Promise<void> {
  const user = socket.data.user as SocketUser;
  const room = presenceRoom(user.userId);
  const newIat = user.iat ?? 0;

  try {
    const peers = await nsp.in(room).fetchSockets();
    for (const peer of peers) {
      if (peer.id === socket.id) continue;
      const peerUser = peer.data?.user as SocketUser | undefined;

      // Same login reconnecting (socket-token refresh, auto-reconnect, app
      // resume) — identified by a matching session id, it's the SAME device.
      // Drop the stale socket quietly; emitting session.revoked here would force
      // a spurious logout on the very device that just reconnected.
      if (user.sessionId && peerUser?.sessionId === user.sessionId) {
        peer.disconnect(true);
        continue;
      }

      const peerIat = peerUser?.iat ?? 0;
      if (peerIat > newIat) continue; // a strictly-newer session exists; leave it
      peer.emit('session.revoked', { reason: 'signed_in_elsewhere' });
      peer.disconnect(true);
      logger.info(
        { userId: user.userId, evicted: peer.id, by: socket.id },
        'evicted prior session (one device per account)',
      );
    }
  } catch (err) {
    logger.warn({ userId: user.userId, err }, 'presence sweep failed');
  }

  await socket.join(room);
}
