# socket-hub

A single, shared realtime **Socket.IO** server (Node.js + TypeScript) used by all
your projects — **cupet**, **accounting**, **deacons**, and any future app —
instead of standing up a separate WebSocket layer per project.

- **One namespace per project** (`/cupet`, `/accounting`, …) for clean isolation.
- **JWT auth** on connect (per-project secret) with channel-level authorization.
- **Two ways to publish** events from your backends:
  1. **HTTP trigger API** (`POST /api/trigger`) — simple, Pusher-like, HMAC-signed.
  2. **Redis publish** — backend publishes to `socket:<project>:<channel>`; decoupled.
- **Redis adapter from day 1** — runs as one process now, scales horizontally later
  with zero code change. Redis location is purely `REDIS_URL`.

---

## Quick start

```bash
cp .env.example .env        # edit secrets
npm install

# Option A — local dev (needs a Redis on localhost:6379)
npm run dev

# Option B — everything in Docker (socket-hub + Redis on the same server)
docker compose up --build
```

`GET http://localhost:3001/health` → `{ "status": "ok", "projects": [...] }`.

> **No Redis?** Leave `REDIS_URL` unset and the server runs in **single-process
> (in-memory) mode** — perfect for Hostinger Node hosting. You keep namespaces,
> JWT auth, channels, and the HTTP trigger API. You only lose horizontal scaling
> and the Redis publish bridge (path B), neither of which you need on one node.

---

## Deploying on Hostinger (Node app / Passenger, no Redis)

Hostinger's hPanel **Node.js app** runs behind Phusion Passenger, which has **no
Redis** and assigns the port itself. `socket-hub` supports this out of the box:

1. **Build locally** (Passenger runs plain `node`, not TypeScript):
   ```bash
   npm install && npm run build
   ```
2. **Upload** the project to your domain's app folder (include `dist/`,
   `package.json`, `package-lock.json`; Hostinger runs `npm install` for runtime deps).
3. **In hPanel → Node.js:**
   - **Application startup file:** `dist/index.js`
   - **Application mode:** `production`
   - **Environment variables:** set `PROJECTS` and the per-project
     `*_JWT_SECRET` / `*_TRIGGER_SECRET`, plus `CORS_ORIGINS` (your app domains).
     **Do NOT set `REDIS_URL`** → in-memory mode.
4. **Restart** the app from hPanel. Hit `https://your-subdomain/health` to confirm.

Publishing from your Laravel apps uses the **HTTP trigger API (path A)** — a
plain outbound HTTPS call, which works from any host (see below). Path B (Redis
publish) is unavailable without Redis, and that's fine for a single node.

> **WebSockets under Passenger:** persistent `wss://` upgrades usually work; if a
> proxy blocks the upgrade, Socket.IO automatically falls back to HTTP
> long-polling (both transports are enabled), so clients still connect.
>
> **When you outgrow one node:** move `socket-hub` to a Hostinger **VPS**, run the
> included `docker compose up` (socket-hub + Redis), and set `REDIS_URL`. No code
> change — the adapter and publish bridge light up automatically.

---

## Configuration

All config is environment variables (see `.env.example`):

| Variable                  | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `PORT`                    | HTTP/WS port (default `3001`).                                 |
| `REDIS_URL`               | **Optional.** Unset → in-memory single-process mode. Set → adapter + publish bridge. |
| `CORS_ORIGINS`            | Comma-separated allowed origins, or `*` for dev.               |
| `PROJECTS`                | Comma-separated project names → namespaces.                    |
| `<NAME>_JWT_SECRET`       | Verifies client connection JWTs for that project.              |
| `<NAME>_TRIGGER_SECRET`   | Verifies backend HMAC signatures on `/api/trigger`.            |

**Adding a new project** = add it to `PROJECTS` and define its two secrets.
A namespace is registered automatically on boot — no code change.

---

## Client connection (Flutter / JS)

Connect to the project namespace with a JWT your backend issued. The JWT must
contain `{ project, userId, channels[] }`.

```js
import { io } from 'socket.io-client';

const socket = io('https://realtime.example.com/cupet', {
  auth: { token: '<JWT signed with CUPET_JWT_SECRET>' },
  transports: ['websocket'],
});

socket.emit('subscribe', 'chat.42', (res) => console.log(res)); // { ok: true }
socket.on('message', (data) => console.log('new message', data));
```

> Flutter apps currently using `pusher_channels_flutter` move to the
> [`socket_io_client`](https://pub.dev/packages/socket_io_client) package.

**Channel rules:** channels prefixed `public.` are open to any authenticated
client. Other channels require a matching entry in the JWT's `channels` claim;
a trailing `*` is a wildcard (`chat.*` → `chat.42`).

---

## Backend integration (Laravel)

### 1. Issue a connection JWT for the client

```php
use Firebase\JWT\JWT; // firebase/php-jwt

$token = JWT::encode([
    'project'  => 'cupet',
    'userId'   => (string) $user->id,
    'channels' => ["chat.{$user->id}", 'public.*'],
    'exp'      => now()->addHours(6)->timestamp,
], config('services.socket.cupet_jwt_secret'), 'HS256');
```

### 2A. Publish via the HTTP trigger API (recommended)

Sign the **raw JSON body** with the project's trigger secret (HMAC-SHA256, hex):

```php
use Illuminate\Support\Facades\Http;

$body = json_encode([
    'channel' => "chat.{$userId}",
    'event'   => 'message',
    'data'    => ['from' => 'system', 'text' => 'Hello'],
]);

$signature = hash_hmac('sha256', $body, config('services.socket.cupet_trigger_secret'));

Http::withBody($body, 'application/json')
    ->withHeaders([
        'X-Socket-Project'   => 'cupet',
        'X-Socket-Signature' => $signature,
    ])
    ->post('https://realtime.example.com/api/trigger');
// → 202 Accepted
```

### 2B. Publish via Redis (decoupled / high throughput)

Publish a JSON `{ event, data }` to `socket:<project>:<channel>`:

```php
Redis::publish("socket:cupet:chat.{$userId}", json_encode([
    'event' => 'message',
    'data'  => ['from' => 'system', 'text' => 'Hello'],
]));
```

Use **2A** for simplicity, **2B** when you want backends fully decoupled from
the socket server's HTTP endpoint.

---

## Scripts

| Command          | Description                                  |
| ---------------- | -------------------------------------------- |
| `npm run dev`    | Watch-mode dev server (`tsx`).               |
| `npm run build`  | Compile TypeScript to `dist/`.               |
| `npm start`      | Run the compiled server.                     |
| `npm test`       | Run the vitest suite.                        |
| `npm run lint`   | ESLint.                                      |

---

## Architecture

```
Laravel (cupet / accounting / deacons)
   │  publish event
   ├──(A) HTTP POST /api/trigger  ──┐
   └──(B) Redis PUBLISH socket:*  ──┤
                                    ▼
                          ┌──────────────────┐
   client (JWT) ── WS ──► │  socket-hub      │  ── Redis adapter (scale-out)
   /cupet /accounting     │  Socket.IO + TS  │  ── Redis subscriber (path B)
                          └──────────────────┘
```

Both publish paths funnel through one `emitToChannel(project, channel, event, data)`
core in `src/socket/emit.ts`. The Redis **adapter** (inter-instance broadcast)
and the Redis **publish bridge** (path B) use separate channel prefixes and do
not interfere.

### Scaling Redis later

Code never hardcodes Redis location. To move from same-server to a dedicated /
managed Redis: change `REDIS_URL`, restart. To add socket-hub instances: run
more copies behind a load balancer with sticky sessions — the adapter keeps
broadcasts consistent across them.
