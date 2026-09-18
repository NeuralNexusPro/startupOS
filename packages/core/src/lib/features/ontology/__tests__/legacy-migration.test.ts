import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CanonicalOntologyStore,
  migrateLegacyOntology,
  previewLegacyOntologyFile,
  previewLegacyOntologyMigration,
  projectCanonicalToLegacyOntology,
  projectCanonicalToOntologyModel,
  rollbackLegacyOntologyMigration,
} from '../index';

const instant = new Date('2026-09-18T08:00:00.000Z');
const iso = instant.toISOString();

const legacy = {
  id: 'legacy-ontology', projectId: 'project-1', name: 'Legacy', version: '7', createdAt: iso, updatedAt: iso,
  domains: [{ id: 'domain-1', name: 'Sales', description: 'Sales domain', createdAt: iso, updatedAt: iso }],
  concepts: [{
    id: 'customer', domainId: 'domain-1', name: 'Customer', type: 'entity', attributes: { email: 'required' },
    createdAt: iso, updatedAt: iso,
  }, {
    id: 'order', domainId: 'domain-1', name: 'Order', type: 'entity', attributes: {}, createdAt: iso, updatedAt: iso,
  }],
  instances: [{ id: 'customer-1', conceptId: 'customer', data: { name: 'Ada' }, createdAt: iso, updatedAt: iso }],
  relations: [{ id: 'places', sourceId: 'customer', targetId: 'order', type: 'association', createdAt: iso }],
};

const interviewModel = {
  id: 'interview-ontology', name: 'Interview', description: 'Interview result', createdAt: instant.getTime(),
  nodes: [{
    id: 'invoice', name: 'Invoice', type: 'entity', children: [
      { id: 'invoice-number', name: 'Number', type: 'property', description: 'Unique number' },
    ],
  }],
};

const businessModel = {
  projectName: 'Orders', industry: 'Retail', background: 'Order handling',
  entities: [{
    name: 'Order', definition: 'An order', properties: { number: 'required' },
    lifecycle: { states: ['draft', 'confirmed'], transitions: { 'draft→confirmed': 'confirm' } },
  }, { name: 'Customer', definition: 'A customer' }],
  relationships: [{ from: 'Customer', to: 'Order', type: 'places', cardinality: '1:N' }],
  businessRules: [{ name: 'Complete order', description: 'Order must be complete', condition: 'complete' }],
};

describe('legacy ontology migration', () => {
  let root: string;
  let store: CanonicalOntologyStore;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-legacy-migration-'));
    store = new CanonicalOntologyStore(root);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('converts all three known inputs deterministically with provenance', () => {
    const oldPreview = previewLegacyOntologyMigration(legacy, {
      projectId: 'project-1', sourceKind: 'ontology', sourceId: 'old.json', now: instant,
    });
    const interviewPreview = previewLegacyOntologyMigration(interviewModel, {
      projectId: 'project-1', sourceKind: 'ontology-model', sourceId: 'interview.json', now: instant,
    });
    const businessPreview = previewLegacyOntologyMigration(businessModel, {
      projectId: 'project-1', sourceKind: 'business-model', sourceId: 'business.json', now: instant,
    });
    const repeated = previewLegacyOntologyMigration(businessModel, {
      projectId: 'project-1', sourceKind: 'business-model', sourceId: 'business.json', now: instant,
    });

    expect(oldPreview.ontology?.concepts[0]?.sourceRefs?.[0]).toMatchObject({ sourceType: 'import', sourceId: 'old.json' });
    const hierarchyPreview = previewLegacyOntologyMigration({
      ...legacy,
      relations: [
        ...legacy.relations,
        { id: 'domain-contains-customer', sourceId: 'domain-1', targetId: 'customer', type: 'contains', createdAt: iso },
      ],
    }, { projectId: 'project-1', sourceKind: 'ontology', sourceId: 'builder.json', now: instant });
    expect(hierarchyPreview.ontology?.relations).toHaveLength(1);
    expect(hierarchyPreview.diagnostics).toContainEqual(expect.objectContaining({
      severity: 'warning', code: 'REDUNDANT_HIERARCHY_RELATION', path: 'relations.1',
    }));
    expect(interviewPreview.ontology?.properties[0]).toMatchObject({ id: 'invoice-number', conceptId: 'invoice' });
    expect(businessPreview.ontology).toEqual(repeated.ontology);
    expect(businessPreview.ontology?.relations[0]).toMatchObject({
      sourceConceptId: 'concept_1', targetConceptId: 'concept_0', cardinality: 'one-to-many',
    });
    expect(businessPreview.ontology?.transitions[0]).toMatchObject({
      fromStateId: 'concept_0-state-0', toStateId: 'concept_0-state-1',
    });
  });

  it('reports invalid references with paths and exposes pure compatibility projections', () => {
    const invalid = previewLegacyOntologyMigration({
      ...legacy,
      concepts: [{ ...legacy.concepts[0], domainId: 'missing' }],
      instances: [], relations: [],
    }, { projectId: 'project-1', sourceKind: 'ontology', now: instant });
    expect(invalid.ontology).toBeNull();
    expect(invalid.diagnostics[0]).toMatchObject({ severity: 'error', path: 'concepts.0.domainId' });

    const unsupportedInterview = previewLegacyOntologyMigration({
      ...interviewModel,
      nodes: [
        { id: 'orphan', name: 'Orphan', type: 'property' },
        { id: 'relation', name: 'Related to', type: 'relationship' },
      ],
    }, { projectId: 'project-1', sourceKind: 'ontology-model', now: instant });
    expect(unsupportedInterview.ontology).toBeNull();
    expect(unsupportedInterview.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', path: 'nodes.0' }),
      expect.objectContaining({ severity: 'warning', path: 'nodes.1' }),
    ]));

    const duplicateBusinessEntity = previewLegacyOntologyMigration({
      ...businessModel,
      entities: [...businessModel.entities, { name: 'Order', definition: 'Duplicate' }],
    }, { projectId: 'project-1', sourceKind: 'business-model', now: instant });
    expect(duplicateBusinessEntity.ontology).toBeNull();
    expect(duplicateBusinessEntity.diagnostics).toContainEqual(expect.objectContaining({ path: 'entities.2.name' }));

    const canonical = previewLegacyOntologyMigration(businessModel, {
      projectId: 'project-1', sourceKind: 'business-model', now: instant,
    }).ontology!;
    expect(projectCanonicalToLegacyOntology(canonical)).toMatchObject({ projectId: 'project-1', version: '1' });
    expect(projectCanonicalToOntologyModel(canonical).nodes[0]).toMatchObject({ id: 'concept_0', type: 'entity' });
    expect(projectCanonicalToOntologyModel(canonical).nodes[0]?.children).toHaveLength(1);
  });

  it('keeps file dry-runs side-effect free and rejects paths outside data root', async () => {
    const sourcePath = path.join(root, 'projects', 'project-1', 'legacy.json');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, JSON.stringify(legacy), 'utf8');

    expect((await previewLegacyOntologyFile({
      projectId: 'project-1', sourceKind: 'ontology', sourcePath, now: instant,
    }, root)).ontology?.id).toBe('legacy-ontology');
    await expect(fs.access(path.join(root, 'ontology'))).rejects.toMatchObject({ code: 'ENOENT' });

    const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.json`);
    await fs.writeFile(outside, JSON.stringify(legacy), 'utf8');
    await expect(previewLegacyOntologyFile({
      projectId: 'project-1', sourceKind: 'ontology', sourcePath: outside,
    }, root)).rejects.toThrow('inside data root');
    await fs.rm(outside, { force: true });
  });

  it('backs up exact bytes, audits migration, refuses overwrite, and rolls back safely', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(instant);
    const sourcePath = path.join(root, 'projects', 'project-1', 'business-model.json');
    const sourceBytes = Buffer.from(`${JSON.stringify(businessModel, null, 2)}\n`);
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, sourceBytes);

    const result = await migrateLegacyOntology({
      projectId: 'project-1', sourceKind: 'business-model', sourcePath,
      migrationId: 'migration-1', now: instant,
    }, root, store);
    expect(await fs.readFile(result.backupPath)).toEqual(sourceBytes);
    expect(await fs.readFile(sourcePath)).toEqual(sourceBytes);
    expect((await store.readMigrations('project-1')).map((record) => record.status)).toEqual(['started', 'completed']);

    await expect(migrateLegacyOntology({
      projectId: 'project-1', sourceKind: 'business-model', sourcePath, migrationId: 'migration-2', now: instant,
    }, root, store)).rejects.toThrow('already exists');
    expect(await fs.readdir(path.dirname(result.backupPath))).toEqual(['migration-1.json']);
    expect(await store.readMigrations('project-1')).toHaveLength(2);

    await rollbackLegacyOntologyMigration('project-1', 'migration-1', root, store, instant);
    expect(await store.readOntology('project-1')).toBeNull();
    expect((await store.readMigrations('project-1')).at(-1)?.status).toBe('rolled_back');
    expect(await fs.readFile(result.backupPath)).toEqual(sourceBytes);
  });

  it('rejects rollback after the canonical snapshot changed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(instant);
    const sourcePath = path.join(root, 'projects', 'project-1', 'legacy.json');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, JSON.stringify(legacy), 'utf8');
    const result = await migrateLegacyOntology({
      projectId: 'project-1', sourceKind: 'ontology', sourcePath, migrationId: 'migration-1', now: instant,
    }, root, store);

    vi.setSystemTime('2026-09-18T09:00:00.000Z');
    await store.writeOntology('project-1', { ...result.ontology!, version: '8' });
    await expect(rollbackLegacyOntologyMigration('project-1', 'migration-1', root, store, instant))
      .rejects.toThrow('changed after migration');
    expect((await store.readOntology('project-1'))?.data.version).toBe('8');
  });

  it('audits a failed write after backup and start', async () => {
    const sourcePath = path.join(root, 'projects', 'project-1', 'legacy.json');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, JSON.stringify(legacy), 'utf8');
    vi.spyOn(store, 'writeOntology').mockRejectedValueOnce(new Error('disk full'));

    await expect(migrateLegacyOntology({
      projectId: 'project-1', sourceKind: 'ontology', sourcePath, migrationId: 'migration-failed', now: instant,
    }, root, store)).rejects.toThrow('disk full');
    expect((await store.readMigrations('project-1')).map((record) => record.status)).toEqual(['started', 'failed']);
  });

  it('validates project ids before reading a migration source', async () => {
    await expect(migrateLegacyOntology({
      projectId: '../escape', sourceKind: 'ontology', sourcePath: 'missing.json', migrationId: 'migration-1',
    }, root, store)).rejects.toThrow('Invalid projectId');
  });
});
