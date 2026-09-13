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

it('sends files only with explicit capability, awaiting ACK and deduplicating concurrent calls', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-file-reply-')); roots.push(root);
  const service = new PluginReplyDeliveryService(root);
  const file = { fileName: 'test.txt', bytes: new Uint8Array([1, 2, 3]) };
  const deliver = vi.fn(async () => ({ messageId: 'remote', connectorId: 'test', status: 'delivered' as const, attempt: 1 }));
  service.register('legacy', deliver);
  await expect(service.sendFile('legacy', file, 'call')).rejects.toThrow();
  const remove = service.register('supported', deliver, { supportsFiles: true });
  await Promise.all([service.sendFile('supported', file, 'call'), service.sendFile('supported', file, 'call')]);
  await service.sendFile('supported', file, 'call');
  expect(deliver).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(new ChannelDeliveryStore(root).list())).not.toContain('bytes');
  remove();
  await expect(service.sendFile('supported', file, 'new-call')).rejects.toThrow();
});

it('revokes a captured sender when the same reply handle is replaced', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'im-replaced-')); roots.push(root);
 const service = new PluginReplyDeliveryService(root); const old = vi.fn(); const next = vi.fn();
 service.register('same', old, { supportsFiles: true }); const sender = service.captureFileSender('same')!;
 service.register('same', next, { supportsFiles: true });
 await expect(sender({fileName:'x',bytes:new Uint8Array([1])}, 'old')).rejects.toThrow('UNAVAILABLE');
 expect(old).not.toHaveBeenCalled(); expect(next).not.toHaveBeenCalled();
});
it('does not retry unconfirmed sends and preserves safe format refusal', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'im-failed-')); roots.push(root);
 const service = new PluginReplyDeliveryService(root); const send = vi.fn(async () => { throw new Error('IM_FILE_FORMAT_UNSUPPORTED'); });
 service.register('x',send,{supportsFiles:true});
 await expect(service.sendFile('x',{fileName:'x',bytes:new Uint8Array([1])},'c')).rejects.toThrow('IM_FILE_FORMAT_UNSUPPORTED');
 expect(send).toHaveBeenCalledOnce(); expect(new ChannelDeliveryStore(root).list()).toHaveLength(0);
});
