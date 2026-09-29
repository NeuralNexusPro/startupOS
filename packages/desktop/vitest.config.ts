import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.{test,spec}.ts',
      'scripts/**/*.{test,spec}.{js,mjs}',
    ],
    mockReset: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      // Mirror packages/web/vitest.config.ts so tests resolve the same
      // @originos/core package specifier the migrated production files use.
      '@originos/core': path.resolve(__dirname, '../core/src'),
    },
  },
});
