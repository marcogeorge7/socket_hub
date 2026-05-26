import type { Request, Response } from 'express';
import { z } from 'zod';
import { getProject } from '../config/projects.js';
import { verifySignature } from './trigger.auth.js';
import { emitToChannel } from '../socket/emit.js';
import { logger } from '../lib/logger.js';

const triggerSchema = z.object({
  channel: z.string().min(1),
  event: z.string().min(1),
  data: z.unknown(),
});

/** Header names used by the trigger API. */
const PROJECT_HEADER = 'x-socket-project';
const SIGNATURE_HEADER = 'x-socket-signature';

/**
 * POST /api/trigger — backend-to-server event publishing (path A).
 *
 * Headers:
 *   X-Socket-Project:   project name (must be configured)
 *   X-Socket-Signature: hex HMAC-SHA256 of the raw JSON body, signed with the
 *                       project's trigger secret.
 * Body: { channel, event, data }
 */
export function triggerController(req: Request, res: Response): void {
  const projectName = req.header(PROJECT_HEADER);
  if (!projectName) {
    res.status(400).json({ error: `missing ${PROJECT_HEADER} header` });
    return;
  }

  const project = getProject(projectName);
  if (!project) {
    res.status(404).json({ error: `unknown project "${projectName}"` });
    return;
  }

  const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';
  if (!verifySignature(project, rawBody, req.header(SIGNATURE_HEADER))) {
    logger.warn({ project: projectName }, 'trigger signature rejected');
    res.status(401).json({ error: 'invalid signature' });
    return;
  }

  const parsed = triggerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'invalid payload', details: parsed.error.flatten() });
    return;
  }

  const { channel, event, data } = parsed.data;
  const result = emitToChannel(project.name, channel, event, data);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.status(202).json({ ok: true });
}
