import express, { type Express, type Request } from 'express';
import { pinoHttp } from 'pino-http';
import { triggerController } from '../publish/trigger.controller.js';
import { projectNames } from '../config/projects.js';
import { logger } from '../lib/logger.js';

/**
 * Build the Express app exposing the health check and the HTTP trigger API.
 * The JSON body parser also captures the raw bytes so the trigger controller
 * can verify HMAC signatures over exactly what the backend sent.
 */
export function createApp(): Express {
  const app = express();

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  app.use(
    express.json({
      limit: '256kb',
      verify: (req: Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', projects: projectNames, uptime: process.uptime() });
  });

  app.post('/api/trigger', triggerController);

  return app;
}
