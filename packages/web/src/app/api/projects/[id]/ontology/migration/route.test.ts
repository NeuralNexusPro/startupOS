import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  previewLegacyOntology: vi.fn(),
  migrateAndBindSelectedLegacyOntology: vi.fn(),
}));

vi.mock('@originos/core/lib/features/project', () => ({
  ProjectOntologyEntryService: class {
    previewLegacyOntology = mocks.previewLegacyOntology;
    migrateAndBindSelectedLegacyOntology = mocks.migrateAndBindSelectedLegacyOntology;
  },
}));

import { POST } from './route';

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('project ontology migration route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a read-only migration preview before confirmation', async () => {
    mocks.previewLegacyOntology.mockResolvedValue({
      sourceKind: 'ontology',
      ontology: { concepts: [], properties: [], relations: [] },
      diagnostics: [],
    });
    const response = await POST(new NextRequest('http://localhost/api/projects/project-1/ontology/migration', {
      method: 'POST',
      body: JSON.stringify({ confirmed: false }),
    }), context('project-1'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { mode: 'dry-run', sourceKind: 'ontology' },
    });
    expect(mocks.migrateAndBindSelectedLegacyOntology).not.toHaveBeenCalled();
  });

  it('requires the preview source when the user confirms migration', async () => {
    const response = await POST(new NextRequest('http://localhost/api/projects/project-1/ontology/migration', {
      method: 'POST',
      body: JSON.stringify({ confirmed: true }),
    }), context('project-1'));

    expect(response.status).toBe(400);
    expect(mocks.migrateAndBindSelectedLegacyOntology).not.toHaveBeenCalled();
  });

  it('runs the selected migration only after explicit confirmation', async () => {
    mocks.migrateAndBindSelectedLegacyOntology.mockResolvedValue({ ontologyId: 'ontology-project-1' });
    const response = await POST(new NextRequest('http://localhost/api/projects/project-1/ontology/migration', {
      method: 'POST',
      body: JSON.stringify({ confirmed: true, sourceKind: 'ontology' }),
    }), context('project-1'));

    expect(response.status).toBe(200);
    expect(mocks.migrateAndBindSelectedLegacyOntology).toHaveBeenCalledWith('project-1', 'ontology');
  });
});
