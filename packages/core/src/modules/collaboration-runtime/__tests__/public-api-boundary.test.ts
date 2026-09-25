import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('collaboration runtime public API boundary', () => {
  it('does not export solution design parsers, DAG construction, or manifest selection', async () => {
    const [runtimeIndex, facadeIndex, packageSource] = await Promise.all([
      readFile(path.join(coreRoot, 'src/modules/collaboration-runtime/index.ts'), 'utf8'),
      readFile(path.join(coreRoot, 'src/modules/collaboration-runtime/facade/index.ts'), 'utf8'),
      readFile(path.join(coreRoot, 'package.json'), 'utf8'),
    ]);
    const packageJson = JSON.parse(packageSource) as { exports?: Record<string, unknown> };

    expect(runtimeIndex).not.toMatch(/export\s+\{[^}]*parseTopology/);
    expect(runtimeIndex).not.toMatch(/export\s+\{[^}]*DagExecutor/);
    expect(facadeIndex).not.toMatch(/export\s+\{[^}]*loadProjectTopology/);
    expect(packageJson.exports).not.toHaveProperty('./modules/collaboration-runtime/engine/*');
  });
});
