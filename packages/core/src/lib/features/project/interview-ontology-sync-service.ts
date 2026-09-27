import { randomUUID } from 'node:crypto';
import path from 'node:path';

import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  CanonicalOntologyStore,
  type CanonicalOntology,
} from '../ontology';
import { Memory } from '../../../modules/memory-core';
import { getDataRoot } from '../../paths';
import { ProjectOntologyEntryService } from './project-ontology-entry-service';

export interface InterviewOntologyConceptInput {
  name: string;
  description?: string;
  type?: 'entity' | 'class';
}

export interface InterviewOntologyRelationInput {
  name: string;
  sourceConceptName: string;
  targetConceptName: string;
  cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  description?: string;
}

export interface InterviewOntologyObservation {
  projectId: string;
  sourceId: string;
  projectName?: string;
  domain: { name: string; description?: string };
  concepts: readonly InterviewOntologyConceptInput[];
  relations?: readonly InterviewOntologyRelationInput[];
}

const normalized = (value: string): string => value.trim().toLocaleLowerCase();
const stableId = (prefix: string): string => `${prefix}-${randomUUID()}`;

/**
 * The only write path used by project interviews. It creates and binds the
 * initial canonical ontology on the first confirmed observation, then merges
 * later observations without consulting any legacy interview artifact.
 */
export class InterviewOntologySyncService {
  constructor(
    private readonly store = new CanonicalOntologyStore(),
    private readonly entry = new ProjectOntologyEntryService(),
    private readonly dataRoot = getDataRoot(),
  ) {}

  async record(observation: InterviewOntologyObservation): Promise<CanonicalOntology> {
    const now = new Date();
    const existing = await this.store.readOntology(observation.projectId);
    const ontology = existing?.data ?? this.createInitial(observation, now);
    const domain = ontology.domains.find((item) => normalized(item.name) === normalized(observation.domain.name));
    const domainId = domain?.id ?? stableId('domain');

    if (!domain) {
      ontology.domains.push({
        id: domainId,
        name: observation.domain.name.trim(),
        description: observation.domain.description?.trim() ?? '',
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const input of observation.concepts) {
      const name = input.name.trim();
      if (!name || ontology.concepts.some((item) => normalized(item.name) === normalized(name))) continue;
      ontology.concepts.push({
        id: stableId('concept'), domainId, name, type: input.type ?? 'entity', attributes: {},
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        sourceRefs: [{ sourceType: 'interview', sourceId: observation.sourceId }],
        createdAt: now, updatedAt: now,
      });
    }

    const conceptsByName = new Map(ontology.concepts.map((item) => [normalized(item.name), item]));
    for (const input of observation.relations ?? []) {
      const source = conceptsByName.get(normalized(input.sourceConceptName));
      const target = conceptsByName.get(normalized(input.targetConceptName));
      const name = input.name.trim();
      if (!source || !target || !name) continue;
      if (ontology.relations.some((item) => item.name === name && item.sourceConceptId === source.id && item.targetConceptId === target.id)) continue;
      ontology.relations.push({
        id: stableId('relation'), name, sourceConceptId: source.id, targetConceptId: target.id,
        cardinality: input.cardinality ?? 'many-to-many',
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      });
    }

    ontology.updatedAt = now;
    if (!existing) {
      await this.entry.initializeCanonicalOntology(observation.projectId, ontology);
    } else {
      await this.store.writeOntology(observation.projectId, ontology);
    }
    // Existing interview projects may already have an unbound canonical snapshot.
    // Binding on every successful sync is idempotent and makes the UI's project
    // entry resolve the same snapshot immediately.
    await this.entry.bindCanonicalOntology(observation.projectId, ontology);
    this.syncInterviewMemory(observation.projectId, ontology);
    return ontology;
  }

  /** Keep interview facts readable as durable project memory alongside canonical data. */
  private syncInterviewMemory(projectId: string, ontology: CanonicalOntology): void {
    const memory = new Memory(path.join(this.dataRoot, 'projects', projectId));
    const concepts = ontology.concepts
      .map((concept) => `- ${concept.name}${concept.description ? `：${concept.description}` : ''}`)
      .join('\n') || '（尚未识别实体）';
    const conceptNames = new Map(ontology.concepts.map((concept) => [concept.id, concept.name]));
    const relations = ontology.relations
      .map((relation) => `- ${conceptNames.get(relation.sourceConceptId) ?? '未知'} ${relation.name} ${conceptNames.get(relation.targetConceptId) ?? '未知'}${relation.description ? `：${relation.description}` : ''}`)
      .join('\n') || '（尚未识别关系）';

    this.setMemoryBlock(memory, '已识别实体', '访谈过程中确认的业务实体', concepts);
    this.setMemoryBlock(memory, '已识别关系', '访谈过程中确认的实体关系', relations);
  }

  private setMemoryBlock(memory: Memory, label: string, description: string, value: string): void {
    const existing = memory.getBlock(label);
    if (existing) {
      memory.setBlock(label, value.slice(0, existing.limit));
      return;
    }
    memory.createBlock({ label, description, limit: 2_000, namespace: 'interview' }, value.slice(0, 2_000));
  }

  private createInitial(observation: InterviewOntologyObservation, now: Date): CanonicalOntology {
    return {
      id: `ontology-${observation.projectId}`,
      projectId: observation.projectId,
      name: observation.projectName?.trim() || '项目业务模型',
      schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
      version: '1.0.0', domains: [], concepts: [], instances: [], properties: [], relations: [],
      businessStates: [], transitions: [], factTypes: [], rules: [], actions: [], events: [], projections: [],
      sourceRefs: [{ sourceType: 'interview', sourceId: observation.sourceId }],
      metadata: { interviewSync: true }, createdAt: now, updatedAt: now,
    };
  }
}
