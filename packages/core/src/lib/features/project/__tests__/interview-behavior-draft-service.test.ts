import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  CanonicalOntologyStore,
  type CanonicalOntology,
} from '../../ontology';
import {
  InterviewBehaviorDraftService,
  hashInterviewBehaviorCandidates,
  type InterviewBehaviorCandidates,
} from '../interview-behavior-draft-service';

const roots: string[] = [];
const instant = new Date('2026-09-28T00:00:00.000Z');

function ontology(projectId: string): CanonicalOntology {
  return {
    id: `ontology-${projectId}`, projectId, name: '质量项目', schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION, version: '1.0.0',
    domains: [{ id: 'quality', name: '质量', description: '', createdAt: instant, updatedAt: instant }],
    concepts: [{ id: 'batch', domainId: 'quality', name: '来料批次', type: 'entity', attributes: {}, createdAt: instant, updatedAt: instant }],
    instances: [], properties: [], relations: [], businessStates: [], transitions: [], factTypes: [], rules: [], actions: [], events: [], projections: [], createdAt: instant, updatedAt: instant,
  };
}

function candidates(): InterviewBehaviorCandidates {
  return {
    factTypes: [{ id: 'inspection-fact', conceptId: 'batch', name: '检验记录', propertyIds: [] }],
    businessStates: [{ id: 'pending', conceptId: 'batch', name: '待检', initial: true }, { id: 'qualified', conceptId: 'batch', name: '合格' }],
    rules: [{ id: 'inspect-first', name: '检验合格后入库', kind: 'precondition', expression: { factTypeId: 'inspection-fact' }, severity: 'error' }],
    actions: [{ id: 'inspect', name: '检验来料', conceptId: 'batch', inputFactTypeIds: [], outputFactTypeIds: ['inspection-fact'], fromStateIds: ['pending'], toStateId: 'qualified', ruleIds: ['inspect-first'], permissions: ['quality:inspect'] }],
    transitions: [{ id: 'inspection-transition', conceptId: 'batch', name: '完成检验', fromStateId: 'pending', toStateId: 'qualified', actionId: 'inspect', ruleIds: ['inspect-first'] }],
  };
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'originos-behavior-draft-'));
  roots.push(root);
  const projectId = 'project-1';
  const store = new CanonicalOntologyStore(root);
  await store.writeOntology(projectId, ontology(projectId), { createOnly: true });
  return { root, projectId, store, service: new InterviewBehaviorDraftService(store, root) };
}

async function saveReady(service: InterviewBehaviorDraftService, projectId: string) {
  return service.save({
    projectId, sourceId: 'session-a', ontologyId: `ontology-${projectId}`, ontologyVersion: '1.0.0', baseRevision: 0,
    sourceMessageRefs: [{ messageId: 'message-1' }], candidates: candidates(), knownPermissionIds: ['quality:inspect'],
  });
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('InterviewBehaviorDraftService', () => {
  it('keeps unknown action permissions as a clarification and blocks publication', async () => {
    const { service, projectId, store } = await setup();
    const saved = await service.save({
      projectId, sourceId: 'session-a', ontologyId: `ontology-${projectId}`, ontologyVersion: '1.0.0', baseRevision: 0,
      sourceMessageRefs: [{ messageId: 'message-1' }], candidates: candidates(), knownPermissionIds: [],
    });
    expect(saved).toMatchObject({ ok: true, draft: { status: 'collecting', clarifications: [expect.objectContaining({ kind: 'permission', resolved: false })] } });
    if (!saved.ok) return;
    expect(await service.publish(projectId, 'session-a', saved.draft.id, saved.draft.draftRevision, saved.draft.candidateHash, 'publish-1')).toMatchObject({ ok: false, code: 'TRUSTED_CONFIRMATION_REQUIRED' });
    expect((await store.readOntology(projectId))!.data.actions).toEqual([]);
  });

  it('keeps an incomplete behavior contract collecting and lists every uncovered concept', async () => {
    const { service, projectId } = await setup();
    const incomplete: InterviewBehaviorCandidates = { ...candidates(), factTypes: [] };
    const saved = await service.save({
      projectId,
      sourceId: 'session-a',
      ontologyId: `ontology-${projectId}`,
      ontologyVersion: '1.0.0',
      baseRevision: 0,
      sourceMessageRefs: [{ messageId: 'message-1' }],
      candidates: incomplete,
      knownPermissionIds: ['quality:inspect'],
    });

    expect(saved).toMatchObject({
      ok: true,
      draft: {
        status: 'collecting',
        clarifications: [expect.objectContaining({
          id: 'fact-type-required:batch',
          kind: 'business_meaning',
          resolved: false,
        })],
      },
    });
  });

  it('revalidates a historical ready draft before review or confirmation', async () => {
    const { root, service, projectId } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    const draftPath = path.join(root, 'projects', projectId, 'interview', 'behavior-drafts', `${saved.draft.id}.json`);
    const historical = JSON.parse(await readFile(draftPath, 'utf8')) as Record<string, unknown>;
    const historicalCandidates = historical['candidates'] as Record<string, unknown>;
    historicalCandidates['factTypes'] = [];
    historical['status'] = 'ready';
    historical['clarifications'] = [];
    historical['candidateHash'] = hashInterviewBehaviorCandidates(historicalCandidates as unknown as InterviewBehaviorCandidates);
    await writeFile(draftPath, JSON.stringify(historical), 'utf8');

    expect(await service.review(projectId, 'session-a', saved.draft.id)).toMatchObject({
      ok: true,
      draft: {
        status: 'collecting',
        confirmation: undefined,
        clarifications: [expect.objectContaining({ id: 'fact-type-required:batch' })],
      },
    });
    expect(await service.confirmFromTrustedUi(projectId, 'session-a', saved.draft.id, 'confirm-incomplete')).toMatchObject({
      ok: false,
      code: 'DRAFT_NOT_READY',
    });
  });

  it('repairs and publishes a historical business-language draft through canonical bindings', async () => {
    const { root, service, projectId, store } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    const draftPath = path.join(root, 'projects', projectId, 'interview', 'behavior-drafts', `${saved.draft.id}.json`);
    const historical = JSON.parse(await readFile(draftPath, 'utf8')) as Record<string, unknown>;
    const looseCandidates = {
      factTypes: [{ conceptName: '来料批次', name: '来料记录', fields: [] }],
      businessStates: [
        { conceptName: '来料批次', name: '待检', initial: true },
        { conceptName: '来料批次', name: '合格', terminal: true },
      ],
      rules: [{ name: '检验通过才可入库', condition: '检验结果为通过', action: '允许入库' }],
      actions: [{ name: '记录来料批次', description: '为来料批次生成来料记录' }],
      transitions: [{ conceptName: '来料批次', name: '完成检验', fromState: '待检', toState: '合格' }],
    } as unknown as InterviewBehaviorCandidates;
    historical['candidates'] = looseCandidates;
    historical['candidateHash'] = hashInterviewBehaviorCandidates(looseCandidates);
    historical['status'] = 'needs_review';
    historical['clarifications'] = [];
    historical['confirmation'] = undefined;
    await writeFile(draftPath, JSON.stringify(historical), 'utf8');

    const review = await service.review(projectId, 'session-a', saved.draft.id);
    expect(review).toMatchObject({ ok: true, draft: { status: 'ready' } });
    if (!review.ok) throw new Error('review failed');
    const published = await service.confirmAndPublishFromTrustedUi({
      projectId,
      sourceId: 'session-a',
      draftId: saved.draft.id,
      expectedDraftRevision: review.draft.draftRevision,
      candidateHash: review.draft.candidateHash,
      confirmationId: 'confirm-legacy',
      operationId: 'publish-legacy',
    });

    expect(published).toMatchObject({ ok: true, draft: { status: 'published' } });
    const ontologyAfter = (await store.readOntology(projectId))!.data;
    expect(ontologyAfter.factTypes).toEqual([expect.objectContaining({ conceptId: 'batch', name: '来料记录', propertyIds: [] })]);
    expect(ontologyAfter.actions).toEqual([expect.objectContaining({ conceptId: 'batch', name: '记录来料批次' })]);
    expect(ontologyAfter.rules).toEqual([expect.objectContaining({ name: '检验通过才可入库' })]);
    expect(ontologyAfter.transitions).toEqual([expect.objectContaining({ conceptId: 'batch' })]);
  });

  it('requires matching revision and candidate hash before a canonical write', async () => {
    const { service, projectId, store } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    await service.confirmFromTrustedUi(projectId, 'session-a', saved.draft.id, 'ui-confirm-1');
    const failed = await service.publish(projectId, 'session-a', saved.draft.id, saved.draft.draftRevision + 1, saved.draft.candidateHash, 'publish-1');
    expect(failed).toMatchObject({ ok: false, code: 'DRAFT_CONTENT_MISMATCH' });
    expect((await store.readOntology(projectId))!.data.rules).toEqual([]);
  });

  it('publishes a confirmed draft atomically and recovers an operation retry', async () => {
    const { service, projectId, store } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    const confirmed = await service.confirmFromTrustedUi(projectId, 'session-a', saved.draft.id, 'ui-confirm-1'); if (!confirmed.ok) throw new Error('confirm failed');
    const published = await service.publish(projectId, 'session-a', saved.draft.id, confirmed.draft.draftRevision, confirmed.draft.candidateHash, 'publish-1');
    expect(published).toMatchObject({ ok: true, draft: { status: 'published', publication: { operationId: 'publish-1', beforeRevision: 0, afterRevision: 1 } } });
    expect((await store.readOntology(projectId))!.data).toMatchObject({ actions: [expect.objectContaining({ id: 'inspect' })], rules: [expect.objectContaining({ id: 'inspect-first' })] });
    expect(await service.publish(projectId, 'session-a', saved.draft.id, confirmed.draft.draftRevision, confirmed.draft.candidateHash, 'publish-1')).toMatchObject({ ok: true, recovered: true });
  });

  it('publishes only after the trusted UI supplies the exact review identity', async () => {
    const { service, projectId, store } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    const stale = await service.confirmAndPublishFromTrustedUi({
      projectId, sourceId: 'session-a', draftId: saved.draft.id,
      expectedDraftRevision: saved.draft.draftRevision + 1,
      candidateHash: saved.draft.candidateHash,
      confirmationId: 'ui-confirm-stale', operationId: 'publish-ui-stale',
    });
    expect(stale).toMatchObject({ ok: false, code: 'DRAFT_CONTENT_MISMATCH' });
    expect((await store.readOntology(projectId))!.data.actions).toEqual([]);

    const published = await service.confirmAndPublishFromTrustedUi({
      projectId, sourceId: 'session-a', draftId: saved.draft.id,
      expectedDraftRevision: saved.draft.draftRevision,
      candidateHash: saved.draft.candidateHash,
      confirmationId: 'ui-confirm-current', operationId: 'publish-ui-current',
    });
    expect(published).toMatchObject({ ok: true, draft: { status: 'published', confirmation: { kind: 'trusted_ui' } } });
    expect((await store.readOntology(projectId))!.data.actions).toEqual([expect.objectContaining({ id: 'inspect' })]);
  });

  it('isolates a draft by interview source and marks it for review when ontology changes', async () => {
    const { service, projectId, store } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    expect(await service.review(projectId, 'session-b', saved.draft.id)).toMatchObject({ ok: false, code: 'DRAFT_SOURCE_MISMATCH' });
    const current = (await store.readOntology(projectId))!.data;
    await store.writeOntology(projectId, { ...current, metadata: { 'originos.authoringRevision': 1 } });
    await service.confirmFromTrustedUi(projectId, 'session-a', saved.draft.id, 'ui-confirm-1');
    const failed = await service.publish(projectId, 'session-a', saved.draft.id, saved.draft.draftRevision, saved.draft.candidateHash, 'publish-1');
    expect(failed).toMatchObject({ ok: false, code: 'ONTOLOGY_REVISION_CONFLICT', draft: { status: 'needs_review' } });
  });

  it('binds a saved draft to the revision read by the trusted service', async () => {
    const { service, projectId, store } = await setup();
    const current = (await store.readOntology(projectId))!.data;
    await store.writeOntology(projectId, { ...current, metadata: { 'originos.authoringRevision': 7 } });

    const saved = await saveReady(service, projectId);

    expect(saved).toMatchObject({ ok: true, draft: { baseRevision: 7, status: 'ready' } });
  });

  it('reviewLatest prefers the exact source and falls back to the latest legacy draft', async () => {
    const { service, projectId } = await setup();
    // UI queries with its own session id; the draft was saved by the model with a stale id.
    expect(await service.reviewLatest(projectId, 'project-initialization-1')).toMatchObject({ ok: false, code: 'DRAFT_NOT_FOUND' });

    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    expect(await service.reviewLatest(projectId, 'session-a')).toMatchObject({ ok: true, draft: { id: saved.draft.id } });
    expect(await service.reviewLatest(projectId, 'project-initialization-1')).toMatchObject({ ok: true, draft: { id: saved.draft.id } });

    const second = await service.save({
      projectId, sourceId: 'project-initialization-1', ontologyId: `ontology-${projectId}`, ontologyVersion: '1.0.0', baseRevision: 0,
      sourceMessageRefs: [{ messageId: 'message-2' }], candidates: candidates(), knownPermissionIds: ['quality:inspect'],
    });
    if (!second.ok) throw new Error('second save failed');
    expect(await service.reviewLatest(projectId, 'session-a')).toMatchObject({ ok: true, draft: { id: saved.draft.id } });
    expect(await service.reviewLatest(projectId, 'project-initialization-1')).toMatchObject({ ok: true, draft: { id: second.draft.id } });
  });

  it('reads a historical UTF-8 BOM draft without blocking project restoration', async () => {
    const { root, service, projectId } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    const draftPath = path.join(root, 'projects', projectId, 'interview', 'behavior-drafts', `${saved.draft.id}.json`);
    const content = await readFile(draftPath, 'utf8');
    await writeFile(draftPath, `\uFEFF${content}`, 'utf8');

    expect(await service.reviewLatest(projectId, 'session-a')).toMatchObject({
      ok: true,
      draft: { id: saved.draft.id },
    });
  });

  it('ignores a BOM-prefixed intermediate behavior file that is not a review draft', async () => {
    const { root, service, projectId } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    const legacyPath = path.join(root, 'projects', projectId, 'interview', 'behavior-drafts', '中间行为模型.json');
    await writeFile(legacyPath, '\uFEFF{"facts":[],"states":[],"actions":[],"transitions":[],"rules":[]}', 'utf8');

    expect(await service.reviewLatest(projectId, 'session-a')).toMatchObject({
      ok: true,
      draft: { id: saved.draft.id },
    });
  });

  it('normalizes historical facts and states candidate names for read-only review', async () => {
    const { root, service, projectId } = await setup();
    const saved = await saveReady(service, projectId); if (!saved.ok) throw new Error('save failed');
    const draftPath = path.join(root, 'projects', projectId, 'interview', 'behavior-drafts', `${saved.draft.id}.json`);
    const historical = JSON.parse(await readFile(draftPath, 'utf8')) as Record<string, unknown>;
    const currentCandidates = historical['candidates'] as Record<string, unknown>;
    historical['candidates'] = {
      actions: currentCandidates['actions'],
      facts: currentCandidates['factTypes'],
      states: currentCandidates['businessStates'],
      transitions: currentCandidates['transitions'],
      rules: currentCandidates['rules'],
    };
    await writeFile(draftPath, JSON.stringify(historical), 'utf8');

    const reviewed = await service.reviewLatest(projectId, 'session-a');
    expect(reviewed).toMatchObject({ ok: true, draft: { id: saved.draft.id } });
    if (!reviewed.ok) throw new Error('review failed');
    expect(reviewed.draft.candidates.factTypes[0]).toMatchObject({ id: 'inspection-fact' });
    expect(reviewed.draft.candidates.businessStates[0]).toMatchObject({ id: 'pending' });
  });
});
