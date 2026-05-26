import jwt from 'jsonwebtoken';
import type { Socket, ExtendedError } from 'socket.io';
import type { JwtPayload, ProjectConfig } from '../types/index.js';
import { logger } from '../lib/logger.js';

/**
 * Build a Socket.IO namespace middleware that authenticates connections for a
 * single project. The client must send a JWT in `handshake.auth.token`
 * (or an `Authorization: Bearer` header), signed with the project's secret.
 *
 * On success the verified identity is attached to `socket.data.user`.
 * On failure the connection is rejected before any events are processed.
 */
export function createAuthMiddleware(project: ProjectConfig) {
  return (socket: Socket, next: (err?: ExtendedError) => void): void => {
    const token = extractToken(socket);
    if (!token) {
      return next(unauthorized('Missing authentication token'));
    }

    try {
      const payload = jwt.verify(token, project.jwtSecret) as JwtPayload;

      // The token must be scoped to the namespace it is connecting to.
      if (payload.project !== project.name) {
        return next(unauthorized('Token project does not match namespace'));
      }
      if (!payload.userId) {
        return next(unauthorized('Token missing userId'));
      }

      socket.data.user = {
        project: project.name,
        userId: payload.userId,
        channels: payload.channels ?? [],
      };

      logger.debug(
        { project: project.name, userId: payload.userId, sid: socket.id },
        'socket authenticated',
      );
      return next();
    } catch (err) {
      logger.debug({ project: project.name, err }, 'socket auth failed');
      return next(unauthorized('Invalid or expired token'));
    }
  };
}

function extractToken(socket: Socket): string | undefined {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return undefined;
}

function unauthorized(message: string): ExtendedError {
  const err = new Error(message) as ExtendedError;
  err.data = { code: 'UNAUTHORIZED' };
  return err;
}
