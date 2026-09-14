import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PerceptionEventV1,
  PerceptionTriggerRule,
  TargetAuthorizationPort,
  TriggerExecutionPort,
} from '../../../types/perception';
import {
  ExecutionLeaseStore,
  ExternalTriggerGrantStore,
  FileTargetAuthorizationPort,
  PerceptionEventStore,
  PerceptionRetryRouterHandler,
  PerceptionRouter,
  TriggerRuleStore,
  matchesTriggerRule,
  validateTriggerRule,
} from '..';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-routing-'));
  roots.push(value);
  return value;
}
function event(): PerceptionEventV1 {
  return {
    schemaVersion: '1.0', id: 'event-1', source: 'email', sourceEventId: 'mail:1', connectorId: 'email-main',
    type: 'mail.received', occurredAt: '2026-08-28T08:00:00.000Z', receivedAt: '2026-08-28T08:00:01.000Z',
    actor: { externalId: 'sender@example.test' }, conversation: { externalId: 'INBOX', kind: 'thread' },
    content: { subject: 'Urgent invoice', text: 'Please review invoice 42' },
    provenance: { rawPayloadRef: 'perception://inbox/email-main/inbox-1' },
  };
}
function rule(overrides: Partial<PerceptionTriggerRule> = {}): PerceptionTriggerRule {
  return {
    id: 'rule-1', enabled: true, sources: ['email'], eventTypes: ['mail.received'],
    conditions: [{ path: 'content.subject', operator: 'startsWith', value: 'Urgent' }],
    target: { kind: 'project', id: 'project-1' },
    execution: { requireHitl: true, maxAttempts: 3 },
    createdAt: '2026-08-28T08:00:00.000Z', updatedAt: '2026-08-28T08:00:00.000Z',
    ...overrides,
  };
}

describe('Trigger rules', () => {
  it('persists valid rules and matches only the safe field/operator whitelist', () => {
    const store = new TriggerRuleStore(root());
    store.save(rule());
    expect(store.list()).toHaveLength(1);
    expect(matchesTriggerRule(rule(), event())).toBe(true);
    expect(matchesTriggerRule(rule({ enabled: false }), event())).toBe(false);
    expect(matchesTriggerRule(rule({ conditions: [{ path: 'content.text', operator: 'contains', value: 'invoice' }] }), event())).toBe(true);
  });

  it('rejects unsupported paths, missing values, and ambiguous Skill ownership', () => {
    const unsafe = { ...rule(), conditions: [{ path: 'constructor.prototype', operator: 'equals', value: 'x' }] } as unknown as PerceptionTriggerRule;
    expect(() => validateTriggerRule(unsafe)).toThrow('Unsupported');
    expect(() => validateTriggerRule(rule({ conditions: [{ path: 'content.text', operator: 'contains' }] }))).toThrow('value');
    expect(() => validateTriggerRule(rule({ target: { kind: 'skill', id: 'skill-1' } }))).toThrow('ownership');
  });
});

describe('PerceptionRouter', () => {
  it('authorizes before lease, dispatches once, and reuses the completed lease', async () => {
    const dataRoot = root();
    const authorization: TargetAuthorizationPort = { authorize: vi.fn(async () => ({ authorized: true })) };
    const execution: TriggerExecutionPort = { dispatch: vi.fn(async () => ({ resultRef: 'perception://session/session-1', sessionId: 'session-1' })) };
    const router = new PerceptionRouter(dataRoot, { list: () => [rule()] }, authorization, execution);
    const first = await router.route(event());
    const second = await router.route(event());
    expect(first[0]).toMatchObject({ status: 'dispatched', resultRef: 'perception://session/session-1' });
    expect(second[0]).toMatchObject({ status: 'duplicate', leaseId: first[0]?.leaseId });
    expect(execution.dispatch).toHaveBeenCalledTimes(1);
    expect(new ExecutionLeaseStore(dataRoot).get(first[0]?.leaseId ?? '').status).toBe('completed');
  });

  it('does not create a lease when target authorization denies', async () => {
    const dataRoot = root();
    const execution: TriggerExecutionPort = { dispatch: vi.fn(async () => ({ resultRef: 'never' })) };
    const router = new PerceptionRouter(
      dataRoot,
      { list: () => [rule()] },
      { authorize: async () => ({ authorized: false, reason: 'external trigger disabled' }) },
      execution,
    );
    expect(await router.route(event())).toEqual([{ ruleId: 'rule-1', status: 'denied', reason: 'external trigger disabled' }]);
    expect(execution.dispatch).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dataRoot, 'perception', 'leases'))).toBe(false);
  });

  it('marks a lease failed without persisting sensitive exception text', async () => {
    const dataRoot = root();
    const router = new PerceptionRouter(
      dataRoot,
      { list: () => [rule()] },
      { authorize: async () => ({ authorized: true }) },
      { dispatch: async () => { throw new Error('secret provider diagnostic'); } },
    );
    const result = await router.route(event());
    expect(result[0]?.status).toBe('failed');
    expect(new ExecutionLeaseStore(dataRoot).get(result[0]?.leaseId ?? '').status).toBe('failed');
    expect(fs.readFileSync(path.join(dataRoot, 'perception', 'audit', 'events.jsonl'), 'utf8')).not.toContain('secret provider diagnostic');
  });

  it('requires explicit grants for target and inherited cognition owner', async () => {
    const grants = new ExternalTriggerGrantStore(root());
    const now = '2026-08-28T08:00:00.000Z';
    grants.save({ target: { kind: 'skill', id: 'skill-1' }, enabled: true, allowedConnectorIds: ['email-main'], createdAt: now, updatedAt: now });
    const target = { kind: 'skill', id: 'skill-1', skillOwnership: { mode: 'inherited', ownerKind: 'project', ownerId: 'project-1' } } as const;
    const existingTargets = { exists: async () => true };
    const authorization = new FileTargetAuthorizationPort(grants, existingTargets);
    const input = { event: event(), rule: rule({ target }), target };
    await expect(new FileTargetAuthorizationPort(grants, { exists: async () => false }).authorize(input))
      .resolves.toEqual({ authorized: false, reason: 'Target does not exist' });
    await expect(authorization.authorize(input)).resolves.toMatchObject({ authorized: false });
    grants.save({ target: { kind: 'project', id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now });
    await expect(authorization.authorize(input)).resolves.toMatchObject({ authorized: true });
  });

  it('passes ephemeral and inherited Skill cognition ownership explicitly', async () => {
    const contexts: string[] = [];
    const execution: TriggerExecutionPort = {
      dispatch: async ({ context }) => { contexts.push(JSON.stringify(context.cognitionOwner)); return { resultRef: `result-${contexts.length}` }; },
    };
    const rules = [
      rule({ id: 'ephemeral', target: { kind: 'skill', id: 'skill-1', skillOwnership: { mode: 'ephemeral' } } }),
      rule({ id: 'inherited', target: { kind: 'skill', id: 'skill-1', skillOwnership: { mode: 'inherited', ownerKind: 'role-agent', ownerId: 'agent-1' } } }),
    ];
    await new PerceptionRouter(root(), { list: () => rules }, { authorize: async () => ({ authorized: true }) }, execution).route(event());
    expect(contexts).toEqual(['{"kind":"ephemeral"}', '{"kind":"role-agent","id":"agent-1"}']);
  });

  it('reauthorizes a retry and uses an attempt-specific lease', async () => {
    const dataRoot = root();
    const events = new PerceptionEventStore(dataRoot);
    const rules = new TriggerRuleStore(dataRoot);
    events.save(event());
    rules.save(rule());
    const authorize = vi.fn(async () => ({ authorized: true }));
    const dispatch = vi.fn(async () => ({ resultRef: 'perception://session/retry-1' }));
    const router = new PerceptionRouter(dataRoot, rules, { authorize }, { dispatch });
    const handler = new PerceptionRetryRouterHandler(events, rules, router);
    await handler.execute({
      id: 'retry-1', eventId: 'event-1', ruleId: 'rule-1', connectorId: 'email-main',
      attempt: 1, maxAttempts: 3, status: 'processing', nextAttemptAt: '2026-08-28T08:00:00.000Z',
      lastSafeCode: 'FAILED', createdAt: '2026-08-28T08:00:00.000Z', updatedAt: '2026-08-28T08:00:00.000Z',
    });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const leaseId = dispatch.mock.calls[0]?.[0].context.leaseId ?? '';
    expect(new ExecutionLeaseStore(dataRoot).get(leaseId).attemptKey).toBe('retry-1');
  });
});
