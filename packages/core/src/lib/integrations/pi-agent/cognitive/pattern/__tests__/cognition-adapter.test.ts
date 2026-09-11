import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArchivalMemory } from '../../../../../../modules/memory-core/archival/archival-memory';
import { PatternProvider } from '../index';
import type { PatternEvidenceCandidate } from '../../../../../../modules/memory-core/bank';

let directory: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pattern-cognition-adapter-'));
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

function candidate(proofCount: number): PatternEvidenceCandidate {
  return {
    stableKey: 'stable-pattern-key',
    ownerScope: 'project',
    ownerId: 'project-1',
    recordId: 'record-1',
    content: 'read_file succeeded for requirements analysis',
    polarity: 'positive',
    evidenceRefs: Array.from({ length: proofCount }, (_, index) => ({
      id: `evidence-${index}`,
      source: 'tool' as const,
      sourceId: 'session-1',
      excerpt: 'success',
      observedAt: '2026-09-09T00:00:00.000Z',
    })),
    proofCount,
    applicability: 'project-local',
    sourceSkillId: 'analyzer',
  };
}

describe('PatternProvider cognition adapter', () => {
  it('upserts repeated evidence by stable key without duplicate archival entries', async () => {
    const archival = new ArchivalMemory(directory);
    const provider = new PatternProvider(directory, archival);

    await provider.ingestPatternEvidence([candidate(1)]);
    await provider.ingestPatternEvidence([candidate(1)]);
    await provider.ingestPatternEvidence([candidate(2)]);

    expect(archival.getAll().filter((entry) => entry.tags.includes('pattern'))).toHaveLength(1);
    expect(archival.getAll()[0]?.text).toContain('证据数: 2');
    expect(archival.getAll()[0]?.tags).toContain('owner:project:project-1');
    const index = JSON.parse(fs.readFileSync(path.join(directory, 'patterns', 'evidence-index.json'), 'utf8'));
    expect(index).toMatchObject({ version: '1.0', data: { 'stable-pattern-key': { proofCount: 2 } } });
  });
});
