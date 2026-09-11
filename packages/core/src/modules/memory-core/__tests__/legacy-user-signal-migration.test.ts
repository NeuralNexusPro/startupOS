import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CognitionBank, migrateLegacyUserSignals } from '../bank';
import { Memory } from '../core/memory';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('legacy user signal migration', () => {
  it('imports human and Taste candidates once and preserves original files', () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-user-migration-'));
    roots.push(dataRoot);
    const ownerDirectory = path.join(dataRoot, 'agents', 'writer');
    const memory = new Memory(ownerDirectory);
    memory.setBlock('human', '用户喜欢简洁、直接的回答');
    fs.writeFileSync(path.join(ownerDirectory, 'Taste.md'), '表达风格：先给结论', 'utf8');
    const originalMemory = fs.readFileSync(path.join(ownerDirectory, 'Memory.md'), 'utf8');
    const originalTaste = fs.readFileSync(path.join(ownerDirectory, 'Taste.md'), 'utf8');
    const userBank = new CognitionBank({ scope: 'user', ownerId: 'default', dataRoot });
    const input = { ownerDirectory, ownerScope: 'agent' as const, ownerId: 'writer', userBank };

    const first = migrateLegacyUserSignals(input);
    const second = migrateLegacyUserSignals(input);

    expect(first.migrated).toBe(true);
    expect(second.migrated).toBe(false);
    expect(second.recordIds).toEqual(first.recordIds);
    expect(userBank.list()).toHaveLength(2);
    expect(userBank.list().every((record) => record.status === 'candidate')).toBe(true);
    expect(userBank.list().every((record) => record.evidence[0]?.source === 'legacy')).toBe(true);
    expect(fs.readFileSync(path.join(ownerDirectory, 'Memory.md'), 'utf8')).toBe(originalMemory);
    expect(fs.readFileSync(path.join(ownerDirectory, 'Taste.md'), 'utf8')).toBe(originalTaste);

    const marker = JSON.parse(fs.readFileSync(first.markerPath, 'utf8')) as {
      version: string;
      createdAt: string;
      updatedAt: string;
      data: { recordIds: string[] };
    };
    expect(marker.version).toBe('1.0');
    expect(marker.createdAt).toBeTruthy();
    expect(marker.updatedAt).toBeTruthy();
    expect(marker.data.recordIds).toEqual(first.recordIds);
  });
});
