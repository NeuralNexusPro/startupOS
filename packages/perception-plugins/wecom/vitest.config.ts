import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@originos/core': path.resolve(__dirname, '../../core/src'),
      '@wecom/aibot-node-sdk': path.resolve(
        __dirname,
        'node_modules/@wecom/aibot-node-sdk/dist/index.esm.js',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    mockReset: true,
    restoreMocks: true,
  },
});
