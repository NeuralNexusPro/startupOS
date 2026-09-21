import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  DecisionReceiptStore,
  ExternalTriggerGrantStore,
  TriggerRuleStore,
  type PerceptionPluginHostPorts,
} from '../../../../../../core/src/modules/perception-runtime';
import type { ChannelMessageIngress } from '../../../../../../core/src/modules/channel-runtime';
import type { JevDecisionAnswer, PerceptionEventV1, PerceptionTriggerRule } from '../../../../../../core/src/types/perception';
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
