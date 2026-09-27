import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CanonicalOntologyStore, type CanonicalOntology } from '../../ontology';
import {
  ProjectOntologyEntryService,
  ProjectOntologyInitializationError,
} from '../project-ontology-entry-service';
import { ProjectCreationService } from '../project-creation-service';

const roots: string[] = [];

function ontology(projectId: string, version = '1.0.0'): CanonicalOntology {
  const now = new Date('2026-09-27T00:00:00.000Z');
  return {
    id: `ontology_${projectId}`,
    projectId,
    name: '项目本体',
    schemaVersion: '1.0.0',
    version,
    domains: [{ id: 'domain-1', name: '领域', description: '描述', createdAt: now, updatedAt: now }],
    concepts: [{
      id: 'concept-1', domainId: 'domain-1', name: '概念', type: 'entity', attributes: {}, createdAt: now, updatedAt: now,
    }],
    instances: [], properties: [], relations: [], businessStates: [], transitions: [], factTypes: [], rules: [], actions: [], events: [], projections: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function root(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-project-ontology-entry-'));
  roots.push(directory);
  return directory;
}

async function writeProject(dataRoot: string, projectId: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const projectDir = path.join(dataRoot, 'projects', projectId);
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(path.join(projectDir, 'project.json'), JSON.stringify({ id: projectId, name: '测试项目', metadata }), 'utf8');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('ProjectOntologyEntryService', () => {
  it('creates a canonical ontology and exact metadata reference for a confirmed new-project interview', async () => {
    const dataRoot = await root();
    const service = new ProjectCreationService(undefined, dataRoot);
    const { session } = await service.startSession({ userId: 'user-1', projectName: '访谈项目' });
    await service.submitAnswer(session.sessionId, { sessionId: session.sessionId, step: 1, answer: { type: 'text', value: '一个 CRM 项目' } });
    await service.submitAnswer(session.sessionId, { sessionId: session.sessionId, step: 2, answer: { type: 'choice', value: ['stability'] } });
    await service.submitAnswer(session.sessionId, { sessionId: session.sessionId, step: 3, answer: { type: 'choice', value: 'solo' } });

    const completed = await service.completeCreation(session.sessionId, {
      sessionId: session.sessionId,
      projectName: '访谈项目',
      confirmData: {},
    });
    const projectId = completed.project.id;
    const project = JSON.parse(await fs.readFile(path.join(dataRoot, 'projects', projectId, 'project.json'), 'utf8')) as {
      ontologyId: string;
      metadata: Record<string, unknown>;
    };

    expect(project.metadata['ontologyRef']).toEqual({ ontologyId: project.ontologyId, ontologyVersion: '1.0.0' });
    expect(await new CanonicalOntologyStore(dataRoot).readOntology(projectId)).toMatchObject({ data: { id: project.ontologyId, version: '1.0.0' } });
    await expect(fs.access(path.join(dataRoot, 'ontologies', projectId, 'ontology.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(dataRoot, 'projects', projectId, 'output', 'business-model.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects an invalid constructed ontology before creating project metadata, directory, or snapshot', async () => {
    const dataRoot = await root();
    const service = new ProjectCreationService(undefined, dataRoot);
    const { session } = await service.startSession({ userId: 'user-1', projectName: '无效项目' });
    const invalid = ontology(session.projectId);
    invalid.concepts[0]!.domainId = 'missing-domain';
    Reflect.set(service, 'buildCanonicalOntology', () => invalid);

    await expect(service.completeCreation(session.sessionId, {
      sessionId: session.sessionId,
      projectName: '无效项目',
      confirmData: {},
    })).rejects.toBeInstanceOf(ProjectOntologyInitializationError);

    await expect(fs.access(path.join(dataRoot, 'projects', session.projectId))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(dataRoot, 'projects', session.projectId, 'project.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(new CanonicalOntologyStore(dataRoot).readOntology(session.projectId)).resolves.toBeNull();
  });

  it('creates only a validated canonical snapshot and resolves an exact project reference', async () => {
    const dataRoot = await root();
    const projectId = 'project-1';
    const service = new ProjectOntologyEntryService(dataRoot);
    const created = await service.initializeCanonicalOntology(projectId, ontology(projectId));
    await writeProject(dataRoot, projectId, { ontologyRef: created });

    await expect(service.resolveProject(projectId)).resolves.toEqual({
      kind: 'canonical',
      ontology: { ...created, name: '项目本体', domainCount: 1, conceptCount: 1 },
    });
    await expect(fs.access(path.join(dataRoot, 'projects', projectId, 'output', 'business-model.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects invalid input before it writes a canonical snapshot', async () => {
    const dataRoot = await root();
    const projectId = 'project-invalid';
    const service = new ProjectOntologyEntryService(dataRoot);
    const invalid = ontology(projectId);
    invalid.concepts[0]!.domainId = 'missing-domain';

    await expect(service.initializeCanonicalOntology(projectId, invalid)).rejects.toBeInstanceOf(ProjectOntologyInitializationError);
    await expect(new CanonicalOntologyStore(dataRoot).readOntology(projectId)).resolves.toBeNull();
  });

  it('returns migration-required for an unmigrated legacy project without writing a snapshot', async () => {
    const dataRoot = await root();
    const projectId = 'project-legacy';
    await writeProject(dataRoot, projectId);
    const legacyPath = path.join(dataRoot, 'projects', projectId, 'output', 'business-model.json');
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.writeFile(legacyPath, '{"entities":[]}', 'utf8');

    const service = new ProjectOntologyEntryService(dataRoot);
    await expect(service.resolveProject(projectId)).resolves.toEqual({ kind: 'legacy_migration_required', migrationAvailable: true });
    await expect(new CanonicalOntologyStore(dataRoot).readOntology(projectId)).resolves.toBeNull();
  });

  it('binds a completed explicit migration to the persisted exact canonical version', async () => {
    const dataRoot = await root();
    const projectId = 'project-migrated';
    await writeProject(dataRoot, projectId, { retained: 'value' });
    const store = new CanonicalOntologyStore(dataRoot);
    const canonical = ontology(projectId, '2.0.0');
    await store.writeOntology(projectId, canonical, { createOnly: true });

    const service = new ProjectOntologyEntryService(dataRoot, store);
    const bound = await service.bindCanonicalOntology(projectId, canonical);
    await expect(service.resolveProject(projectId)).resolves.toEqual({
      kind: 'canonical',
      ontology: { ...bound, name: '项目本体', domainCount: 1, conceptCount: 1 },
    });
    const metadata = JSON.parse(await fs.readFile(path.join(dataRoot, 'projects', projectId, 'project.json'), 'utf8')) as { metadata: Record<string, unknown> };
    expect(metadata.metadata['retained']).toBe('value');
    expect(metadata.metadata['ontologyRef']).toEqual({ ontologyId: canonical.id, ontologyVersion: canonical.version });
  });
});
