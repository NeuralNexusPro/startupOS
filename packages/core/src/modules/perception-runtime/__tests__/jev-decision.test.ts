import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JevDecisionAnswer, PerceptionEventV1, PerceptionTriggerRule } from '../../../types/perception';
import {
  DecisionOrchestrator,
  DecisionReceiptStore,
  ExecutionLeaseStore,
  PerceptionAuditStore,
  PerceptionEventStore,
  PerceptionRouter,
  TriggerRuleStore,
  buildDecisionRequest,
  evaluateDecisionPolicy,
  validateTriggerRule,
} from '..';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of roots.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function root(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-jev-decision-'));
  roots.push(directory);
  return directory;
}

function event(): PerceptionEventV1 {
  return {
    schemaVersion: '1.0', id: 'event-1', source: 'email', sourceEventId: 'source-1', connectorId: 'email-main',
    type: 'mail.received', occurredAt: '2026-09-01T08:00:00.000Z', receivedAt: '2026-09-01T08:00:01.000Z',
    actor: { externalId: 'sender@example.test' }, conversation: { externalId: 'thread-external-1', kind: 'thread' },
    content: {
      subject: 'sender@example.test password=hunter2',
      text: 'thread-external-1 Bearer top-secret-token',
      attachmentRefs: ['RAW-ATTACHMENT-BYTES'],
    },
    provenance: { rawPayloadRef: 'perception://raw/secret-payload' },
  };
}

function rule(): Extract<PerceptionTriggerRule, { routingMode: 'jev' }> {
  return {
    id: 'rule-jev', enabled: true, sources: ['email'], eventTypes: ['mail.received'], conditions: [], routingMode: 'jev',
    decision: {
      catalogVersion: '1.0', policyVersion: '1.0', candidates: [
        { key: 'ignore', action: 'ignore' },
        { key: 'notify_user', action: 'notify_user' },
        { key: 'project:project-1', action: 'dispatch', target: { kind: 'project', id: 'project-1' } },
      ],
    },
    execution: { requireHitl: false, maxAttempts: 1 },
    createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z',
  };
}

function answer(confidence = 0.81, needsHitl = 0, choice = 'project:project-1'): JevDecisionAnswer {
  return {
    providerModel: 'jev-test',
    routeTarget: { choice, confidence, probabilities: { ignore: 0.05, notify_user: 0.04, 'project:project-1': 0.91 } },
    urgency: { score: 0.5, confidence: 0.8, probabilities: { low: 0.2, medium: 0.6, high: 0.2 } },
    risk: { score: 0.2, confidence: 0.9, probabilities: { low: 0.8, medium: 0.1, high: 0.1 } },
    needsHitl,
    retainAsEvidence: 0,
  };
}

describe('Jev decision state and rule boundary', () => {
  it('builds a deterministic minimal state without external ids, raw payload, attachment references, or secrets', () => {
    const candidates = rule().decision.candidates.map((candidate) => ({ candidate }));
    const first = buildDecisionRequest(event(), candidates, 'stable-salt');
    const second = buildDecisionRequest(event(), [...candidates].reverse(), 'stable-salt');
    expect(first).toEqual(second);
    const serialized = JSON.stringify(first);
    for (const secret of ['sender@example.test', 'thread-external-1', 'secret-payload', 'RAW-ATTACHMENT-BYTES', 'hunter2', 'top-secret-token']) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('attachmentCount');
  });

  it('accepts historical direct rules without rewriting and rejects invalid Jev candidate catalogs', () => {
    const dataRoot = root();
    const historical = { ...rule(), routingMode: undefined, decision: undefined, target: { kind: 'project', id: 'project-1' } } as unknown as PerceptionTriggerRule;
    new TriggerRuleStore(dataRoot).save(historical);
    expect(new TriggerRuleStore(dataRoot).get(historical.id)).toEqual(historical);
    expect(() => validateTriggerRule({ ...rule(), decision: { ...rule().decision, candidates: [...rule().decision.candidates, { key: 'ignore', action: 'ignore' }] } })).toThrow('Duplicate');
    const tooMany = Array.from({ length: 21 }, (_, index) => ({ key: `project:p-${index}`, action: 'dispatch' as const, target: { kind: 'project' as const, id: `p-${index}` } }));
    expect(() => validateTriggerRule({ ...rule(), decision: { ...rule().decision, candidates: [{ key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' }, ...tooMany] } })).toThrow('20');
    expect(() => validateTriggerRule({ ...rule(), decision: { ...rule().decision, candidates: [{ key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' }, { key: 'notify_user', action: 'dispatch', target: { kind: 'project', id: 'p-1' } }] } })).toThrow();
  });
});

describe('Jev decision receipts and policy', () => {
  it('uses stable ids, recovers DataFiles, and retains the complete probability distribution', () => {
    const dataRoot = root();
    const store = new DecisionReceiptStore(dataRoot);
    const id = store.stableId('event-1', 'rule-1', '1.0');
    expect(id).toBe(store.stableId('event-1', 'rule-1', '1.0'));
    const now = new Date().toISOString();
    const base = { id, eventId: 'event-1', ruleId: 'rule-1', catalogVersion: '1.0', policyVersion: '1.0', candidateKeys: ['ignore'], threshold: 0.8 as const, status: 'pending' as const, createdAt: now, updatedAt: now };
    store.save(base);
    store.save({ ...base, answers: answer() });
    fs.writeFileSync(path.join(dataRoot, 'perception', 'decisions', `${id}.json`), '{broken');
    expect(store.get(id)?.answers).toBeUndefined();
  });

  it.each([
    [0.81, 0, false, 'dispatch'],
    [0.8, 0, false, 'pending'],
    [0.81, 0.5, false, 'pending'],
    [1, 0, true, 'pending'],
  ] as const)('applies confidence %s, needs_hitl %s, rule HITL %s', (confidence, needsHitl, ruleHitl, expected) => {
    expect(evaluateDecisionPolicy(answer(confidence, needsHitl), rule().decision.candidates, ruleHitl).action).toBe(expected);
  });

  it('fails closed for missing or non-finite probability data', () => {
    const missing = answer();
    delete missing.routeTarget.probabilities.ignore;
    expect(evaluateDecisionPolicy(missing, rule().decision.candidates, false)).toMatchObject({ action: 'pending', reason: 'JEV_INVALID_RESPONSE' });
    const nan = answer();
    nan.routeTarget.confidence = Number.NaN;
    expect(evaluateDecisionPolicy(nan, rule().decision.candidates, false)).toMatchObject({ action: 'pending', reason: 'JEV_INVALID_RESPONSE' });
    const missingNoul = answer() as JevDecisionAnswer & { needsHitl?: number };
    delete missingNoul.needsHitl;
    expect(evaluateDecisionPolicy(missingNoul as JevDecisionAnswer, rule().decision.candidates, false)).toMatchObject({ action: 'pending', reason: 'JEV_INVALID_RESPONSE' });
  });

  it('maps reserved choices without creating dispatch side effects', () => {
    expect(evaluateDecisionPolicy(answer(0.81, 0, 'ignore'), rule().decision.candidates, false)).toMatchObject({ action: 'ignore' });
    expect(evaluateDecisionPolicy(answer(0.81, 0, 'notify_user'), rule().decision.candidates, false)).toMatchObject({ action: 'pending', reason: 'NOTIFY_USER' });
  });
});

describe('PerceptionRouter Jev integration', () => {
  it('decides after authorization, reauthorizes before the shared lease/dispatch path, and restores the terminal receipt', async () => {
    const dataRoot = root();
    const decide = vi.fn(async () => answer());
    const authorize = vi.fn(async () => ({ authorized: true, effectiveToolScope: ['read'] }));
    const dispatch = vi.fn(async () => ({ resultRef: 'perception://session/result-1' }));
    const orchestrator = new DecisionOrchestrator({ decide }, new DecisionReceiptStore(dataRoot), 'stable-salt');
    const router = new PerceptionRouter(dataRoot, { list: () => [rule()] }, { authorize }, { dispatch }, undefined, orchestrator);
    expect(await router.route(event())).toEqual([expect.objectContaining({ status: 'dispatched', resultRef: 'perception://session/result-1' })]);
    expect(await router.route(event())).toEqual([expect.objectContaining({ status: 'duplicate', resultRef: 'perception://session/result-1' })]);
    expect(authorize).toHaveBeenCalledTimes(3);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(new ExecutionLeaseStore(dataRoot).list()).toHaveLength(1);
    const receipt = new DecisionReceiptStore(dataRoot).get(new DecisionReceiptStore(dataRoot).stableId(event().id, rule().id, '1.0'));
    expect(receipt).toMatchObject({
      status: 'auto-executed', resultRef: 'perception://session/result-1',
      answers: { routeTarget: { probabilities: { ignore: 0.05, notify_user: 0.04, 'project:project-1': 0.91 } } },
    });
  });

  it('does not call Jev or acquire a lease when every dispatch candidate is unauthorized', async () => {
    const dataRoot = root();
    const decide = vi.fn(async () => answer());
    const orchestrator = new DecisionOrchestrator({ decide }, new DecisionReceiptStore(dataRoot), 'stable-salt');
    const router = new PerceptionRouter(dataRoot, { list: () => [rule()] }, { authorize: async () => ({ authorized: false }) }, { dispatch: vi.fn() }, undefined, orchestrator);
    expect(await router.route(event())).toEqual([{ ruleId: 'rule-jev', status: 'pending', reason: 'NO_AUTHORIZED_CANDIDATE' }]);
    expect(decide).not.toHaveBeenCalled();
    expect(new ExecutionLeaseStore(dataRoot).list()).toEqual([]);
  });

  it('keeps direct routing unchanged and does not treat decision audit as authorization', async () => {
    const dataRoot = root();
    new PerceptionAuditStore(dataRoot).append({ id: 'audit-1', action: 'decision.resolved', occurredAt: new Date().toISOString(), eventId: 'event-1', detail: { action: 'dispatch' } });
    const direct = { ...rule(), id: 'direct-rule', routingMode: 'direct' as const, decision: undefined, target: { kind: 'project' as const, id: 'project-1' } } as unknown as PerceptionTriggerRule;
    const dispatch = vi.fn(async () => ({ resultRef: 'direct-result' }));
    const router = new PerceptionRouter(dataRoot, { list: () => [direct] }, { authorize: async () => ({ authorized: false, reason: 'denied' }) }, { dispatch });
    expect(await router.route(event())).toEqual([{ ruleId: 'direct-rule', status: 'denied', reason: 'denied' }]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('serializes concurrent manual choices through the same decision lease and restores the first result', async () => {
    const dataRoot = root();
    const eventValue = event();
    const secondTarget = { key: 'project:project-2', action: 'dispatch' as const, target: { kind: 'project' as const, id: 'project-2' } };
    const ruleValue = { ...rule(), decision: { ...rule().decision, candidates: [...rule().decision.candidates, secondTarget] } };
    new PerceptionEventStore(dataRoot).save(eventValue);
    new TriggerRuleStore(dataRoot).save(ruleValue);
    let finish!: () => void;
    const dispatch = vi.fn(() => new Promise<{ resultRef: string }>((resolve) => { finish = () => resolve({ resultRef: 'perception://session/manual-1' }); }));
    const orchestrator = new DecisionOrchestrator({ decide: async () => ({
      ...answer(0.8),
      routeTarget: { choice: 'project:project-1', confidence: 0.8, probabilities: { ignore: 0.02, notify_user: 0.02, 'project:project-1': 0.48, 'project:project-2': 0.48 } },
    }) }, new DecisionReceiptStore(dataRoot), 'stable-salt');
    const router = new PerceptionRouter(dataRoot, new TriggerRuleStore(dataRoot), { authorize: async () => ({ authorized: true }) }, { dispatch }, undefined, orchestrator);
    expect(await router.route(eventValue)).toMatchObject([{ status: 'pending' }]);
    const decisionId = orchestrator.listPending()[0]!.id;
    const first = router.resolveDecision(decisionId, 'project:project-1');
    const second = router.resolveDecision(decisionId, 'project:project-2');
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    finish();
    const results = await Promise.all([first, second]);
    expect(results).toEqual([
      expect.objectContaining({ status: 'dispatched', resultRef: 'perception://session/manual-1' }),
      expect.objectContaining({ status: 'duplicate', resultRef: 'perception://session/manual-1' }),
    ]);
    expect(orchestrator.get(decisionId)).toMatchObject({ status: 'user-executed', selectedKey: 'project:project-1', resultRef: 'perception://session/manual-1' });
    expect(new ExecutionLeaseStore(dataRoot).list()).toHaveLength(1);
  });

  it('reauthorizes manual choices and keeps the receipt pending when the target was revoked', async () => {
    const dataRoot = root();
    const eventValue = event();
    const ruleValue = rule();
    new PerceptionEventStore(dataRoot).save(eventValue);
    new TriggerRuleStore(dataRoot).save(ruleValue);
    let authorized = true;
    const orchestrator = new DecisionOrchestrator({ decide: async () => answer(0.8) }, new DecisionReceiptStore(dataRoot), 'stable-salt');
    const dispatch = vi.fn();
    const router = new PerceptionRouter(dataRoot, new TriggerRuleStore(dataRoot), { authorize: async () => ({ authorized }) }, { dispatch }, undefined, orchestrator);
    await router.route(eventValue);
    authorized = false;
    const decisionId = orchestrator.listPending()[0]!.id;
    expect(await router.resolveDecision(decisionId, 'project:project-1')).toMatchObject({ status: 'pending', reason: 'TARGET_NOT_AUTHORIZED' });
    expect(orchestrator.get(decisionId)).toMatchObject({ status: 'pending', reason: 'TARGET_NOT_AUTHORIZED' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps pending truth unchanged when the advisory notification fails', async () => {
    const dataRoot = root();
    const orchestrator = new DecisionOrchestrator({ decide: async () => answer(0.8) }, new DecisionReceiptStore(dataRoot), 'stable-salt');
    const notify = vi.fn(async () => { throw new Error('native notification failed'); });
    const router = new PerceptionRouter(dataRoot, { list: () => [rule()] }, { authorize: async () => ({ authorized: true }) }, { dispatch: vi.fn() }, undefined, orchestrator, { notify });
    expect(await router.route(event())).toMatchObject([{ status: 'pending' }]);
    expect(notify).toHaveBeenCalledOnce();
    expect(orchestrator.listPending()[0]).toMatchObject({ status: 'pending', reason: 'LOW_CONFIDENCE' });
  });

  it('does not block a direct event from another connector while Jev is failing', async () => {
    const dataRoot = root();
    let reject!: (error: Error) => void;
    const decisions = { decide: vi.fn(() => new Promise<JevDecisionAnswer>((_resolve, fail) => { reject = fail; })) };
    const direct = { ...rule(), id: 'rule-direct', sources: ['wecom' as const], eventTypes: ['message.received' as const], routingMode: 'direct' as const, decision: undefined, target: { kind: 'project' as const, id: 'project-1' } } as unknown as PerceptionTriggerRule;
    const dispatch = vi.fn(async () => ({ resultRef: 'direct-result' }));
    const router = new PerceptionRouter(dataRoot, { list: () => [rule(), direct] }, { authorize: async () => ({ authorized: true }) }, { dispatch }, undefined, new DecisionOrchestrator(decisions, new DecisionReceiptStore(dataRoot), 'stable-salt'));
    const jev = router.route(event());
    await vi.waitFor(() => expect(decisions.decide).toHaveBeenCalledOnce());
    const directEvent = { ...event(), id: 'event-2', source: 'wecom' as const, sourceEventId: 'message-2', connectorId: 'wecom-main', type: 'message.received' as const };
    await expect(router.route(directEvent)).resolves.toMatchObject([{ status: 'dispatched', resultRef: 'direct-result' }]);
    reject(Object.assign(new Error('provider down'), { code: 'JEV_NETWORK_ERROR' }));
    await expect(jev).resolves.toMatchObject([{ status: 'pending', reason: 'JEV_NETWORK_ERROR' }]);
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
