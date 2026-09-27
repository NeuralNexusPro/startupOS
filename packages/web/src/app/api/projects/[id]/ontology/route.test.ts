import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const entry = vi.hoisted(() => ({ resolveProject: vi.fn() }));
const store = vi.hoisted(() => ({ readOntology: vi.fn() }));

vi.mock('@originos/core/lib/features/project', () => ({
  ProjectOntologyEntryService: class {
    resolveProject = entry.resolveProject;
  },
}));
vi.mock('@originos/core/lib/features/ontology', () => ({
  CanonicalOntologyStore: class {
    readOntology = store.readOntology;
  },
}));

const { GET } = await import('./route');

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('project canonical ontology route', () => {
  beforeEach(() => {
    entry.resolveProject.mockReset();
    store.readOntology.mockReset();
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
});
