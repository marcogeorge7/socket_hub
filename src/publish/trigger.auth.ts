import crypto from 'node:crypto';
import type { ProjectConfig } from '../types/index.js';

/**
 * Compute the expected HMAC-SHA256 signature (hex) of a raw request body for a
 * project. Backends sign the exact bytes they send with the project's
 * trigger secret; we recompute and compare.
 */
export function signBody(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Timing-safe verification of a request signature against a project secret.
 */
export function verifySignature(
  project: ProjectConfig,
  rawBody: string,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected = signBody(project.triggerSecret, rawBody);

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
