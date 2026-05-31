import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { createAuthMiddleware } from '../src/socket/auth.middleware.js';
import type { ProjectConfig } from '../src/types/index.js';

const project: ProjectConfig = {
  name: 'cupet',
  jwtSecret: 'test-cupet-jwt',
  triggerSecret: 'test-cupet-trigger',
};

/** Build a minimal fake Socket carrying the given handshake auth/headers. */
function fakeSocket(auth: Record<string, unknown> = {}, headers: Record<string, string> = {}): Socket {
  return {
    id: 'sid-1',
    handshake: { auth, headers },
    data: {},
  } as unknown as Socket;
}

function run(socket: Socket): Promise<Error | undefined> {
  const mw = createAuthMiddleware(project);
  return new Promise((resolve) => mw(socket, (err) => resolve(err as Error | undefined)));
}

describe('auth middleware', () => {
  it('accepts a valid token and attaches the user', async () => {
    const socket = fakeSocket({
      token: jwt.sign({ project: 'cupet', userId: 'u1', channels: ['chat.*'] }, project.jwtSecret),
    });
    const err = await run(socket);
    expect(err).toBeUndefined();
    expect(socket.data.user).toEqual({
      project: 'cupet',
      userId: 'u1',
      channels: ['chat.*'],
      iat: expect.any(Number),
    });
  });

  it('accepts a token from the Authorization header', async () => {
    const token = jwt.sign({ project: 'cupet', userId: 'u2' }, project.jwtSecret);
    const socket = fakeSocket({}, { authorization: `Bearer ${token}` });
    const err = await run(socket);
    expect(err).toBeUndefined();
    expect(socket.data.user.userId).toBe('u2');
    expect(socket.data.user.channels).toEqual([]);
  });

  it('rejects a missing token', async () => {
    const err = await run(fakeSocket());
    expect(err?.message).toMatch(/missing/i);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const socket = fakeSocket({ token: jwt.sign({ project: 'cupet', userId: 'u1' }, 'wrong') });
    const err = await run(socket);
    expect(err?.message).toMatch(/invalid|expired/i);
  });

  it('rejects a token scoped to a different project', async () => {
    const socket = fakeSocket({
      token: jwt.sign({ project: 'accounting', userId: 'u1' }, project.jwtSecret),
    });
    const err = await run(socket);
    expect(err?.message).toMatch(/does not match/i);
  });

  it('rejects an expired token', async () => {
    const socket = fakeSocket({
      token: jwt.sign({ project: 'cupet', userId: 'u1' }, project.jwtSecret, { expiresIn: -10 }),
    });
    const err = await run(socket);
    expect(err?.message).toMatch(/invalid|expired/i);
  });
});
