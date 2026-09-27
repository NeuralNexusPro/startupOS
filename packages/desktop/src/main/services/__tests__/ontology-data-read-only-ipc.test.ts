import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../../ipc-protocol';

const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
  },
}));

import { OntologyDataService } from '../ontology-data-service';

const executeAuthoring = vi.fn();

function handler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const registered = handlers.get(channel);
  if (!registered) {
    throw new Error(`No handler for ${channel}`);
  }
  return registered;
}

describe('OntologyDataService canonical write boundary', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    executeAuthoring.mockReset();
    new OntologyDataService({ execute: executeAuthoring });
  });

  it.each([
    IPC_CHANNELS.ONTOLOGY_DATA_DOMAIN_CREATE,
    IPC_CHANNELS.ONTOLOGY_DATA_CONCEPT_CREATE,
    IPC_CHANNELS.ONTOLOGY_DATA_INSTANCE_UPDATE,
    IPC_CHANNELS.ONTOLOGY_DATA_RELATION_CONCEPT_CREATE,
    IPC_CHANNELS.ONTOLOGY_DATA_SYNC,
  ])('returns an explicit unavailable state for legacy write channel %s', async (channel) => {
    const response = await handler(channel)(undefined, { ontologyId: 'ontology-project-1' });

    expect(response).toMatchObject({ success: false, error: { code: 'CANONICAL_EDIT_UNAVAILABLE' } });
  });

  it('executes a validated canonical command and restores transport dates', async () => {
    executeAuthoring.mockResolvedValue({
      ok: false,
      issues: [{ code: 'REVISION_CONFLICT', message: 'stale', severity: 'error' }],
    });
    const response = await handler(IPC_CHANNELS.ONTOLOGY_CANONICAL_AUTHORING_EXECUTE)(undefined, {
      projectId: 'project-1', ontologyId: 'ontology-project-1', ontologyVersion: '1.0.0',
      expectedRevision: 2, operationId: 'operation-1', permissions: ['ontology:author'],
      type: 'domain.create',
      value: {
        id: 'domain-2', name: '交付', description: '',
        createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z',
      },
    });

    expect(executeAuthoring).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      value: expect.objectContaining({ createdAt: expect.any(Date), updatedAt: expect.any(Date) }),
    }));
    expect(response).toMatchObject({
      success: true,
      data: { ok: false, issues: [{ code: 'REVISION_CONFLICT' }] },
    });
  });

  it('rejects an invalid canonical envelope without calling Core', async () => {
    const response = await handler(IPC_CHANNELS.ONTOLOGY_CANONICAL_AUTHORING_EXECUTE)(undefined, {
      projectId: 'project-1', type: 'instance.create',
    });

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_AUTHORING_COMMAND',
        details: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_AUTHORING_COMMAND' })]),
      },
    });
    expect(executeAuthoring).not.toHaveBeenCalled();
  });
});
