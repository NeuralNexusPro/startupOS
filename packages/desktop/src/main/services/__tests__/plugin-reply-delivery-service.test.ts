import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelDeliveryStore } from '../../../../../core/src/modules/channel-runtime';
import { PluginReplyDeliveryService } from '../perception-plugin-host/plugin-reply-delivery-service';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('PluginReplyDeliveryService', () => {
  it('keeps opaque handles in memory, retries SDK delivery and persists redacted receipts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-plugin-delivery-'));
    roots.push(root);
    const service = new PluginReplyDeliveryService(root);
    const deliver = vi.fn()
      .mockRejectedValueOnce(new Error('provider secret'))
      .mockResolvedValue({ messageId: 'plugin', connectorId: 'wecom-main', status: 'delivered', attempt: 1 });
    const unregister = service.register('wecom-ws://wecom-main/request-1', deliver);
    expect(service.canDeliver('wecom-ws://wecom-main/request-1')).toBe(true);
    const receipts = await service.dispatch({
      connectorId: 'wecom-main',
      replyHandle: 'wecom-ws://wecom-main/request-1',
      packets: (async function* () {
        yield { protocolVersion: '1.0' as const, flowId: 'flow-1', packetId: 'packet-1', sequence: 0, port: 'runtime.output', kind: 'data' as const, emittedAt: '2026-09-07T00:00:00.000Z', payload: { type: 'assistant_message' as const, content: 'hello' } };
      })(),
    });
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(receipts[0]).toMatchObject({ status: 'delivered', attempt: 2 });
    expect(JSON.stringify(new ChannelDeliveryStore(root).list())).not.toContain('provider secret');
    unregister();
    expect(service.canDeliver('wecom-ws://wecom-main/request-1')).toBe(false);
  });
});
