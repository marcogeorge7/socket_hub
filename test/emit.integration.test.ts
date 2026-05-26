import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { bindServer, emitToChannel } from '../src/socket/emit.js';
import { registerNamespaces } from '../src/socket/namespaces.js';

/**
 * End-to-end delivery test WITHOUT Redis: a real Socket.IO server with the
 * project namespaces, a real socket.io-client connecting with a JWT, and the
 * shared emitToChannel core delivering to the subscribed room.
 */
let httpServer: HttpServer;
let io: Server;
let port: number;

beforeAll(async () => {
  httpServer = createServer();
  io = new Server(httpServer);
  bindServer(io);
  registerNamespaces(io);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  port = (httpServer.address() as { port: number }).port;
});

afterAll(async () => {
  await io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connect(channels: string[]): Promise<ClientSocket> {
  const token = jwt.sign({ project: 'cupet', userId: 'u1', channels }, 'test-cupet-jwt');
  const client = ioClient(`http://localhost:${port}/cupet`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
  return new Promise((resolve, reject) => {
    client.on('connect', () => resolve(client));
    client.on('connect_error', reject);
  });
}

describe('emitToChannel delivery', () => {
  it('delivers an event to a subscribed client', async () => {
    const client = await connect(['chat.*']);
    try {
      await new Promise<void>((resolve, reject) => {
        client.emit('subscribe', 'chat.1', (res: { ok: boolean }) => {
          res.ok ? resolve() : reject(new Error('subscribe failed'));
        });
      });

      const received = new Promise<unknown>((resolve) => client.on('message', resolve));
      const result = emitToChannel('cupet', 'chat.1', 'message', { hello: 'world' });
      expect(result.ok).toBe(true);

      await expect(received).resolves.toEqual({ hello: 'world' });
    } finally {
      client.disconnect();
    }
  });

  it('does not deliver to clients that did not subscribe', async () => {
    const client = await connect(['chat.*']);
    try {
      let got = false;
      client.on('message', () => (got = true));
      emitToChannel('cupet', 'chat.99', 'message', { x: 1 });
      await new Promise((r) => setTimeout(r, 150));
      expect(got).toBe(false);
    } finally {
      client.disconnect();
    }
  });

  it('rejects a subscribe to an unauthorized channel', async () => {
    const client = await connect(['orders.*']);
    try {
      const res = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        client.emit('subscribe', 'chat.1', resolve);
      });
      expect(res.ok).toBe(false);
    } finally {
      client.disconnect();
    }
  });

  it('returns an error for an unknown project', () => {
    expect(emitToChannel('nope', 'chat.1', 'message', {}).ok).toBe(false);
  });
});
