/**
 * Shared types for socket-hub.
 */

/** Per-project configuration derived from environment variables. */
export interface ProjectConfig {
  /** Project name, also the Socket.IO namespace (e.g. "cupet" -> "/cupet"). */
  name: string;
  /** Secret used to verify client connection JWTs for this project. */
  jwtSecret: string;
  /** Secret used to verify backend HMAC signatures on /api/trigger. */
  triggerSecret: string;
}

/**
 * Claims expected inside a client connection JWT.
 * Signed by the project's backend with <PROJECT>_JWT_SECRET.
 */
export interface JwtPayload {
  /** Project the token is scoped to. Must match the connected namespace. */
  project: string;
  /** Identifier of the authenticated user. */
  userId: string;
  /**
   * Channels this client is allowed to subscribe to. Supports a trailing
   * wildcard, e.g. "chat.*". If omitted or empty, the client may only
   * subscribe to public channels (those prefixed with "public.").
   */
  channels?: string[];
  /** Standard JWT claims (added by jsonwebtoken). */
  iat?: number;
  exp?: number;
}

/** Authenticated identity stored on socket.data after the auth middleware. */
export interface SocketUser {
  project: string;
  userId: string;
  channels: string[];
}

/** Payload accepted by the HTTP trigger API and the Redis publish path. */
export interface TriggerPayload {
  /** Target channel (room) within the project namespace. */
  channel: string;
  /** Event name clients listen for. */
  event: string;
  /** Arbitrary JSON payload delivered to clients. */
  data: unknown;
}

