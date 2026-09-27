import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../../ipc-protocol';

const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
const mocks = vi.hoisted(() => ({
  resolveProject: vi.fn(),
  migrateAndBindLegacyOntology: vi.fn(),
  previewLegacyOntologyFile: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('../../../../../core/src/lib/features/project', () => ({
  ProjectOntologyEntryService: class {
    resolveProject = mocks.resolveProject;
    migrateAndBindLegacyOntology = mocks.migrateAndBindLegacyOntology;
  },
}));

vi.mock('../../../../../core/src/lib/features/ontology', () => ({
  previewLegacyOntologyFile: mocks.previewLegacyOntologyFile,
}));

vi.mock('../../../../../core/src/lib/features/services/project-service-real', () => ({
  projectService: { getProject: mocks.getProject },
}));

vi.mock('../../../../../core/src/lib/features/project/project-creation-service', () => ({
  projectCreationService: {},
}));

vi.mock('../../../../../core/src/lib/integrations/pi-agent/project-agent/project-skill-provisioning', () => ({
  PROJECT_DEFAULT_SKILLS: [],
  provisionProjectSkill: vi.fn(),
  provisionProjectSkills: vi.fn(),
}));

vi.mock('../../../../../core/src/lib/features/services/launcher/registry', () => ({ launch: vi.fn() }));

import { ProjectService } from '../project-service';

function handler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const registered = handlers.get(channel);
  if (!registered) {
    throw new Error(`No handler for ${channel}`);
  }
  return registered;
}

describe('ProjectService canonical ontology IPC', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    new ProjectService();
  });

  it('returns the Core canonical entry result without reading legacy artifacts', async () => {
    mocks.resolveProject.mockResolvedValue({
      kind: 'canonical',
      ontology: { ontologyId: 'ont-1', ontologyVersion: '1.0.0', name: '项目本体', domainCount: 1, conceptCount: 2 },
    });

    const response = await handler(IPC_CHANNELS.PROJECT_ONTOLOGY_ENTRY_GET)(undefined, { projectId: 'project-1' });

    expect(response).toMatchObject({ success: true, data: { kind: 'canonical', ontology: { ontologyId: 'ont-1' } } });
    expect(mocks.resolveProject).toHaveBeenCalledWith('project-1');
  });

  it('returns legacy migration-required unchanged for an unmigrated project', async () => {
    mocks.resolveProject.mockResolvedValue({ kind: 'legacy_migration_required', migrationAvailable: true });

    const response = await handler(IPC_CHANNELS.PROJECT_ONTOLOGY_ENTRY_GET)(undefined, { projectId: 'legacy-project' });

    expect(response).toMatchObject({ success: true, data: { kind: 'legacy_migration_required', migrationAvailable: true } });
  });

  it('requires a dry-run before the explicit migration command writes a canonical snapshot', async () => {
    mocks.previewLegacyOntologyFile.mockResolvedValue({ ontology: null, diagnostics: [{ code: 'INVALID_SOURCE' }] });

    const response = await handler(IPC_CHANNELS.PROJECT_LEGACY_ONTOLOGY_MIGRATE)(undefined, {
      projectId: 'legacy-project', sourceKind: 'business-model', confirmed: false,
    });

    expect(response).toMatchObject({ success: true, data: { mode: 'dry-run', diagnostics: [{ code: 'INVALID_SOURCE' }] } });
    expect(mocks.previewLegacyOntologyFile).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'legacy-project',
        sourceKind: 'business-model',
        sourcePath: 'projects/legacy-project/output/business-model.json',
      }),
      expect.any(String),
    );
    expect(mocks.migrateAndBindLegacyOntology).not.toHaveBeenCalled();
  });

  it('binds the migrated canonical reference through the Core entry service', async () => {
    mocks.migrateAndBindLegacyOntology.mockResolvedValue({ ontologyId: 'ont-1', ontologyVersion: '1.0.0' });
    mocks.getProject.mockResolvedValue(null);

    const response = await handler(IPC_CHANNELS.PROJECT_LEGACY_ONTOLOGY_MIGRATE)(undefined, {
      projectId: 'legacy-project', sourceKind: 'business-model', confirmed: true,
    });

    expect(response).toMatchObject({ success: true, data: { mode: 'migrated', ontology: { ontologyId: 'ont-1' } } });
    expect(mocks.migrateAndBindLegacyOntology).toHaveBeenCalledWith({
      projectId: 'legacy-project',
      sourceKind: 'business-model',
      sourcePath: 'projects/legacy-project/output/business-model.json',
    });
  });

  it('rejects the historical automatic sync command without writing', async () => {
    const response = await handler(IPC_CHANNELS.PROJECT_SYNC_ONTOLOGY)(undefined, { projectId: 'legacy-project' });

    expect(response).toMatchObject({ success: false, error: { code: 'LEGACY_MIGRATION_REQUIRED' } });
    expect(mocks.migrateAndBindLegacyOntology).not.toHaveBeenCalled();
  });
});
