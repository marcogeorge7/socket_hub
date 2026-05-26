import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Env required by config/env.ts and config/projects.ts at import time.
    env: {
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379',
      PROJECTS: 'cupet,accounting',
      CUPET_JWT_SECRET: 'test-cupet-jwt',
      CUPET_TRIGGER_SECRET: 'test-cupet-trigger',
      ACCOUNTING_JWT_SECRET: 'test-accounting-jwt',
      ACCOUNTING_TRIGGER_SECRET: 'test-accounting-trigger',
      LOG_LEVEL: 'fatal',
    },
  },
});
