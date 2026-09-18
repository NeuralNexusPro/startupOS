import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import { z } from 'zod';

import { getDataRoot } from '../../paths';
import { CanonicalOntologyStore } from './canonical-ontology-store';
import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  type CanonicalOntology,
  type CanonicalProperty,
  type CanonicalRelation,
  type CanonicalRule,
  type CanonicalSourceReference,
  type CanonicalValueType,
} from './types';

type LegacyTimed = { createdAt: string; updatedAt: string };
type LegacyOntologyInput = LegacyTimed & {
  id: string;
  projectId: string;
  name: string;
  version: string;
  domains: Array<LegacyTimed & { id: string; name: string; description: string; icon?: string; color?: string }>;
  concepts: Array<LegacyTimed & {
    id: string; domainId: string; name: string; type: string; attributes: Record<string, unknown>; description?: string;
  }>;
  instances: Array<LegacyTimed & { id: string; conceptId: string; data: Record<string, unknown> }>;
  relations: Array<{
    id: string; sourceId: string; targetId: string; type: string; metadata?: Record<string, unknown>; createdAt: string;
  }>;
};

export type LegacyOntologySourceKind = 'ontology' | 'ontology-model' | 'business-model';

export interface LegacyMigrationDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
}

export interface LegacyMigrationPreview {
  ontology: CanonicalOntology | null;
  diagnostics: LegacyMigrationDiagnostic[];
}

export interface LegacyMigrationOptions {
  projectId: string;
  sourcePath: string;
  sourceKind: LegacyOntologySourceKind;
  migrationId?: string;
  now?: Date;
}

export interface LegacyMigrationResult extends LegacyMigrationPreview {
  migrationId: string;
  backupPath: string;
  targetUpdatedAt: string;
}

export interface LegacyOntologyView {
  id: string;
  projectId: string;
  name: string;
  domains: Array<Record<string, unknown>>;
  concepts: Array<Record<string, unknown>>;
  instances: Array<Record<string, unknown>>;
  relations: Array<Record<string, unknown>>;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyOntologyModelView {
  id: string;
  name: string;
  description: string;
  nodes: Array<Record<string, unknown>>;
  createdAt: number;
}

const timed = {
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
};
const legacyOntologySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  ...timed,
  domains: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), description: z.string(),
    icon: z.string().optional(), color: z.string().optional(), ...timed,
  }).passthrough()),
  concepts: z.array(z.object({
    id: z.string().min(1), domainId: z.string().min(1), name: z.string().min(1),
    type: z.string().min(1), attributes: z.record(z.unknown()), description: z.string().optional(), ...timed,
  }).passthrough()),
  instances: z.array(z.object({
    id: z.string().min(1), conceptId: z.string().min(1), data: z.record(z.unknown()), ...timed,
  }).passthrough()),
  relations: z.array(z.object({
    id: z.string().min(1), sourceId: z.string().min(1), targetId: z.string().min(1),
    type: z.string().min(1), metadata: z.record(z.unknown()).optional(), createdAt: z.string().datetime(),
  }).passthrough()),
}).passthrough();

type InterviewNode = {
  id: string;
  name: string;
  type: 'entity' | 'class' | 'property' | 'relationship' | 'rule';
  description?: string;
  children?: InterviewNode[];
};
const interviewNodeSchema: z.ZodTypeAny = z.lazy(() => z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['entity', 'class', 'property', 'relationship', 'rule']),
  description: z.string().optional(),
  children: z.array(interviewNodeSchema).optional(),
}));
const ontologyModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  nodes: z.array(interviewNodeSchema),
  createdAt: z.number().finite(),
});

const lifecycleSchema = z.object({
  states: z.array(z.string().min(1)),
  transitions: z.record(z.string()),
});
const businessEntitySchema = z.union([z.string().min(1), z.object({
  name: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  definition: z.string().optional(),
  description: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  lifecycle: lifecycleSchema.optional(),
}).refine((value) => value.name || value.label, { message: 'name or label is required' })]);
const businessRelationshipSchema = z.union([z.string().min(1), z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().min(1),
  cardinality: z.string().min(1),
  required: z.boolean().optional(),
})]);
const businessModelSchema = z.object({
  projectName: z.string().min(1).optional(),
  industry: z.string().optional(),
  background: z.string().optional(),
  description: z.string().optional(),
  entities: z.array(businessEntitySchema).min(1),
  relationships: z.array(businessRelationshipSchema).default([]),
  businessRules: z.array(z.object({
    name: z.string().min(1), description: z.string(), condition: z.string().optional(),
    action: z.string().optional(), exception: z.string().optional(),
  })).default([]),
}).passthrough();

function source(sourceId: string, kind: LegacyOntologySourceKind, locator?: string): CanonicalSourceReference {
  return { sourceType: kind === 'ontology-model' ? 'interview' : 'import', sourceId, locator };
}

function diagnostic(error: z.ZodError): LegacyMigrationDiagnostic[] {
  return error.issues.map((issue) => ({
    severity: 'error', code: 'INVALID_SOURCE', path: issue.path.join('.'), message: issue.message,
  }));
}

function issue(pathValue: string, message: string): LegacyMigrationDiagnostic {
  return { severity: 'error', code: 'INVALID_REFERENCE', path: pathValue, message };
}

function duplicateIds(items: Array<{ id: string }>, collection: string): LegacyMigrationDiagnostic[] {
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    if (seen.has(item.id)) return [issue(`${collection}.${index}.id`, `Duplicate id ${item.id}`)];
    seen.add(item.id);
    return [];
  });
}

function baseOntology(projectId: string, id: string, name: string, version: string, at: Date, sourceRef: CanonicalSourceReference): CanonicalOntology {
  return {
    id, projectId, name, schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION, version,
    domains: [], concepts: [], instances: [], properties: [], relations: [], businessStates: [],
    transitions: [], factTypes: [], rules: [], actions: [], events: [], projections: [],
    sourceRefs: [sourceRef], createdAt: at, updatedAt: at,
  };
}

function convertOntology(input: unknown, projectId: string, sourceId: string): LegacyMigrationPreview {
  const parsed = legacyOntologySchema.safeParse(input);
  if (!parsed.success) return { ontology: null, diagnostics: diagnostic(parsed.error) };
  const value = parsed.data as unknown as LegacyOntologyInput;
  const diagnostics: LegacyMigrationDiagnostic[] = [
    ...duplicateIds(value.domains, 'domains'),
    ...duplicateIds(value.concepts, 'concepts'),
    ...duplicateIds(value.instances, 'instances'),
    ...duplicateIds(value.relations, 'relations'),
  ];
  if (value.projectId !== projectId) diagnostics.push(issue('projectId', `Expected ${projectId}`));
  const domainIds = new Set(value.domains.map((item) => item.id));
  const conceptIds = new Set(value.concepts.map((item) => item.id));
  value.concepts.forEach((item, index) => {
    if (!domainIds.has(item.domainId)) diagnostics.push(issue(`concepts.${index}.domainId`, `Unknown domain ${item.domainId}`));
  });
  value.instances.forEach((item, index) => {
    if (!conceptIds.has(item.conceptId)) diagnostics.push(issue(`instances.${index}.conceptId`, `Unknown concept ${item.conceptId}`));
  });
  const hierarchyRelations = new Set<number>();
  const conceptsById = new Map(value.concepts.map((concept) => [concept.id, concept]));
  value.relations.forEach((item, index) => {
    const hierarchyConcept = conceptsById.get(item.targetId);
    if (item.type === 'contains' && domainIds.has(item.sourceId) && hierarchyConcept?.domainId === item.sourceId) {
      hierarchyRelations.add(index);
      diagnostics.push({
        severity: 'warning', code: 'REDUNDANT_HIERARCHY_RELATION', path: `relations.${index}`,
        message: 'Domain-to-concept contains relation is already represented by concept.domainId',
      });
      return;
    }
    if (!conceptIds.has(item.sourceId)) diagnostics.push(issue(`relations.${index}.sourceId`, `Unknown concept ${item.sourceId}`));
    if (!conceptIds.has(item.targetId)) diagnostics.push(issue(`relations.${index}.targetId`, `Unknown concept ${item.targetId}`));
  });
  if (diagnostics.some((item) => item.severity === 'error')) return { ontology: null, diagnostics };
  const rootSource = source(sourceId, 'ontology');
  const ontology = baseOntology(projectId, value.id, value.name, value.version, new Date(value.createdAt), rootSource);
  ontology.updatedAt = new Date(value.updatedAt);
  ontology.domains = value.domains.map((item) => ({ ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) }));
  ontology.concepts = value.concepts.map((item, index) => ({
    ...item, sourceRefs: [source(sourceId, 'ontology', `concepts.${index}`)],
    createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
  }));
  ontology.instances = value.instances.map((item, index) => ({
    ...item, sourceRefs: [source(sourceId, 'ontology', `instances.${index}`)],
    createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
  }));
  ontology.relations = value.relations.filter((_, index) => !hierarchyRelations.has(index)).map((item) => ({
    id: item.id, name: item.type, sourceConceptId: item.sourceId, targetConceptId: item.targetId,
    cardinality: 'many-to-many', metadata: { ...item.metadata, legacyType: item.type, createdAt: item.createdAt },
  }));
  return { ontology, diagnostics };
}

function convertOntologyModel(input: unknown, projectId: string, sourceId: string): LegacyMigrationPreview {
  const parsed = ontologyModelSchema.safeParse(input);
  if (!parsed.success) return { ontology: null, diagnostics: diagnostic(parsed.error) };
  const value = parsed.data as unknown as {
    id: string; name: string; description: string; nodes: InterviewNode[]; createdAt: number;
  };
  const at = new Date(value.createdAt);
  if (Number.isNaN(at.getTime())) return { ontology: null, diagnostics: [issue('createdAt', 'Invalid timestamp')] };
  const rootSource = source(sourceId, 'ontology-model');
  const ontology = baseOntology(projectId, value.id, value.name, '1', at, rootSource);
  const domainId = `${value.id}-domain`;
  const diagnostics: LegacyMigrationDiagnostic[] = [];
  const mappedNodeIds = new Set<string>();
  ontology.domains.push({ id: domainId, name: value.name, description: value.description, createdAt: at, updatedAt: at });
  const walk = (nodes: InterviewNode[], parentConceptId?: string, prefix = 'nodes'): void => {
    nodes.forEach((node, index) => {
      const locator = `${prefix}.${index}`;
      let nextParent = parentConceptId;
      if (node.type === 'entity' || node.type === 'class' || node.type === 'property') {
        if (mappedNodeIds.has(node.id)) diagnostics.push(issue(`${locator}.id`, `Duplicate id ${node.id}`));
        mappedNodeIds.add(node.id);
      }
      if (node.type === 'entity' || node.type === 'class') {
        ontology.concepts.push({
          id: node.id, domainId, name: node.name, type: node.type, attributes: {}, description: node.description,
          sourceRefs: [source(sourceId, 'ontology-model', locator)], createdAt: at, updatedAt: at,
        });
        nextParent = node.id;
      } else if (node.type === 'property' && parentConceptId) {
        ontology.properties.push({
          id: node.id, conceptId: parentConceptId, name: node.name, valueType: 'string', required: false,
          description: node.description, metadata: { source: source(sourceId, 'ontology-model', locator) },
        });
      } else if (node.type === 'property') {
        diagnostics.push(issue(locator, 'Property requires a parent entity or class'));
      } else {
        diagnostics.push({
          severity: 'warning', code: 'UNSUPPORTED_NODE', path: locator,
          message: `${node.type} nodes do not contain enough references for canonical mapping`,
        });
      }
      if (node.children) walk(node.children, nextParent, `${locator}.children`);
    });
  };
  walk(value.nodes);
  return diagnostics.some((item) => item.severity === 'error')
    ? { ontology: null, diagnostics }
    : { ontology, diagnostics };
}

function valueType(value: unknown): CanonicalValueType {
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (value === null) return 'object';
  const kind = typeof value;
  return kind === 'number' || kind === 'boolean' || kind === 'object' ? kind : 'string';
}

function cardinality(value: string): CanonicalRelation['cardinality'] {
  const normalized = value.toLowerCase().replace(/\s/g, '');
  if (['1:1', '1-1', 'one-to-one'].includes(normalized)) return 'one-to-one';
  if (['1:n', '1:m', 'one-to-many'].includes(normalized)) return 'one-to-many';
  if (['n:1', 'm:1', 'many-to-one'].includes(normalized)) return 'many-to-one';
  return 'many-to-many';
}

function convertBusinessModel(input: unknown, projectId: string, sourceId: string, at: Date): LegacyMigrationPreview {
  const parsed = businessModelSchema.safeParse(input);
  if (!parsed.success) return { ontology: null, diagnostics: diagnostic(parsed.error) };
  const value = parsed.data;
  const rootSource = source(sourceId, 'business-model');
  const name = value.projectName ?? 'Business Model';
  const ontology = baseOntology(projectId, `ontology-${projectId}`, name, '1', at, rootSource);
  const domainId = 'domain_main';
  ontology.domains.push({ id: domainId, name, description: value.background ?? value.description ?? '', createdAt: at, updatedAt: at });
  const ids = new Map<string, string>();
  const diagnostics: LegacyMigrationDiagnostic[] = [];
  value.entities.forEach((entity, index) => {
    const conceptId = `concept_${index}`;
    const entityName = typeof entity === 'string' ? entity : (entity.name ?? entity.label ?? '');
    if (ids.has(entityName)) diagnostics.push(issue(`entities.${index}.name`, `Duplicate entity name ${entityName}`));
    ids.set(entityName, conceptId);
    const properties = typeof entity === 'string' ? {} : (entity.properties ?? {});
    const propertyIds: string[] = [];
    Object.entries(properties).forEach(([propertyName, propertyValue], propertyIndex) => {
      const propertyId = `${conceptId}-property-${propertyIndex}`;
      propertyIds.push(propertyId);
      ontology.properties.push({
        id: propertyId, conceptId, name: propertyName, valueType: valueType(propertyValue), required: false,
        description: typeof propertyValue === 'string' ? propertyValue : undefined,
        metadata: { source: source(sourceId, 'business-model', `entities.${index}.properties.${propertyName}`) },
      });
    });
    ontology.concepts.push({
      id: conceptId, domainId, name: entityName, type: 'entity', attributes: properties,
      description: typeof entity === 'string' ? '' : (entity.definition ?? entity.description ?? ''),
      propertyIds, sourceRefs: [source(sourceId, 'business-model', `entities.${index}`)], createdAt: at, updatedAt: at,
    });
    if (typeof entity !== 'string' && entity.lifecycle) {
      entity.lifecycle.states.forEach((stateName, stateIndex) => ontology.businessStates.push({
        id: `${conceptId}-state-${stateIndex}`, conceptId, name: stateName, initial: stateIndex === 0,
        terminal: stateIndex === entity.lifecycle!.states.length - 1,
      }));
    }
  });
  value.relationships.forEach((relationship, index) => {
    const parts = typeof relationship === 'string'
      ? relationship.split(/→|->/).map((part) => part.trim())
      : [relationship.from, relationship.to];
    const sourceIdValue = ids.get(parts[0] ?? '');
    const targetId = ids.get(parts[1] ?? '');
    if (!sourceIdValue) diagnostics.push(issue(`relationships.${index}.from`, `Unknown entity ${parts[0] ?? ''}`));
    if (!targetId) diagnostics.push(issue(`relationships.${index}.to`, `Unknown entity ${parts[1] ?? ''}`));
    if (sourceIdValue && targetId) ontology.relations.push({
      id: `relation_${index}`, name: typeof relationship === 'string' ? 'related_to' : relationship.type,
      sourceConceptId: sourceIdValue, targetConceptId: targetId,
      cardinality: cardinality(typeof relationship === 'string' ? 'N:M' : relationship.cardinality),
      metadata: { source: source(sourceId, 'business-model', `relationships.${index}`) },
    });
  });
  value.entities.forEach((entity, entityIndex) => {
    if (typeof entity === 'string' || !entity.lifecycle) return;
    const stateIds = new Map(entity.lifecycle.states.map((stateName, index) => [stateName, `concept_${entityIndex}-state-${index}`]));
    Object.entries(entity.lifecycle.transitions).forEach(([edge, description], transitionIndex) => {
      const [from, to] = edge.split(/→|->/).map((part) => part.trim());
      const fromStateId = stateIds.get(from ?? '');
      const toStateId = stateIds.get(to ?? '');
      if (!fromStateId || !toStateId) {
        diagnostics.push(issue(`entities.${entityIndex}.lifecycle.transitions.${edge}`, 'Transition references an unknown state'));
        return;
      }
      ontology.transitions.push({
        id: `concept_${entityIndex}-transition-${transitionIndex}`, conceptId: `concept_${entityIndex}`,
        name: description || edge, fromStateId, toStateId,
      });
    });
  });
  ontology.rules = value.businessRules.map((rule, index): CanonicalRule => ({
    id: `rule_${index}`, name: rule.name, kind: 'invariant',
    expression: { condition: rule.condition, action: rule.action, exception: rule.exception },
    severity: 'error', description: rule.description,
  }));
  return diagnostics.length ? { ontology: null, diagnostics } : { ontology, diagnostics };
}

export function previewLegacyOntologyMigration(
  input: unknown,
  options: { projectId: string; sourceKind: LegacyOntologySourceKind; sourceId?: string; now?: Date },
): LegacyMigrationPreview {
  const sourceId = options.sourceId ?? options.sourceKind;
  if (options.sourceKind === 'ontology') return convertOntology(input, options.projectId, sourceId);
  if (options.sourceKind === 'ontology-model') return convertOntologyModel(input, options.projectId, sourceId);
  return convertBusinessModel(input, options.projectId, sourceId, options.now ?? new Date());
}

async function safeSourcePath(dataRoot: string, sourcePath: string): Promise<{ absolute: string; relative: string }> {
  const root = await fs.realpath(dataRoot);
  const absolute = await fs.realpath(path.resolve(root, sourcePath));
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('sourcePath must resolve to a file inside data root');
  }
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new Error('sourcePath must resolve to a file');
  return { absolute, relative: relative.split(path.sep).join('/') };
}

function portableRelative(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}

export async function previewLegacyOntologyFile(
  options: LegacyMigrationOptions,
  dataRoot = getDataRoot(),
): Promise<LegacyMigrationPreview> {
  const resolved = await safeSourcePath(dataRoot, options.sourcePath);
  const content = await fs.readFile(resolved.absolute, 'utf8');
  let input: unknown;
  try {
    input = JSON.parse(content) as unknown;
  } catch {
    return { ontology: null, diagnostics: [{ severity: 'error', code: 'INVALID_JSON', path: '', message: 'Source is not valid JSON' }] };
  }
  return previewLegacyOntologyMigration(input, { ...options, sourceId: resolved.relative });
}

export async function migrateLegacyOntology(
  options: LegacyMigrationOptions,
  dataRoot = getDataRoot(),
  store = new CanonicalOntologyStore(dataRoot),
): Promise<LegacyMigrationResult> {
  const migrationId = options.migrationId ?? randomUUID();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(migrationId) || migrationId.includes('..')) {
    throw new TypeError(`Invalid migrationId: ${migrationId}`);
  }
  if (await store.readOntology(options.projectId)) throw new Error(`Canonical ontology already exists for ${options.projectId}`);
  const resolved = await safeSourcePath(dataRoot, options.sourcePath);
  const sourceBytes = await fs.readFile(resolved.absolute);
  let input: unknown;
  try {
    input = JSON.parse(sourceBytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('Source is not valid JSON');
  }
  const preview = previewLegacyOntologyMigration(input, { ...options, sourceId: resolved.relative });
  if (!preview.ontology) throw new Error(`Legacy migration validation failed: ${preview.diagnostics.map((item) => item.path).join(', ')}`);
  const backupPath = path.join(dataRoot, 'ontology', 'backups', options.projectId, `${migrationId}.json`);
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(backupPath, sourceBytes, { flag: 'wx' });
  const recordedAt = options.now ?? new Date();
  await store.appendMigration(options.projectId, {
    migrationId, projectId: options.projectId, fromVersion: options.sourceKind,
    toVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION, status: 'started', recordedAt,
    metadata: { sourcePath: resolved.relative, backupPath: portableRelative(dataRoot, backupPath) },
  });
  try {
    const target = await store.writeOntology(options.projectId, preview.ontology, { createOnly: true });
    await store.appendMigration(options.projectId, {
      migrationId, projectId: options.projectId, fromVersion: options.sourceKind,
      toVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION, status: 'completed', recordedAt: options.now ?? new Date(),
      metadata: { sourcePath: resolved.relative, backupPath: portableRelative(dataRoot, backupPath), targetUpdatedAt: target.updatedAt },
    });
    return { ...preview, migrationId, backupPath, targetUpdatedAt: target.updatedAt };
  } catch (error) {
    await store.appendMigration(options.projectId, {
      migrationId, projectId: options.projectId, fromVersion: options.sourceKind,
      toVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION, status: 'failed', recordedAt: options.now ?? new Date(),
      metadata: { sourcePath: resolved.relative, backupPath: portableRelative(dataRoot, backupPath) },
    });
    throw error;
  }
}

export async function rollbackLegacyOntologyMigration(
  projectId: string,
  migrationId: string,
  dataRoot = getDataRoot(),
  store = new CanonicalOntologyStore(dataRoot),
  now = new Date(),
): Promise<void> {
  const records = (await store.readMigrations(projectId)).filter((record) => record.migrationId === migrationId);
  if (records.some((record) => record.status === 'rolled_back')) throw new Error(`Migration ${migrationId} was already rolled back`);
  const completed = records.findLast((record) => record.status === 'completed');
  const targetUpdatedAt = completed?.metadata?.['targetUpdatedAt'];
  if (!completed || typeof targetUpdatedAt !== 'string') throw new Error(`Completed migration ${migrationId} not found`);
  if (!(await store.deleteOntology(projectId, targetUpdatedAt))) throw new Error(`Canonical ontology ${projectId} not found`);
  await store.appendMigration(projectId, { ...completed, status: 'rolled_back', recordedAt: now });
}

export function projectCanonicalToLegacyOntology(ontology: CanonicalOntology): LegacyOntologyView {
  return {
    id: ontology.id, projectId: ontology.projectId, name: ontology.name,
    domains: ontology.domains.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
    concepts: ontology.concepts.map(({ sourceRefs: _sourceRefs, propertyIds: _propertyIds, ...item }) => ({
      ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    })),
    instances: ontology.instances.map(({ sourceRefs: _sourceRefs, stateId: _stateId, ...item }) => ({
      ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    })),
    relations: ontology.relations.map((item) => ({
      id: item.id, sourceId: item.sourceConceptId, targetId: item.targetConceptId,
      type: item.name, metadata: { ...item.metadata, cardinality: item.cardinality }, createdAt: ontology.updatedAt.toISOString(),
    })),
    version: ontology.version, createdAt: ontology.createdAt.toISOString(), updatedAt: ontology.updatedAt.toISOString(),
  };
}

export function projectCanonicalToOntologyModel(ontology: CanonicalOntology): LegacyOntologyModelView {
  const properties = new Map<string, CanonicalProperty[]>();
  ontology.properties.forEach((item) => properties.set(item.conceptId, [...(properties.get(item.conceptId) ?? []), item]));
  return {
    id: ontology.id, name: ontology.name,
    description: ontology.domains.map((domain) => domain.description).filter(Boolean).join('\n'),
    nodes: ontology.concepts.map((concept) => ({
      id: concept.id, name: concept.name, type: concept.type === 'class' ? 'class' : 'entity', description: concept.description,
      children: (properties.get(concept.id) ?? []).map((property) => ({
        id: property.id, name: property.name, type: 'property', description: property.description,
      })),
    })),
    createdAt: ontology.createdAt.getTime(),
  };
}
