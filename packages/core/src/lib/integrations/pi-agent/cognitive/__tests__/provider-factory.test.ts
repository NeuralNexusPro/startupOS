import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObservationPolicyResolver } from '../../../../../modules/memory-core';
import { createOwnedCognitiveProviders } from '../provider-factory';

let dataRoot: string;

beforeEach(() => {
  dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-provider-factory-'));
});

afterEach(() => {
  fs.rmSync(dataRoot, { recursive: true, force: true });
});

describe('createOwnedCognitiveProviders', () => {
  it('assembles one project-owned Knowledge/Pattern/Memory provider chain', async () => {
    const projectDirectory = path.join(dataRoot, 'projects', 'project-1');
    const context = new ObservationPolicyResolver().resolve({
      entryType: 'project',
      sessionId: 'session-1',
      projectId: 'project-1',
    });
    const bundle = createOwnedCognitiveProviders({
      ownerScope: 'project',
      ownerId: 'project-1',
      userId: 'default',
      dataRoot,
      workingDirectory: projectDirectory,
      ownerDirectory: projectDirectory,
      sessionId: 'session-1',
    }, context);
    bundle.memoryCore.ownerCognition?.retain({
      kind: 'experience',
      content: 'read_file succeeded',
      status: 'active',
      tags: ['tool-success'],
      evidence: { id: 'tool-1', source: 'tool', sourceId: 'session-1', excerpt: 'success', observedAt: '2026-09-09T00:00:00.000Z' },
    });

    await bundle.memoryProvider.on_session_end([]);

    expect(bundle.patternProvider.name).toBe('pattern');
    expect(bundle.knowledgeProvider.name).toBe('knowledge');
    expect(bundle.memoryCore.archival.getAll().some((entry) => entry.tags.includes('owner:project:project-1'))).toBe(true);
  });

  it('rejects mismatched observation and memory owners', () => {
    const projectDirectory = path.join(dataRoot, 'projects', 'project-1');
    const roleContext = new ObservationPolicyResolver().resolve({ entryType: 'role-agent', sessionId: 's1', agentId: 'role-1' });

    expect(() => createOwnedCognitiveProviders({
      ownerScope: 'project',
      ownerId: 'project-1',
      dataRoot,
      workingDirectory: projectDirectory,
    }, roleContext)).toThrow('does not match');
  });
});
