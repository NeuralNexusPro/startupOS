import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, describe, expect, it } from 'vitest';
import { CognitionBank, MentalModelStore, type CognitionDataFile, type CognitionBankData } from '../bank';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cognition-perf-'));

afterAll(() => fs.rmSync(dataRoot, { recursive: true, force: true }));

describe('cognition performance', () => {
  it('recalls from 10K records with p95 below 200ms and reads snapshots synchronously', () => {
    const bank = new CognitionBank({ scope: 'agent', ownerId: 'perf-agent', dataRoot });
    const now = new Date().toISOString();
    const file: CognitionDataFile<CognitionBankData> = {
      version: '1.0',
      createdAt: now,
      updatedAt: now,
      data: {
        scope: 'agent',
        ownerId: 'perf-agent',
        records: Array.from({ length: 10_000 }, (_, index) => ({
          id: `record-${index}`,
          scope: 'agent' as const,
          ownerId: 'perf-agent',
          kind: 'world_fact' as const,
          content: index === 9_999 ? 'unique performance target' : `ordinary fact ${index}`,
          confidence: 0.8,
          status: 'active' as const,
          evidence: [{
            id: `evidence-${index}`,
            source: 'document' as const,
            sourceId: 'benchmark',
            excerpt: `fact ${index}`,
            observedAt: now,
          }],
          proofCount: 1,
          tags: [],
          createdAt: now,
          updatedAt: now,
        })),
      },
    };
    fs.mkdirSync(bank.directory, { recursive: true });
    fs.writeFileSync(bank.filePath, JSON.stringify(file), 'utf8');

    const samples = Array.from({ length: 20 }, () => {
      const startedAt = performance.now();
      const result = bank.recallKeyword('unique performance target', { limit: 3 });
      expect(result[0]?.record.id).toBe('record-9999');
      return performance.now() - startedAt;
    }).sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThan(200);

    const models = new MentalModelStore();
    models.refreshWorldModel(bank);
    expect(models.read(bank, 'world-model')?.data.recordIds.length).toBeGreaterThan(0);
  });
});
