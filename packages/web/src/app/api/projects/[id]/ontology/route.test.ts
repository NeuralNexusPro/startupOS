import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const entry = vi.hoisted(() => ({ resolveProject: vi.fn() }));
const store = vi.hoisted(() => ({ readOntology: vi.fn() }));
const authoring = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('@originos/core/lib/features/project', () => ({
  ProjectOntologyEntryService: class {
    resolveProject = entry.resolveProject;
  },
}));
vi.mock('@originos/core/lib/features/ontology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@originos/core/lib/features/ontology')>();
  return {
    ...actual,
    CanonicalOntologyStore: class { readOntology = store.readOntology; },
    CanonicalOntologyAuthoringService: class { execute = authoring.execute; },
  };
});

const { GET, POST } = await import('./route');

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('project canonical ontology route', () => {
  beforeEach(() => {
    entry.resolveProject.mockReset();
    store.readOntology.mockReset();
    authoring.execute.mockReset();
  });

  it('returns only the project-bound canonical snapshot', async () => {
    entry.resolveProject.mockResolvedValue({
      kind: 'canonical',
      ontology: { ontologyId: 'ontology-project-1', ontologyVersion: '1.0.0', name: '项目', domainCount: 1, conceptCount: 1 },
    });
    store.readOntology.mockResolvedValue({ data: { id: 'ontology-project-1', version: '1.0.0', projectId: 'project-1' } });

    const response = await GET(new NextRequest('http://localhost/api/projects/project-1/ontology'), context('project-1'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { entry: { kind: 'canonical' }, ontology: { id: 'ontology-project-1', version: '1.0.0' } },
    });
    expect(store.readOntology).toHaveBeenCalledWith('project-1');
  });

  it('returns legacy migration state without reading or writing legacy content', async () => {
    entry.resolveProject.mockResolvedValue({ kind: 'legacy_migration_required', migrationAvailable: true });

    const response = await GET(new NextRequest('http://localhost/api/projects/legacy/ontology'), context('legacy'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { entry: { kind: 'legacy_migration_required', migrationAvailable: true } },
    });
    expect(store.readOntology).not.toHaveBeenCalled();
  });

  it('rejects unsafe ids without disclosing an internal path', async () => {
    const response = await GET(new NextRequest('http://localhost/api/projects/unsafe/ontology'), context('../unsafe'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_PROJECT_ID' } });
    expect(entry.resolveProject).not.toHaveBeenCalled();
  });

  it('executes a canonical authoring command for the route project', async () => {
    authoring.execute.mockResolvedValue({
      ok: false,
      issues: [{ code: 'REVISION_CONFLICT', message: 'stale', severity: 'error' }],
    });
    const request = new NextRequest('http://localhost/api/projects/project-1/ontology', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project-1', ontologyId: 'ontology-project-1', ontologyVersion: '1.0.0',
        expectedRevision: 1, operationId: 'operation-1', permissions: ['ontology:author'],
        type: 'domain.create',
        value: {
          id: 'domain-2', name: '交付', description: '',
          createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z',
        },
      }),
    });

    const result = await POST(request, context('project-1'));

    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      success: true,
      data: { ok: false, issues: [{ code: 'REVISION_CONFLICT' }] },
    });
    expect(authoring.execute).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      value: expect.objectContaining({ createdAt: expect.any(Date) }),
    }));
  });

  it('rejects malformed and cross-project authoring envelopes before Core', async () => {
    const malformed = await POST(new NextRequest('http://localhost/api/projects/project-1/ontology', {
      method: 'POST', body: JSON.stringify({ type: 'instance.create' }),
    }), context('project-1'));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: 'INVALID_AUTHORING_COMMAND', details: expect.any(Array) },
    });

    const mismatch = await POST(new NextRequest('http://localhost/api/projects/project-1/ontology', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-2', ontologyId: 'ontology-project-2', ontologyVersion: '1.0.0',
        expectedRevision: 0, operationId: 'operation-2', permissions: ['ontology:author'],
        type: 'domain.delete', domainId: 'domain-1',
      }),
    }), context('project-1'));
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({ error: { code: 'PROJECT_ID_MISMATCH' } });
    expect(authoring.execute).not.toHaveBeenCalled();
  });
});
