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
});

