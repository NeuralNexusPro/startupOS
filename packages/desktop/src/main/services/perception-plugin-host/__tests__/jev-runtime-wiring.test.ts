import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  DecisionReceiptStore,
  ExternalTriggerGrantStore,
  PerceptionAuditStore,
  PerceptionEventStore,
  TriggerRuleStore,
  type PerceptionPluginHostPorts,
} from '../../../../../../core/src/modules/perception-runtime';
import type { ChannelMessageIngress } from '../../../../../../core/src/modules/channel-runtime';
import type { JevDecisionAnswer, JevDecisionRequest, PerceptionEventV1, PerceptionTriggerRule } from '../../../../../../core/src/types/perception';
import { PerceptionPluginHostService } from '../perception-plugin-host-service';
import { IPC_CHANNELS } from '../../../ipc-protocol';

const electron = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: electron.handle }, safeStorage: {} }));
vi.mock('@originos/perception-plugin-email', () => ({ emailPlugin: { manifest: { id: 'originos.email', source: 'email' } } }));
vi.mock('@originos/perception-plugin-wecom', () => ({ weComPlugin: { manifest: { id: 'originos.wecom', source: 'wecom' } } }));
vi.mock('@originos/perception-plugin-feishu', () => ({ feishuPlugin: { manifest: { id: 'originos.feishu', source: 'feishu' } } }));
vi.mock('@originos/perception-plugin-dingtalk', () => ({ dingtalkPlugin: { manifest: { id: 'originos.dingtalk', source: 'dingtalk' } } }));

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function event(): PerceptionEventV1 {
  const now = '2026-09-20T00:00:00.000Z';
  return { schemaVersion: '1.0', id: 'event-1', source: 'email', sourceEventId: 'mail-1', connectorId: 'email-main', type: 'mail.received', occurredAt: now, receivedAt: now, actor: { externalId: 'sender' }, content: { text: 'route me' }, provenance: { rawPayloadRef: 'inbox://event-1' } };
}

function rules(now: string): PerceptionTriggerRule[] {
  const base = { enabled: true, sources: ['email' as const], eventTypes: ['mail.received' as const], conditions: [], execution: { requireHitl: false, maxAttempts: 1 }, createdAt: now, updatedAt: now };
  return [
    { ...base, id: 'a-direct', target: { kind: 'project', id: 'direct-project' } },
    { ...base, id: 'b-jev', routingMode: 'jev', decision: { catalogVersion: '1.0', policyVersion: '1.0', candidates: [
      { key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' },
      { key: 'project:jev-project', action: 'dispatch', target: { kind: 'project', id: 'jev-project' } },
    ] } },
  ];
}

it('wires Jev into the Host without blocking direct dispatch and keeps failed-provider receipts pending when notification fails', async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-host-')); roots.push(dataRoot);
  for (const id of ['direct-project', 'jev-project']) {
    fs.mkdirSync(path.join(dataRoot, 'projects', id), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'projects', id, 'project.json'), '{}');
    new ExternalTriggerGrantStore(dataRoot).save({ target: { kind: 'project', id }, enabled: true, createdAt: event().receivedAt, updatedAt: event().receivedAt });
  }
  for (const rule of rules(event().receivedAt)) new TriggerRuleStore(dataRoot).save(rule);
  const send = vi.fn(async function* () { yield { type: 'accepted' as const, sessionId: 'session-1' }; yield { type: 'completed' as const, resultRef: 'perception://session/session-1' }; });
  const decide = vi.fn(async (): Promise<JevDecisionAnswer> => { throw Object.assign(new Error('private provider detail'), { code: 'JEV_TIMEOUT' }); });
  const notify = vi.fn(async (): Promise<never> => { throw new Error('private native notification failure'); });
  const diagnostics: unknown[] = [];
  const service = new PerceptionPluginHostService({ send } as ChannelMessageIngress, dataRoot, { write: (_plugin, _connector, record) => diagnostics.push(record) }, { every: vi.fn(), cancel: vi.fn() }, { decide }, notify);
  const ports = (service as unknown as { createPorts(): PerceptionPluginHostPorts }).createPorts();
  const result = await ports.events.submit(event());
  expect(result).toEqual([expect.objectContaining({ status: 'dispatched' }), expect.objectContaining({ status: 'pending', reason: 'JEV_TIMEOUT' })]);
  expect(send).toHaveBeenCalledOnce();
  expect(decide).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledOnce();
  expect(new DecisionReceiptStore(dataRoot).listPending()).toEqual([expect.objectContaining({ status: 'failed', reason: 'JEV_TIMEOUT' })]);
  expect(diagnostics).toContainEqual(expect.objectContaining({ stage: 'decision.notification', safeCode: 'DECISION_NOTIFICATION_FAILED' }));
  const ipc = (channel: string) => electron.handle.mock.calls.find(([registered]) => registered === channel)![1] as (_event?: unknown, input?: unknown) => Promise<{ success: boolean; data?: unknown }>;
  const decisionId = new DecisionReceiptStore(dataRoot).listPending()[0]!.id;
  expect(await ipc(IPC_CHANNELS.PERCEPTION_DECISION_PENDING)()).toMatchObject({ success: true, data: [expect.objectContaining({ id: decisionId })] });
  expect(await ipc(IPC_CHANNELS.PERCEPTION_DECISION_RETRY)(undefined, { decisionId })).toMatchObject({ success: true, data: expect.objectContaining({ status: 'failed', reason: 'JEV_TIMEOUT' }) });
  expect(decide).toHaveBeenCalledTimes(2);
  expect(await ipc(IPC_CHANNELS.PERCEPTION_DECISION_RESOLVE)(undefined, { decisionId, candidateKey: 'project:jev-project' })).toMatchObject({ success: true, data: expect.objectContaining({ status: 'user-executed', resultRef: 'perception://session/session-1' }) });
  expect(await ipc(IPC_CHANNELS.PERCEPTION_DECISION_RESOLVE)(undefined, { decisionId, candidateKey: 'ignore' })).toMatchObject({ success: true, data: expect.objectContaining({ status: 'user-executed', resultRef: 'perception://session/session-1' }) });
  expect(send).toHaveBeenCalledTimes(2);
  await service.stop();
});

it('uses the newest pending IM choice when older choices remain unresolved', async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-host-choice-')); roots.push(dataRoot);
  const at = (minute: number) => `2026-09-20T00:${String(minute).padStart(2, '0')}:00.000Z`;
  const imEvent = (id: string, minute: number, text: string): PerceptionEventV1 => ({ schemaVersion: '1.0', id, source: 'wecom', sourceEventId: id, connectorId: 'wecom-main', type: 'message.received', occurredAt: at(minute), receivedAt: at(minute), actor: { externalId: 'sender' }, conversation: { externalId: 'direct-1', kind: 'direct' }, content: { text }, provenance: { rawPayloadRef: `wecom://${id}` } });
  const rule: PerceptionTriggerRule = { id: 'jev-im', enabled: true, sources: ['wecom'], eventTypes: ['message.received'], conditions: [], routingMode: 'jev', decision: { catalogVersion: '1.0', policyVersion: '1.0', candidates: [{ key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' }, { key: 'project:jev-project', action: 'dispatch', target: { kind: 'project', id: 'jev-project' } }] }, execution: { requireHitl: false, maxAttempts: 1 }, createdAt: at(0), updatedAt: at(0) };
  fs.mkdirSync(path.join(dataRoot, 'projects', 'jev-project'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'projects', 'jev-project', 'project.json'), '{}');
  new ExternalTriggerGrantStore(dataRoot).save({ target: { kind: 'project', id: 'jev-project' }, enabled: true, createdAt: at(0), updatedAt: at(0) });
  new TriggerRuleStore(dataRoot).save(rule);
  const events = new PerceptionEventStore(dataRoot);
  const receipts = new DecisionReceiptStore(dataRoot);
  for (const [id, minute] of [['old-event', 1], ['latest-event', 2]] as const) {
    events.save(imEvent(id, minute, '需要处理'));
    receipts.save({ id: `${id}-receipt`, eventId: id, ruleId: rule.id, catalogVersion: '1.0', policyVersion: '1.0', candidateKeys: rule.decision.candidates.map((candidate) => candidate.key), threshold: 0.8, status: 'pending', reason: 'TARGET_AMBIGUOUS', createdAt: at(minute), updatedAt: at(minute) });
  }
  const answer = (): JevDecisionAnswer => ({ providerModel: 'jev-test', routeTarget: { choice: 'project:jev-project', confidence: 1, probabilities: { 'project:jev-project': 1 } }, deliveryMode: { choice: 'invoke_target', confidence: 1, probabilities: { notify_user: 0, invoke_target: 1 } }, needsUserAttention: 1, urgency: { score: 0, confidence: 1, probabilities: {} }, risk: { score: 0, confidence: 1, probabilities: {} }, needsHitl: 0, retainAsEvidence: 0 });
  const decide = vi.fn(async (_request: JevDecisionRequest): Promise<JevDecisionAnswer> => answer())
    .mockResolvedValueOnce({ ...answer(), isChoiceFeedback: 1 })
    .mockResolvedValueOnce(answer())
    .mockResolvedValueOnce({ ...answer(), isChoiceFeedback: 0 })
    .mockResolvedValueOnce(answer());
  const send = vi.fn(async function* () { yield { type: 'accepted' as const, sessionId: 'session-1' }; yield { type: 'completed' as const, resultRef: 'perception://session/session-1' }; });
  const service = new PerceptionPluginHostService({ send } as ChannelMessageIngress, dataRoot, undefined, { every: vi.fn(), cancel: vi.fn() }, { decide });
  const ports = (service as unknown as { createPorts(): PerceptionPluginHostPorts }).createPorts();
  await ports.events.submit(imEvent('feedback-event', 3, '由项目处理'));
  expect(decide).toHaveBeenCalledTimes(2);
  expect(receipts.get('latest-event-receipt')).toMatchObject({ status: 'auto-executed' });
  expect(receipts.get('old-event-receipt')).toMatchObject({ status: 'pending' });
  expect(new PerceptionAuditStore(dataRoot).list({ eventId: 'feedback-event' })).toContainEqual(expect.objectContaining({
    action: 'decision.feedback',
    detail: expect.objectContaining({ ruleId: rule.id, decisionId: 'latest-event-receipt', originalEventId: 'latest-event', status: 'dispatched' }),
  }));
  expect(new PerceptionAuditStore(dataRoot).list({ eventId: 'feedback-event' })).toContainEqual(expect.objectContaining({
    action: 'rule.matched',
    detail: expect.objectContaining({ ruleId: rule.id, continuation: 'decision-feedback', decisionId: 'latest-event-receipt' }),
  }));
  expect(send).toHaveBeenCalledOnce();
  await ports.events.submit(imEvent('new-request', 4, '这是一个新的问题'));
  expect(decide).toHaveBeenCalledTimes(3);
  expect(new PerceptionAuditStore(dataRoot).list({ eventId: 'new-request' })).toContainEqual(expect.objectContaining({
    action: 'decision.feedback.rejected',
    detail: expect.objectContaining({ decisionId: 'old-event-receipt', originalEventId: 'old-event', status: 'unrelated' }),
  }));
  expect(receipts.get(receipts.stableId('new-request', rule.id, '1.0'))).toBeNull();
  expect(new PerceptionAuditStore(dataRoot).list({ eventId: 'new-request' })).toContainEqual(expect.objectContaining({
    action: 'decision.resolved',
    detail: expect.objectContaining({ action: 'sticky-dispatch', candidateKey: 'project:jev-project' }),
  }));
  expect(send).toHaveBeenCalledTimes(2);
  await service.stop();
});

it('asks for an IM target when Jev chooses user target selection and continues from the reply', async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-notify-choice-')); roots.push(dataRoot);
  const at = (minute: number) => `2026-09-20T00:${String(minute).padStart(2, '0')}:00.000Z`;
  const imEvent = (id: string, minute: number, text: string): PerceptionEventV1 => ({
    schemaVersion: '1.0', id, source: 'wecom', sourceEventId: id, connectorId: 'wecom-main', type: 'message.received',
    occurredAt: at(minute), receivedAt: at(minute), actor: { externalId: 'sender' },
    conversation: { externalId: 'direct-1', kind: 'direct' }, content: { text }, provenance: { rawPayloadRef: `wecom://${id}` },
  });
  const rule: PerceptionTriggerRule = {
    id: 'jev-im', enabled: true, sources: ['wecom'], eventTypes: ['message.received'], conditions: [], routingMode: 'jev',
    decision: { catalogVersion: '1.0', policyVersion: '1.0', candidates: [
      { key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' },
      { key: 'project:jev-project', action: 'dispatch', target: { kind: 'project', id: 'jev-project' } },
    ] }, execution: { requireHitl: false, maxAttempts: 1 }, createdAt: at(0), updatedAt: at(0),
  };
  fs.mkdirSync(path.join(dataRoot, 'projects', 'jev-project'), { recursive: true });
  fs.writeFileSync(path.join(dataRoot, 'projects', 'jev-project', 'project.json'), '{}');
  new ExternalTriggerGrantStore(dataRoot).save({ target: { kind: 'project', id: 'jev-project' }, enabled: true, createdAt: at(0), updatedAt: at(0) });
  new TriggerRuleStore(dataRoot).save(rule);
  const notifyAnswer: JevDecisionAnswer = {
    providerModel: 'jev-test', routeTarget: { choice: 'ask_user_to_choose_target', confidence: 1, probabilities: { 'project:jev-project': 0, ask_user_to_choose_target: 1 } },
    deliveryMode: { choice: 'invoke_target', confidence: 1, probabilities: { notify_user: 0, invoke_target: 1 } },
    needsUserAttention: 1, urgency: { score: 0, confidence: 1, probabilities: {} }, risk: { score: 0, confidence: 1, probabilities: {} }, needsHitl: 0, retainAsEvidence: 0,
  };
  const invokeAnswer: JevDecisionAnswer = { ...notifyAnswer, routeTarget: { choice: 'project:jev-project', confidence: 1, probabilities: { 'project:jev-project': 1 } } };
  const decide = vi.fn(async (): Promise<JevDecisionAnswer> => notifyAnswer).mockResolvedValueOnce(notifyAnswer).mockResolvedValueOnce(invokeAnswer);
  const classifyPendingChoiceFeedback = vi.fn(async () => 1);
  const send = vi.fn(async function* () { yield { type: 'accepted' as const, sessionId: 'session-1' }; yield { type: 'completed' as const, resultRef: 'perception://session/session-1' }; });
  const service = new PerceptionPluginHostService({ send } as ChannelMessageIngress, dataRoot, undefined, { every: vi.fn(), cancel: vi.fn() }, { decide, classifyPendingChoiceFeedback });
  const replies = (service as unknown as { replies: { register(handle: string, send: (event: { type: string; content?: string }) => Promise<{ messageId: string; connectorId: string; status: 'delivered'; attempt: number }>): () => void } }).replies;
  const output: Array<{ type: string; content?: string }> = [];
  const unregisterInitial = replies.register('wecom://initial', async (item) => {
    output.push(item); return { messageId: `initial-${output.length}`, connectorId: 'wecom-main', status: 'delivered', attempt: 1 };
  });
  const ports = (service as unknown as { createPorts(): PerceptionPluginHostPorts }).createPorts();
  expect(await ports.events.submit(imEvent('initial', 1, '帮我处理'))).toEqual([expect.objectContaining({ status: 'pending', reason: 'USER_TARGET_SELECTION_REQUIRED' })]);
  expect(output).toContainEqual(expect.objectContaining({ type: 'assistant_message', content: expect.stringContaining('您更期望由谁') }));
  unregisterInitial();
  const unregisterFeedback = replies.register('wecom://feedback', async (item) => {
    output.push(item); return { messageId: `feedback-${output.length}`, connectorId: 'wecom-main', status: 'delivered', attempt: 1 };
  });
  expect(await ports.events.submit(imEvent('feedback', 2, '就让这个项目处理'))).toEqual([expect.objectContaining({ status: 'dispatched' })]);
  expect(classifyPendingChoiceFeedback).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledOnce();
  unregisterFeedback();
  await service.stop();
});

it('keeps a partial IM choice in the pending conversation and asks again', async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-partial-choice-')); roots.push(dataRoot);
  const at = (minute: number) => `2026-09-20T00:${String(minute).padStart(2, '0')}:00.000Z`;
  const imEvent = (id: string, minute: number, text: string): PerceptionEventV1 => ({
    schemaVersion: '1.0', id, source: 'wecom', sourceEventId: id, connectorId: 'wecom-main', type: 'message.received',
    occurredAt: at(minute), receivedAt: at(minute), actor: { externalId: 'sender' },
    conversation: { externalId: 'direct-1', kind: 'direct' }, content: { text }, provenance: { rawPayloadRef: `wecom://${id}` },
  });
  const candidates = ['first', 'second'].map((id) => ({ key: `project:${id}`, action: 'dispatch' as const, target: { kind: 'project' as const, id } }));
  const rule: PerceptionTriggerRule = {
    id: 'jev-im', enabled: true, sources: ['wecom'], eventTypes: ['message.received'], conditions: [], routingMode: 'jev',
    decision: { catalogVersion: '1.0', policyVersion: '1.0', candidates: [{ key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' }, ...candidates] },
    execution: { requireHitl: false, maxAttempts: 1 }, createdAt: at(0), updatedAt: at(0),
  };
  for (const id of ['first', 'second']) {
    fs.mkdirSync(path.join(dataRoot, 'projects', id), { recursive: true });
    fs.writeFileSync(path.join(dataRoot, 'projects', id, 'project.json'), '{}');
    new ExternalTriggerGrantStore(dataRoot).save({ target: { kind: 'project', id }, enabled: true, createdAt: at(0), updatedAt: at(0) });
  }
  new TriggerRuleStore(dataRoot).save(rule);
  new PerceptionEventStore(dataRoot).save(imEvent('original', 1, '帮我处理'));
  const receipts = new DecisionReceiptStore(dataRoot);
  receipts.save({ id: 'original-receipt', eventId: 'original', ruleId: rule.id, catalogVersion: '1.0', policyVersion: '1.0', candidateKeys: rule.decision.candidates.map((candidate) => candidate.key), threshold: 0.8, status: 'pending', reason: 'TARGET_AMBIGUOUS', createdAt: at(1), updatedAt: at(1) });
  const baseAnswer: JevDecisionAnswer = {
    providerModel: 'jev-test', routeTarget: { choice: 'project:first', confidence: 0.55, probabilities: { 'project:first': 0.55, 'project:second': 0.45 } },
    deliveryMode: { choice: 'invoke_target', confidence: 1, probabilities: { notify_user: 0, invoke_target: 1 } },
    needsUserAttention: 1, urgency: { score: 0, confidence: 1, probabilities: {} }, risk: { score: 0, confidence: 1, probabilities: {} }, needsHitl: 0, retainAsEvidence: 0,
  };
  const decide = vi.fn(async (): Promise<JevDecisionAnswer> => baseAnswer);
  const classifyPendingChoiceFeedback = vi.fn(async (): Promise<number> => 1);
  const send = vi.fn(async function* () { yield { type: 'accepted' as const, sessionId: 'session-1' }; });
  const service = new PerceptionPluginHostService({ send } as ChannelMessageIngress, dataRoot, undefined, { every: vi.fn(), cancel: vi.fn() }, { decide, classifyPendingChoiceFeedback });
  const replies = (service as unknown as { replies: { register(handle: string, send: (event: { type: string; content?: string }) => Promise<{ messageId: string; connectorId: string; status: 'delivered'; attempt: number }>): () => void } }).replies;
  const output: Array<{ type: string; content?: string }> = [];
  const unregister = replies.register('wecom://feedback', async (item) => {
    output.push(item);
    return { messageId: `reply-${output.length}`, connectorId: 'wecom-main', status: 'delivered', attempt: 1 };
  });
  const ports = (service as unknown as { createPorts(): PerceptionPluginHostPorts }).createPorts();
  const result = await ports.events.submit(imEvent('feedback', 2, '可能第一个更合适吧？'));
  expect(result).toEqual([expect.objectContaining({ status: 'pending', reason: 'TARGET_AMBIGUOUS' })]);
  expect(receipts.get('original-receipt')).toMatchObject({ status: 'pending', reason: 'TARGET_AMBIGUOUS' });
  expect(receipts.get(receipts.stableId('feedback', rule.id, '1.0'))).toBeNull();
  expect(output).toContainEqual(expect.objectContaining({ type: 'assistant_message', content: expect.stringContaining('也可以再补充一点您的偏好') }));
  expect(output).toContainEqual(expect.objectContaining({ type: 'completed' }));
  expect(classifyPendingChoiceFeedback).toHaveBeenCalledOnce();
  expect(decide).toHaveBeenCalledOnce();
  classifyPendingChoiceFeedback.mockRejectedValueOnce(new Error('provider response invalid'));
  const failedOutput: Array<{ type: string; content?: string }> = [];
  const unregisterFailed = replies.register('wecom://feedback-2', async (item) => {
    failedOutput.push(item);
    return { messageId: `failure-${failedOutput.length}`, connectorId: 'wecom-main', status: 'delivered', attempt: 1 };
  });
  expect(await ports.events.submit(imEvent('feedback-2', 3, '嗯，那这个呢？'))).toEqual([expect.objectContaining({ status: 'pending', reason: 'JEV_CHOICE_CLASSIFICATION_FAILED' })]);
  expect(failedOutput).toContainEqual(expect.objectContaining({ type: 'assistant_message', content: expect.stringContaining('请再说一下') }));
  expect(receipts.get(receipts.stableId('feedback-2', rule.id, '1.0'))).toBeNull();
  unregisterFailed();
  expect(send).not.toHaveBeenCalled();
  unregister();
  await service.stop();
});
