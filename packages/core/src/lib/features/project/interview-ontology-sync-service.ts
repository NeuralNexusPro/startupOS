import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { CANONICAL_ONTOLOGY_AUTHOR_PERMISSION, CANONICAL_ONTOLOGY_SCHEMA_VERSION, CanonicalOntologyAuthoringService, CanonicalOntologyStore, getCanonicalOntologyAuthoringRevision, type CanonicalClassificationSource, type CanonicalConcept, type CanonicalOntology, type CanonicalRelation, type CanonicalSemanticKind, type CanonicalValidationIssue } from '../ontology';
import { Memory } from '../../../modules/memory-core';
import { getDataRoot } from '../../paths';
import { ProjectOntologyEntryService } from './project-ontology-entry-service';

export interface InterviewOntologyConceptInput { name: string; description?: string; type?: 'entity' | 'class'; semanticKind?: CanonicalSemanticKind; }
export interface InterviewOntologyClassificationCorrection { conceptId: string; semanticKind: CanonicalSemanticKind; }
export interface InterviewOntologyRelationInput { name: string; sourceConceptId?: string; targetConceptId?: string; sourceConceptName?: string; targetConceptName?: string; cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many'; description?: string; }
export interface InterviewOntologyObservation { projectId: string; sourceId: string; operationId: string; projectName?: string; domain: { name: string; description?: string }; concepts: readonly InterviewOntologyConceptInput[]; classificationCorrections?: readonly InterviewOntologyClassificationCorrection[]; relations?: readonly InterviewOntologyRelationInput[]; }
export interface InterviewOntologyItemResult { item: 'concept' | 'classification' | 'relation'; index: number; status: 'accepted' | 'rejected' | 'unchanged'; id?: string; issues?: readonly CanonicalValidationIssue[]; }
export interface InterviewOntologySyncResult { ontology: CanonicalOntology; revision: number; results: readonly InterviewOntologyItemResult[]; memoryUpdated: boolean; }
const normal = (value: string) => value.trim().toLocaleLowerCase();
const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const problem = (code: string, path: string, message: string): CanonicalValidationIssue => ({ code, path, message, severity: 'error' });
const labels: Record<CanonicalSemanticKind, string> = { role: '业务角色', organization: '组织', object: '业务对象', activity: '业务活动', document: '文档', standard: '标准', unclassified: '待分类' };

/** Project interview orchestration over the canonical authoring API. */
export class InterviewOntologySyncService {
  private readonly authoring: CanonicalOntologyAuthoringService;
  constructor(private readonly store = new CanonicalOntologyStore(), private readonly entry = new ProjectOntologyEntryService(), private readonly dataRoot = getDataRoot()) { this.authoring = new CanonicalOntologyAuthoringService(store); }

  async record(input: InterviewOntologyObservation): Promise<InterviewOntologySyncResult> {
    if (!input.concepts.length && !input.classificationCorrections?.length && !input.relations?.length) throw new TypeError('At least one concept, classification correction, or relation is required');
    let ontology = await this.ensureOntology(input); let revision = getCanonicalOntologyAuthoringRevision(ontology);
    const results: InterviewOntologyItemResult[] = [];
    const run = async (item: InterviewOntologyItemResult['item'], index: number, command: Parameters<CanonicalOntologyAuthoringService['execute']>[0], entityId: string) => {
      const result = await this.authoring.execute(command);
      if (result.ok === false) { results.push({ item, index, status: 'rejected', issues: result.issues }); return false; }
      ontology = result.ontology; revision = result.receipt.afterRevision; results.push({ item, index, status: 'accepted', id: entityId }); return true;
    };
    for (const [index, concept] of input.concepts.entries()) {
      const name = concept.name.trim(); const matches = ontology.concepts.filter((item) => normal(item.name) === normal(name));
      if (!name || matches.length > 1) { results.push({ item: 'concept', index, status: 'rejected', issues: [problem(!name ? 'INVALID_CONCEPT_NAME' : 'AMBIGUOUS_CONCEPT_NAME', `concepts[${index}].name`, !name ? 'Concept name is required' : `Multiple concepts exactly match ${name}`)] }); continue; }
      if (matches.length) { results.push({ item: 'concept', index, status: 'unchanged', id: matches[0]!.id }); continue; }
      const domain = ontology.domains.find((item) => normal(item.name) === normal(input.domain.name));
      if (!domain) { results.push({ item: 'concept', index, status: 'rejected', issues: [problem('DOMAIN_NOT_FOUND', 'domain.name', 'Interview domain is unavailable')] }); continue; }
      const now = new Date(); const value: CanonicalConcept = { id: id('concept'), domainId: domain.id, name, type: concept.type ?? 'entity', attributes: {}, ...(concept.description?.trim() ? { description: concept.description.trim() } : {}), ...(concept.semanticKind ? { semanticKind: concept.semanticKind, classificationSource: this.source(input.sourceId, 'agent', false) } : {}), sourceRefs: [{ sourceType: 'interview', sourceId: input.sourceId }], createdAt: now, updatedAt: now };
      if (!await run('concept', index, { type: 'concept.create', projectId: input.projectId, ontologyId: ontology.id, ontologyVersion: ontology.version, expectedRevision: revision, operationId: `${input.operationId}:concept:${index}`, permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION], audit: { source: 'project-interview', sourceId: input.sourceId }, value }, value.id)) break;
    }
    for (const [index, correction] of (input.classificationCorrections ?? []).entries()) {
      const concept = ontology.concepts.find((item) => item.id === correction.conceptId);
      if (!concept) { results.push({ item: 'classification', index, status: 'rejected', issues: [problem('AUTHORING_TARGET_NOT_FOUND', `classificationCorrections[${index}].conceptId`, `Unknown concept: ${correction.conceptId}`)] }); continue; }
      if (!await run('classification', index, { type: 'concept.update', projectId: input.projectId, ontologyId: ontology.id, ontologyVersion: ontology.version, expectedRevision: revision, operationId: `${input.operationId}:classification:${index}`, permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION], audit: { source: 'project-interview', sourceId: input.sourceId, userConfirmed: true }, conceptId: concept.id, patch: { semanticKind: correction.semanticKind, classificationSource: this.source(input.sourceId, 'user', true) } }, concept.id)) break;
    }
    for (const [index, relation] of (input.relations ?? []).entries()) {
      const source = this.endpoint(ontology, relation.sourceConceptId, relation.sourceConceptName, `relations[${index}].sourceConcept`); const target = this.endpoint(ontology, relation.targetConceptId, relation.targetConceptName, `relations[${index}].targetConcept`); const issues = [...source.issues, ...target.issues]; const name = relation.name.trim(); if (!name) issues.push(problem('INVALID_RELATION_NAME', `relations[${index}].name`, 'Relation name is required'));
      if (issues.length || !source.concept || !target.concept || !name) { results.push({ item: 'relation', index, status: 'rejected', issues }); continue; }
      const duplicate = ontology.relations.find((item) => item.name === name && item.sourceConceptId === source.concept!.id && item.targetConceptId === target.concept!.id);
      if (duplicate) { results.push({ item: 'relation', index, status: 'unchanged', id: duplicate.id }); continue; }
      const value: CanonicalRelation = { id: id('relation'), name, sourceConceptId: source.concept.id, targetConceptId: target.concept.id, cardinality: relation.cardinality ?? 'many-to-many', ...(relation.description?.trim() ? { description: relation.description.trim() } : {}) };
      if (!await run('relation', index, { type: 'relation.create', projectId: input.projectId, ontologyId: ontology.id, ontologyVersion: ontology.version, expectedRevision: revision, operationId: `${input.operationId}:relation:${index}`, permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION], audit: { source: 'project-interview', sourceId: input.sourceId }, value }, value.id)) break;
    }
    await this.entry.bindCanonicalOntology(input.projectId, ontology);
    return { ontology, revision, results, memoryUpdated: this.memory(input.projectId, ontology, input.sourceId) };
  }

  private async ensureOntology(input: InterviewOntologyObservation): Promise<CanonicalOntology> {
    const existing = await this.store.readOntology(input.projectId); if (existing) return existing.data;
    const now = new Date(); const ontology: CanonicalOntology = { id: `ontology-${input.projectId}`, projectId: input.projectId, name: input.projectName?.trim() || '项目业务模型', schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION, version: '1.0.0', domains: [{ id: id('domain'), name: input.domain.name.trim(), description: input.domain.description?.trim() ?? '', createdAt: now, updatedAt: now }], concepts: [], instances: [], properties: [], relations: [], businessStates: [], transitions: [], factTypes: [], rules: [], actions: [], events: [], projections: [], sourceRefs: [{ sourceType: 'interview', sourceId: input.sourceId }], metadata: { interviewSync: true }, createdAt: now, updatedAt: now };
    await this.entry.initializeCanonicalOntology(input.projectId, ontology); return ontology;
  }
  private endpoint(ontology: CanonicalOntology, stableId: string | undefined, name: string | undefined, path: string): { concept?: CanonicalConcept; issues: CanonicalValidationIssue[] } {
    if (stableId) { const concept = ontology.concepts.find((item) => item.id === stableId); return concept ? { concept, issues: [] } : { issues: [problem('UNKNOWN_CONCEPT_ENDPOINT', `${path}Id`, `Unknown concept ID: ${stableId}`)] }; }
    if (!name) return { issues: [problem('MISSING_CONCEPT_ENDPOINT', path, 'A stable concept ID is required')] };
    const matches = ontology.concepts.filter((item) => normal(item.name) === normal(name));
    return matches.length === 1 ? { concept: matches[0], issues: [] } : { issues: [problem(matches.length ? 'AMBIGUOUS_CONCEPT_NAME' : 'UNKNOWN_CONCEPT_ENDPOINT', path, matches.length ? `Multiple concepts exactly match ${name}` : `Unknown concept name: ${name}`)] };
  }
  private source(sourceId: string, classifiedBy: 'agent' | 'user', userConfirmed: boolean): CanonicalClassificationSource { return { sourceRef: { sourceType: 'interview', sourceId }, classifiedBy, userConfirmed }; }
  private memory(projectId: string, ontology: CanonicalOntology, sourceId: string): boolean { try { const memory = new Memory(path.join(this.dataRoot, 'projects', projectId)); const concepts = ontology.concepts.map((item) => `- ${item.name}（${labels[item.semanticKind ?? 'unclassified']}；来源：${item.classificationSource?.sourceRef?.sourceId ?? sourceId}）`).join('\n') || '（尚未识别业务概念）'; const names = new Map(ontology.concepts.map((item) => [item.id, item.name])); const relations = ontology.relations.map((item) => `- ${names.get(item.sourceConceptId) ?? '未知'} ${item.name} ${names.get(item.targetConceptId) ?? '未知'}`).join('\n') || '（尚未识别联系）'; this.block(memory, '已识别业务概念', '当前项目的业务概念与分类摘要', concepts); this.block(memory, '已识别关系', '当前项目的业务概念联系摘要', relations); return true; } catch { return false; } }
  private block(memory: Memory, label: string, description: string, value: string): void { const existing = memory.getBlock(label); if (existing) memory.setBlock(label, value.slice(0, existing.limit)); else memory.createBlock({ label, description, limit: 2000, namespace: 'interview' }, value.slice(0, 2000)); }
}
