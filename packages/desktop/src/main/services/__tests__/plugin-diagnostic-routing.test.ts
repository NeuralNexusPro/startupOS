import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BindingChannelMessageIngress, ChannelSessionBindingStore, StreamingSessionRuntimeAdapter, type RuntimeSourceEvent } from '../../../../../core/src/modules/channel-runtime';
import { ChannelTriggerExecutionAdapter, PerceptionRouter, PerceptionAuditStore, type PerceptionEventV1, type PerceptionTriggerRule } from '../../../../../core/src/modules/perception-runtime';
import { PluginReplyDeliveryService } from '../perception-plugin-host/plugin-reply-delivery-service';
import { BufferedDailyLogWriter } from '../daily-log-writer';
import { createPluginLogSink } from '../plugin-log-service';

const event: PerceptionEventV1 = {
  schemaVersion: '1.0', id: 'event-1', source: 'wecom', sourceEventId: 'message-1', connectorId: 'wecom-main', type: 'message.received',
  occurredAt: '2026-09-14T00:00:00.000Z', receivedAt: '2026-09-14T00:00:00.000Z', actor: { externalId: 'user' },
  content: { text: 'private-chat' }, provenance: { rawPayloadRef: 'wecom://reply' },
};
const rule: PerceptionTriggerRule = {
  id: 'rule-1', enabled: true, sources: ['wecom'], eventTypes: ['message.received'], conditions: [],
  target: { kind: 'role-agent', id: 'role-1' }, execution: { requireHitl: false, maxAttempts: 1 },
  createdAt: event.receivedAt, updatedAt: event.receivedAt,
};

describe('real diagnostic route and file audit', () => {
  it.each(['ingress', 'prompt', 'delivery'])('correlates %s failure across Host log and Router audit', async stage => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-routing-'));
    const writer = new BufferedDailyLogWriter({ logsDir: path.join(root, 'logs'), now: () => new Date(2026, 8, 14) });
    try {
      const sink = createPluginLogSink(writer, { 'originos.wecom': 'wecom' });
      let listener: ((event: RuntimeSourceEvent) => Promise<void>) | undefined;
      const unsubscribe = vi.fn();
      const runtime = new StreamingSessionRuntimeAdapter({ resolve: async () => ({ sessionId: 'session-1', resultRef: 'session://session-1', runtime: {
        subscribe: next => { listener = next; return unsubscribe; },
        prompt: async () => {
          if (stage === 'prompt') throw new Error('HTTP 402: private-provider-body password=private-secret');
          await listener?.({ type: 'message_end', message: { role: 'assistant', content: 'private-reply' } });
        }, abort: vi.fn(),
      } }) }, { appendUserMessage: async () => undefined, appendAssistantMessage: async () => undefined });
      const ingress = new BindingChannelMessageIngress(new ChannelSessionBindingStore(root), {
        provision: async () => { if (stage === 'ingress') throw Object.assign(new Error('getaddrinfo ENOTFOUND private-secret'), { code: 'ENOTFOUND' }); return 'session-1'; },
      }, runtime);
      const delivery = new PluginReplyDeliveryService(root);
      const platform = vi.fn(async () => {
        if (stage === 'delivery') throw Object.assign(new Error('socket ECONNRESET token=private-secret'), { code: 'ECONNRESET' });
        return { messageId: 'remote', connectorId: 'wecom-main', status: 'delivered' as const, attempt: 1 };
      });
      delivery.register('wecom://reply', platform);
      const execution = new ChannelTriggerExecutionAdapter(ingress, undefined, delivery,
        (_source, connectorId) => ({ write: record => sink.write('originos.wecom', connectorId, record) }));
      const router = new PerceptionRouter(root, { list: () => [rule] }, { authorize: async () => ({ authorized: true }) }, execution);
      expect(await router.route(event)).toMatchObject([{ status: 'failed' }]);
      await writer.dispose();
      const audit = new PerceptionAuditStore(root).list({ eventId: event.id });
      const failed = audit.find(entry => entry.action === 'lease.failed');
      expect(failed?.detail).toMatchObject({ diagnosticId: expect.any(String), safeCode: stage === 'prompt' ? 'CHANNEL_RUNTIME_FAILED' : stage === 'delivery' ? 'CHANNEL_DELIVERY_FAILED' : 'CHANNEL_TRIGGER_FAILED' });
      const logText = fs.readFileSync(path.join(root, 'logs/plugins/wecom/plugin-2026-09-14.log'), 'utf8');
      const records: Array<Record<string, unknown>> = logText.trim().split('\n').map(line => JSON.parse(line));
      const detail = failed!.detail as Record<string, unknown>;
      const diagnostic = records.find(record => record['diagnosticId'] === detail['diagnosticId'] && record['error']);
      expect(diagnostic).toMatchObject({ stage, pluginId: 'originos.wecom', connectorId: 'wecom-main', eventId: 'event-1' });
      if (stage !== 'ingress') {
        expect(diagnostic).toMatchObject({ sessionId: 'session-1' });
        expect(unsubscribe).toHaveBeenCalledOnce();
      }
      expect(audit.some(entry => entry.action === 'lease.completed')).toBe(false);
      for (const secret of ['private-secret', 'private-chat', 'private-reply', 'private-provider-body']) {
        expect(logText).not.toContain(secret); expect(JSON.stringify(audit)).not.toContain(secret);
      }
      if (stage === 'delivery') expect(platform.mock.calls.length).toBeGreaterThan(1);
    } finally { await writer.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
  });
});
