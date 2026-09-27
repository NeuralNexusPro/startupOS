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
    new OntologyDataService();
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
});
