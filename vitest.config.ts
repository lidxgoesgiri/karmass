import { defineConfig } from 'vitest/config';

// API route tests run against an in-memory Redis/Reddit fake (no Devvit plugin needed).
export default defineConfig({
  test: { include: ['src/**/*.spec.ts'], environment: 'node' },
});
