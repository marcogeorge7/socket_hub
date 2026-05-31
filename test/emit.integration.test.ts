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

function connect(channels: string[], userId = 'u1'): Promise<ClientSocket> {
  const token = jwt.sign({ project: 'cupet', userId, channels }, 'test-cupet-jwt');
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

describe('whisper relay', () => {
  it('relays a client- event to other members but not the sender', async () => {
    // Two distinct accounts in the same channel — one-device-per-account means
    // a single user can't hold two live sockets, so whisper is modelled here as
    // the two chat participants it actually serves.
    const a = await connect(['chat.*'], 'u1');
    const b = await connect(['chat.*'], 'u2');
    try {
      for (const c of [a, b]) {
        await new Promise<void>((resolve) =>
          c.emit('subscribe', 'chat.1', () => resolve()),
        );
      }

      let senderGot = false;
      a.on('client-typing', () => (senderGot = true));
      const received = new Promise<unknown>((resolve) => b.on('client-typing', resolve));

      a.emit('whisper', { channel: 'chat.1', event: 'client-typing', data: { typing: true } });

      await expect(received).resolves.toEqual({ typing: true });
      await new Promise((r) => setTimeout(r, 100));
      expect(senderGot).toBe(false);
    } finally {
      a.disconnect();
      b.disconnect();
    }
  });

  it('rejects a whisper to a channel the client did not subscribe to', async () => {
    const client = await connect(['chat.*']);
    try {
      const res = await new Promise<{ ok: boolean }>((resolve) => {
        client.emit('whisper', { channel: 'chat.5', event: 'client-typing', data: {} }, resolve);
      });
      expect(res.ok).toBe(false);
    } finally {
      client.disconnect();
    }
  });

  it('rejects a whisper whose event is not client- prefixed', async () => {
    const client = await connect(['chat.*']);
    try {
      await new Promise<void>((resolve) => client.emit('subscribe', 'chat.1', () => resolve()));
      const res = await new Promise<{ ok: boolean }>((resolve) => {
        client.emit('whisper', { channel: 'chat.1', event: 'message.sent', data: {} }, resolve);
      });
      expect(res.ok).toBe(false);
    } finally {
      client.disconnect();
    }
  });
});

describe('single session (one device per account)', () => {
  it('evicts and notifies the previous socket when the same user reconnects', async () => {
    const first = await connect(['chat.*'], 'solo');
    const revoked = new Promise<{ reason: string }>((resolve) =>
      first.on('session.revoked', resolve),
    );
    const disconnected = new Promise<void>((resolve) => first.on('disconnect', () => resolve()));

    const second = await connect(['chat.*'], 'solo');
    try {
      await expect(revoked).resolves.toMatchObject({ reason: 'signed_in_elsewhere' });
      await disconnected;
      expect(first.connected).toBe(false);
      expect(second.connected).toBe(true);
    } finally {
      first.disconnect();
      second.disconnect();
    }
  });

  it('leaves a different user\'s socket connected', async () => {
    const mine = await connect(['chat.*'], 'keep-a');
    const theirs = await connect(['chat.*'], 'keep-b');
    try {
      await new Promise((r) => setTimeout(r, 100));
      expect(mine.connected).toBe(true);
      expect(theirs.connected).toBe(true);
    } finally {
      mine.disconnect();
      theirs.disconnect();
    }
  });
});
