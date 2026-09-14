import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CognitionBank,
  ObservationEngine,
  MentalModelStore,
  CognitionCandidateRouter,
  ObservationPolicyResolver,
} from '../bank';

let dataRoot: string;

beforeEach(() => {
  dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-observation-'));
});

afterEach(() => {
  fs.rmSync(dataRoot, { recursive: true, force: true });
});

const evidence = (id: string, source: 'conversation' | 'document' = 'conversation') => ({
  id,
  source,
  sourceId: 'session-1',
  excerpt: id,
  observedAt: '2026-09-09T00:00:00.000Z',
});

describe('ObservationPolicyResolver', () => {
  it('resolves RoleAgent and Project to distinct policies', () => {
    const resolver = new ObservationPolicyResolver();
    const role = resolver.resolve({ entryType: 'role-agent', sessionId: 's1', agentId: 'researcher' });
    const project = resolver.resolve({ entryType: 'project', sessionId: 's1', projectId: 'startup' });

    expect(role.policy).toMatchObject({ conflictMode: 'conflict', patternApplicability: 'role-wide', promptTemplateId: 'observation.role-agent.v1' });
    expect(project.policy).toMatchObject({ conflictMode: 'supersede', patternApplicability: 'project-local', promptTemplateId: 'observation.project.v1' });
  });

  it('forces a skill without caller ownership to ephemeral standalone mode', () => {
    const context = new ObservationPolicyResolver().resolve({
      entryType: 'skill',
      sessionId: 'skill-session',
      skillId: 'summarizer',
    });

    expect(context).toMatchObject({ mode: 'standalone-skill', persistent: false, owner: { scope: 'session' } });
    expect(context.policy).toMatchObject({ allowPatternPromotion: false, temporalMode: 'ephemeral', patternApplicability: 'none' });
  });

  it('inherits the explicit caller owner and policy for nested skills', () => {
    const context = new ObservationPolicyResolver().resolve({
      entryType: 'skill',
      sessionId: 'skill-session',
      skillId: 'analyzer',
      callerOwner: { scope: 'project', ownerId: 'project-1' },
      callerMode: 'project',
    });

    expect(context).toMatchObject({ mode: 'inherited-skill', persistent: true, owner: { scope: 'project', ownerId: 'project-1' } });
    expect(context.policy.patternApplicability).toBe('project-local');
  });
});

describe('ObservationEngine', () => {
  it('retains both sides of conflicting evidence without silent overwrite', () => {
    const bank = new CognitionBank({ scope: 'user', ownerId: 'default', dataRoot });
    const policy = new ObservationPolicyResolver().resolve({ entryType: 'role-agent', sessionId: 's1', agentId: 'a1' }).policy;
    const engine = new ObservationEngine();
    const original = engine.fold(bank, { kind: 'observation', content: '用户偏好简洁回答', confidence: 0.8, evidence: evidence('turn-1', 'document') }, policy);
    const conflicting = engine.fold(bank, {
      kind: 'observation',
      content: '用户偏好详细回答',
      confidence: 0.8,
      evidence: evidence('turn-2'),
      relation: { type: 'conflict', targetRecordId: original.id },
    }, policy);

    expect(bank.list()).toHaveLength(2);
    expect(bank.get(original.id)).toMatchObject({ status: 'conflicted', conflictsWith: [conflicting.id] });
    expect(conflicting).toMatchObject({ status: 'conflicted', conflictsWith: [original.id] });
  });

  it('closes project fact validity and links a superseding decision', () => {
    const bank = new CognitionBank({ scope: 'project', ownerId: 'project-1', dataRoot });
    const policy = new ObservationPolicyResolver().resolve({ entryType: 'project', sessionId: 's1', projectId: 'project-1' }).policy;
    const engine = new ObservationEngine();
    const oldDecision = engine.fold(bank, { kind: 'world_fact', content: 'Release target is 0.2.0', evidence: evidence('decision-1', 'document') }, policy);
    const replacement = engine.fold(bank, {
      kind: 'world_fact',
      content: 'Release target is 0.2.1',
      evidence: evidence('decision-2', 'document'),
      validFrom: '2026-09-09T01:00:00.000Z',
      relation: { type: 'supersede', targetRecordId: oldDecision.id },
    }, policy);

    expect(bank.get(oldDecision.id)).toMatchObject({ status: 'retracted', validTo: '2026-09-09T01:00:00.000Z' });
    expect(replacement).toMatchObject({ status: 'active', supersedes: [oldDecision.id] });
  });
});

describe('MentalModelStore', () => {
  it('materializes and reads a bounded user profile snapshot without an LLM', () => {
    const bank = new CognitionBank({ scope: 'user', ownerId: 'default', dataRoot });
    bank.retain({
      kind: 'observation',
      content: '用户偏好简洁中文回答',
      status: 'active',
      confidence: 0.9,
      evidence: evidence('confirmed-preference', 'document'),
    });
    bank.retain({
      kind: 'world_fact',
      content: '不应进入用户画像的世界事实',
      status: 'active',
      evidence: evidence('world-fact', 'document'),
    });
    const store = new MentalModelStore(100);

    const snapshot = store.refreshUserProfile(bank);
    const restored = store.read(bank, 'user-profile');

    expect(snapshot.data.content).toContain('简洁中文回答');
    expect(snapshot.data.content).not.toContain('世界事实');
    expect(restored).toEqual(snapshot);
    expect(fs.existsSync(path.join(bank.directory, 'snapshots', 'user-profile.json'))).toBe(true);
  });

  it('materializes an owner world model and enforces the prompt budget', () => {
    const bank = new CognitionBank({ scope: 'agent', ownerId: 'researcher', dataRoot });
    bank.retain({ kind: 'world_fact', content: 'short fact', status: 'active', confidence: 1, evidence: evidence('fact-1', 'document') });
    bank.retain({ kind: 'observation', content: 'x'.repeat(80), status: 'active', confidence: 0.5, evidence: evidence('fact-2', 'document') });

    const snapshot = new MentalModelStore(30).refreshWorldModel(bank);

    expect(snapshot.data).toMatchObject({ model: 'world-model', scope: 'agent', ownerId: 'researcher' });
    expect(snapshot.data.content).toContain('short fact');
    expect(snapshot.data.content).not.toContain('x'.repeat(20));
  });
});

describe('CognitionCandidateRouter', () => {
  it('routes knowledge and pattern evidence with ownership and source skill provenance', async () => {
    const bank = new CognitionBank({ scope: 'project', ownerId: 'project-1', dataRoot });
    bank.retain({ kind: 'world_fact', content: 'Project uses local JSON', status: 'active', evidence: evidence('fact', 'document') });
    bank.retain({ kind: 'experience', content: 'read_file succeeded', status: 'active', tags: ['tool-success'], evidence: evidence('experience') });
    const knowledge = { ingestCognitionCandidates: async (candidates: unknown[]) => candidates };
    const pattern = { ingestPatternEvidence: async (candidates: unknown[]) => candidates };
    const knowledgeSpy = vi.spyOn(knowledge, 'ingestCognitionCandidates');
    const patternSpy = vi.spyOn(pattern, 'ingestPatternEvidence');
    const context = new ObservationPolicyResolver().resolve({
      entryType: 'skill',
      sessionId: 's1',
      skillId: 'analyzer',
      callerOwner: { scope: 'project', ownerId: 'project-1' },
      callerMode: 'project',
    });

    await new CognitionCandidateRouter({ knowledge, pattern }).route(bank.list(), context);

    expect(knowledgeSpy).toHaveBeenCalledWith([expect.objectContaining({ ownerScope: 'project', ownerId: 'project-1', sourceSkillId: 'analyzer', proofCount: 1 })]);
    expect(patternSpy).toHaveBeenCalledWith([expect.objectContaining({ applicability: 'project-local', sourceSkillId: 'analyzer', polarity: 'positive' })]);
  });

  it('does not persist candidates for standalone skills', async () => {
    const knowledge = { ingestCognitionCandidates: vi.fn(async () => undefined) };
    const pattern = { ingestPatternEvidence: vi.fn(async () => undefined) };
    const context = new ObservationPolicyResolver().resolve({ entryType: 'skill', sessionId: 's1', skillId: 'standalone' });

    await new CognitionCandidateRouter({ knowledge, pattern }).route([], context);

    expect(knowledge.ingestCognitionCandidates).not.toHaveBeenCalled();
    expect(pattern.ingestPatternEvidence).not.toHaveBeenCalled();
  });
});
