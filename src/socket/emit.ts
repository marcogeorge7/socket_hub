import type { Server } from 'socket.io';
import { getProject } from '../config/projects.js';
import { logger } from '../lib/logger.js';

let io: Server | undefined;

/** Register the Socket.IO server instance used by all publish paths. */
export function bindServer(server: Server): void {
  io = server;
}

export interface EmitResult {
  ok: boolean;
  error?: string;
}

/**
 * The single emit core shared by both publish paths (HTTP trigger API and the
 * Redis subscriber). Delivers `event`/`data` to every client subscribed to
 * `channel` within the project's namespace. With the Redis adapter attached,
 * the emit fans out across all server instances automatically.
 */
export function emitToChannel(
  project: string,
  channel: string,
  event: string,
  data: unknown,
): EmitResult {
  if (!io) return { ok: false, error: 'server not initialized' };
  if (!getProject(project)) return { ok: false, error: `unknown project "${project}"` };
  if (!channel || !event) return { ok: false, error: 'channel and event are required' };

  io.of(`/${project}`).to(channel).emit(event, data);
  logger.debug({ project, channel, event }, 'event emitted');
  return { ok: true };
}
