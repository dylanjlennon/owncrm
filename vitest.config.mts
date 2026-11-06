import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: { include: ['tests/**/*.test.ts','rescue/test/**/*.test.mjs'], environment: 'node' },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), 'server-only': path.resolve(import.meta.dirname, 'tests/stub-server-only.ts') } },
});
