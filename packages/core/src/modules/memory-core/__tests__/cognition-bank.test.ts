import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CognitionBank, resolveCognitionBankDirectory } from '../bank';

const temporaryDirectories: string[] = [];

function createDataRoot(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-cognition-bank-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('CognitionBank', () => {
  it('isolates global user cognition from agent cognition', () => {
    const dataRoot = createDataRoot();
    const agentDirectory = path.join(dataRoot, 'agents', 'researcher');
    const userBank = new CognitionBank({ scope: 'user', ownerId: 'default', dataRoot });
    const agentBank = new CognitionBank({
      scope: 'agent',
      ownerId: 'researcher',
      dataRoot,
      ownerDirectory: agentDirectory,
    });

    userBank.retain({
      kind: 'observation',
      content: '用户偏好简洁的中文回答',
      evidence: {
        id: 'turn-1',
        source: 'conversation',
        sourceId: 'session-1',
        excerpt: '请用简洁的中文回答',
        observedAt: new Date().toISOString(),
      },
    });

    expect(userBank.list()).toHaveLength(1);
    expect(agentBank.list()).toHaveLength(0);
    expect(fs.existsSync(path.join(agentDirectory, 'cognition', 'records.json'))).toBe(false);
    expect(userBank.filePath).toBe(path.join(dataRoot, 'users', 'default', 'cognition', 'records.json'));
  });

  it('deduplicates facts while retaining distinct evidence', () => {
    const dataRoot = createDataRoot();
    const bank = new CognitionBank({ scope: 'agent', ownerId: 'researcher', dataRoot });
    const base = {
      kind: 'world_fact' as const,
      content: 'OriginOS uses Next.js App Router',
    };
    bank.retain({
      ...base,
      evidence: { id: 'doc-1', source: 'document', sourceId: 'AGENTS.md', excerpt: 'Next.js App Router', observedAt: '2026-08-28T00:00:00.000Z' },
    });
    const retained = bank.retain({
      ...base,
      evidence: { id: 'doc-2', source: 'document', sourceId: 'README.md', excerpt: 'Next.js App Router', observedAt: '2026-08-28T01:00:00.000Z' },
    });

    expect(bank.list()).toHaveLength(1);
    expect(retained.proofCount).toBe(2);
    expect(retained.evidence.map((evidence) => evidence.id)).toEqual(['doc-1', 'doc-2']);
  });

  it('rejects owner path traversal and owner directories outside data root', () => {
    const dataRoot = createDataRoot();
    expect(() => resolveCognitionBankDirectory({ scope: 'user', ownerId: '../../outside', dataRoot })).toThrow('Invalid cognition owner id');
    expect(() => resolveCognitionBankDirectory({ scope: 'agent', ownerId: 'safe', dataRoot, ownerDirectory: path.dirname(dataRoot) })).toThrow('inside data root');
  });

  it('writes the mandatory DataFile envelope', () => {
    const dataRoot = createDataRoot();
    const bank = new CognitionBank({ scope: 'project', ownerId: 'project-1', dataRoot });
    bank.retain({
      kind: 'experience',
      content: 'The lint command passed',
      evidence: { id: 'tool-1', source: 'tool', sourceId: 'pnpm-lint', excerpt: 'exit 0', observedAt: '2026-08-28T00:00:00.000Z' },
    });
    const file = JSON.parse(fs.readFileSync(bank.filePath, 'utf8')) as Record<string, unknown>;
    expect(file).toEqual(expect.objectContaining({ version: '1.0', createdAt: expect.any(String), updatedAt: expect.any(String), data: expect.any(Object) }));
  });

  it('recalls records with keyword and semantic-compatible search', async () => {
    const dataRoot = createDataRoot();
    const bank = new CognitionBank({ scope: 'agent', ownerId: 'researcher', dataRoot });
    bank.retain({
      kind: 'world_fact',
      content: 'OriginOS uses the Next.js App Router',
      evidence: { id: 'doc-next', source: 'document', sourceId: 'AGENTS.md', excerpt: 'App Router is mandatory', observedAt: '2026-08-28T00:00:00.000Z' },
    });
    bank.retain({
      kind: 'experience',
      content: 'The release pipeline builds desktop packages',
      evidence: { id: 'tool-release', source: 'tool', sourceId: 'actions', excerpt: 'desktop release', observedAt: '2026-08-28T00:00:01.000Z' },
    });

    expect(bank.recallKeyword('Next.js', { kinds: ['world_fact'] })[0]?.record.content).toContain('App Router');
    const semantic = await bank.recall('release pipeline', { limit: 1 });
    expect(semantic[0]?.record.kind).toBe('experience');
  });

  it('redacts secrets from retained content and evidence', () => {
    const dataRoot = createDataRoot();
    const bank = new CognitionBank({ scope: 'user', ownerId: 'default', dataRoot });
    const retained = bank.retain({
      kind: 'observation',
      content: 'api_key=super-secret-value password: hunter2',
      evidence: {
        id: 'secret-turn',
        source: 'conversation',
        sourceId: 'session-secret',
        excerpt: 'Authorization: Bearer abcdefghijklmnop',
        observedAt: '2026-09-09T00:00:00.000Z',
      },
    });

    expect(retained.content).toBe('api_key=[REDACTED] password: [REDACTED]');
    expect(retained.evidence[0]?.excerpt).toContain('Bearer [REDACTED]');
    expect(fs.readFileSync(bank.filePath, 'utf8')).not.toContain('super-secret-value');
    expect(fs.readFileSync(bank.filePath, 'utf8')).not.toContain('abcdefghijklmnop');
  });

  it('quarantines a corrupt bank and restores the latest valid version', () => {
    const dataRoot = createDataRoot();
    const bank = new CognitionBank({ scope: 'project', ownerId: 'project-recovery', dataRoot });
    bank.retain({
      kind: 'world_fact',
      content: 'The project uses local JSON storage',
      evidence: { id: 'doc-storage', source: 'document', sourceId: 'AGENTS.md', excerpt: 'local JSON', observedAt: '2026-08-28T00:00:00.000Z' },
    });
    fs.writeFileSync(bank.filePath, '{broken', 'utf8');

    expect(bank.list()).toHaveLength(1);
    expect(fs.readdirSync(bank.directory).some((name) => name.startsWith('records.corrupt-'))).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(bank.filePath, 'utf8'))).not.toThrow();
  });
});
