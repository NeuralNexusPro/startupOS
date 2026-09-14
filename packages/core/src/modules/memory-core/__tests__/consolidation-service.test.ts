import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { consolidateOwnedMemory } from '../consolidation-service';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('consolidateOwnedMemory boundary service', () => {
  it('keeps standalone skills ephemeral', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-consolidate-skill-'));
    roots.push(dataRoot);
    const result = await consolidateOwnedMemory({ dataRoot, entryType: 'skill', entryId: 'demo' });
    expect(result.consolidated).toBe(false);
    expect(result.reason).toContain('do not own persistent cognition');
    expect(fs.existsSync(path.join(dataRoot, 'skills', 'demo', 'cognition'))).toBe(false);
  });

  it('rejects path traversal before touching storage', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-consolidate-safe-'));
    roots.push(dataRoot);
    await expect(consolidateOwnedMemory({
      dataRoot,
      entryType: 'agent',
      entryId: '../../outside',
    })).rejects.toThrow('Invalid memory owner id');
  });
});
