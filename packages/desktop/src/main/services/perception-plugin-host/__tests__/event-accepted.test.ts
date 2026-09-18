import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PerceptionPluginHostService } from '../perception-plugin-host-service';
import { PerceptionEventStore, PerceptionRouter } from '../../../../../../core/src/modules/perception-runtime';
import type { PerceptionPluginHostPorts } from '../../../../../../core/src/modules/perception-runtime/plugins';
import type { ChannelMessageIngress } from '../../../../../../core/src/modules/channel-runtime';
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, safeStorage: {} }));
vi.mock('@originos/perception-plugin-email', () => ({ emailPlugin: { manifest: { id: 'originos.email', source: 'email' } } }));
vi.mock('@originos/perception-plugin-wecom', () => ({ weComPlugin: { manifest: { id: 'originos.wecom', source: 'wecom' } } }));
vi.mock('@originos/perception-plugin-feishu', () => ({ feishuPlugin: { manifest: { id: 'originos.feishu', source: 'feishu' } } }));
vi.mock('@originos/perception-plugin-dingtalk', () => ({ dingtalkPlugin: { manifest: { id: 'originos.dingtalk', source: 'dingtalk' } } }));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive:true, force:true }); });
it('ACKs only after durable acceptance, also ACKs duplicates, and keeps routing after ACK errors', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'accepted-')); roots.push(root);
 const service = new PerceptionPluginHostService({} as ChannelMessageIngress,root,undefined,{ every: vi.fn(), cancel: vi.fn() });
 const ports = (service as unknown as { createPorts(): PerceptionPluginHostPorts }).createPorts();
 const order: string[] = [];
 const event = {schemaVersion:'1.0' as const,id:'e1',source:'wecom' as const,sourceEventId:'m1',connectorId:'test',type:'message.received' as const,occurredAt:new Date().toISOString(),receivedAt:new Date().toISOString(),actor:{externalId:'u'},content:{text:'test'},provenance:{rawPayloadRef:'ref'}};
 const save = vi.spyOn(PerceptionEventStore.prototype,'save');
 save.mockImplementation(() => { order.push('save'); return {duplicate:false,event}; });
 const route = vi.spyOn(PerceptionRouter.prototype,'route').mockImplementation(async () => { order.push('route'); return []; });
 const onAccepted = vi.fn(async () => { order.push('ack'); throw new Error('ack failed'); });
 await ports.events.submit(event,{onAccepted}); expect(order).toEqual(['save','ack','route']);
 save.mockReturnValue({duplicate:true,event}); await ports.events.submit(event,{onAccepted});
 expect(onAccepted).toHaveBeenCalledTimes(2); expect(route).toHaveBeenCalledOnce();
 save.mockImplementation(() => { throw new Error('disk full'); });
 await expect(ports.events.submit(event,{onAccepted})).rejects.toThrow('disk full'); expect(onAccepted).toHaveBeenCalledTimes(2);
 service.stop();
});

it('stores inbound attachments under the data root with bounded safe names', async () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-')); roots.push(root);
 const service = new PerceptionPluginHostService({} as ChannelMessageIngress,root,undefined,{ every: vi.fn(), cancel: vi.fn() });
 const ports = (service as unknown as { createPorts(): PerceptionPluginHostPorts }).createPorts();
 const ref = await ports.attachments!.store('wecom-main', { fileName: '../../report?.pdf', bytes: Buffer.from('content') });
 expect(ref).toMatch(/^data\/perception\/attachments\/wecom-main\/[0-9a-f-]+\/report_\.pdf$/);
 expect(fs.readFileSync(path.join(root, ref.slice('data/'.length)), 'utf8')).toBe('content');
 await expect(ports.attachments!.store('wecom-main', {
   fileName: 'too-large.bin', bytes: new Uint8Array(20_000_001),
 })).rejects.toThrow('IM_ATTACHMENT_TOO_LARGE');
 await service.stop();
});
