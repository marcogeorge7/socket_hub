import type { Server } from 'socket.io';
import { projects } from '../config/projects.js';
import { createAuthMiddleware } from './auth.middleware.js';
import { registerHandlers } from './handlers.js';
import { enforceSingleSession } from './presence.js';
import { logger } from '../lib/logger.js';

/**
 * Register one Socket.IO namespace per configured project (e.g. "/cupet").
 * Each namespace gets its own JWT auth middleware and connection handlers.
 * Adding a new project is purely a config change — no code edit required.
 */
export function registerNamespaces(io: Server): void {
  for (const project of projects.values()) {
    const nsp = io.of(`/${project.name}`);
    nsp.use(createAuthMiddleware(project));
    nsp.on('connection', (socket) => {
      logger.info(
        { project: project.name, userId: socket.data.user.userId, sid: socket.id },
        'client connected',
      );
      registerHandlers(socket);
      // One device per account: evict any prior socket for this user and add
      // this one to the user's presence room. Runs concurrently with handlers
      // already live above (it only acts on OTHER sockets), so a client's first
      // `subscribe` can't race an unattached handler. Best-effort: the helper
      // swallows its own errors so it can never reject the connection.
      void enforceSingleSession(nsp, socket);
    });
    logger.info({ namespace: `/${project.name}` }, 'namespace registered');
  }
}
