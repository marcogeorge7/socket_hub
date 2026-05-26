import { describe, it, expect } from 'vitest';
import { signBody, verifySignature } from '../src/publish/trigger.auth.js';
import type { ProjectConfig } from '../src/types/index.js';

const project: ProjectConfig = {
  name: 'cupet',
  jwtSecret: 'jwt',
  triggerSecret: 'super-secret',
};

describe('trigger signature', () => {
  const body = JSON.stringify({ channel: 'chat.1', event: 'message', data: { x: 1 } });

  it('verifies a correctly signed body', () => {
    const sig = signBody(project.triggerSecret, body);
    expect(verifySignature(project, body, sig)).toBe(true);
  });

  it('rejects a wrong signature', () => {
    expect(verifySignature(project, body, 'deadbeef')).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifySignature(project, body, undefined)).toBe(false);
  });

  it('rejects a body tampered after signing', () => {
    const sig = signBody(project.triggerSecret, body);
    const tampered = body.replace('chat.1', 'chat.999');
    expect(verifySignature(project, tampered, sig)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const sig = signBody('other-secret', body);
    expect(verifySignature(project, body, sig)).toBe(false);
  });
});
