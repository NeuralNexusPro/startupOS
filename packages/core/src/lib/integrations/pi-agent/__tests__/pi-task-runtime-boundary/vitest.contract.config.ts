import path from 'node:path';

import { defineConfig } from 'vitest/config';

const coreRoot = path.resolve(__dirname, '../../../../../..');

export default defineConfig({
  resolve: {
    alias: {
      '@originos/pi-agent-adapter/task-runtime': path.resolve(
        coreRoot,
        '../agent/task-runtime.js',
      ),
      '@originos/pi-agent-adapter': path.resolve(
        __dirname,
        'adapter-root-stub.ts',
      ),
      '@originos/pi-tasks': path.resolve(coreRoot, '../pi-tasks/index.js'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: [path.resolve(__dirname, '*.contract.test.ts')],
    setupFiles: [path.resolve(__dirname, '../setup.ts')],
    testTimeout: 30_000,
  },
});
