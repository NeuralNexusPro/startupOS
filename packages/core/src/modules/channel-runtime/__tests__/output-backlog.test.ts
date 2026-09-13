import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelDeliveryStore, ChannelOutputDispatcher } from '..';
import type { AgentOutputEvent, FlowPacket } from '../types';
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function packet(n: number, payload: AgentOutputEvent = { type: 'text_delta', delta: `${n},` }, extra: Partial<FlowPacket<AgentOutputEvent>> = {}): FlowPacket<AgentOutputEvent> {
  return { protocolVersion: '1.0', flowId: 'flow', port: 'output', kind: 'data', packetId: `p${n}`, sequence: n, emittedAt: '2026-09-13T00:00:00Z', payload, ...extra };
}
function setup(deliver = vi.fn(async (_handle: string, _event: AgentOutputEvent) => ({ messageId: 'ack', connectorId: 'im', status: 'delivered' as const, attempt: 1 }))) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-')); roots.push(root);
  const store = new ChannelDeliveryStore(root);
  const dispatcher = new ChannelOutputDispatcher({ deliver }, store, { maxAttempts: 2, sleep: async () => {} });
  return { deliver, store, run: (packets: AsyncIterable<FlowPacket<AgentOutputEvent>>) => dispatcher.dispatch({ connectorId: 'im', replyHandle: 'reply', packets }) };
}
async function* source(values: FlowPacket<AgentOutputEvent>[]) { yield* values; }
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
describe('bounded output backlog', () => {
  it('sends the first packet without waiting for another and coalesces ACK backlog with all original receipts', async () => {
    let release!: () => void;
    const ack = new Promise<void>(resolve => { release = resolve; });
    let produced = 0;
    const x = setup();
    x.deliver.mockImplementation(async () => { await tick(); return { messageId: 'ack', connectorId: 'im', status: 'delivered', attempt: 1 }; });
    x.deliver.mockImplementationOnce(async () => { await ack; return { messageId: 'ack', connectorId: 'im', status: 'delivered', attempt: 1 }; });
    async function* input() { for (let n = 0; n < 96; n++) { produced++; yield packet(n); } }
    const running = x.run(input());
    await vi.waitFor(() => expect(x.deliver).toHaveBeenCalledOnce());
    await tick();
    expect(produced).toBeGreaterThan(1); expect(produced).toBeLessThanOrEqual(65);
    expect(x.store.list()).toHaveLength(0);
    release(); const receipts = await running;
    const texts = x.deliver.mock.calls.map(call => call[1]).filter((e): e is Extract<AgentOutputEvent, {type:'text_delta'}> => e.type === 'text_delta');
    expect(texts.map(e => e.delta).join('')).toBe(Array.from({length:96}, (_, n) => `${n},`).join(''));
    expect(texts.length).toBeLessThanOrEqual(5);
    expect(texts.every(e => e.delta.split(',').length - 1 <= 32)).toBe(true);
    expect(receipts.map(r => r.messageId)).toEqual(Array.from({ length: 96 }, (_, n) => `p${n}`));
    expect(receipts.every(r => r.status === 'delivered')).toBe(true); expect(x.store.list()).toHaveLength(96);
  });
  it('does not delay a lone first packet for pending source.next', async () => {
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const x = setup(); async function* input() { yield packet(0); await gate; }
    const run = x.run(input()); await vi.waitFor(() => expect(x.deliver).toHaveBeenCalledOnce()); release(); await run;
  });
  it('keeps nontext, hidden artifact, flow, port, kind and delivered packets as barriers', async () => {
    const x = setup();
    const barriers = [packet(10,{type:'accepted',sessionId:'session'}),packet(11,{type:'hitl_request',requestId:'r',summary:'review'}),packet(12,{type:'assistant_message',content:'full'}),packet(13,{type:'completed',resultRef:'r'}),packet(14,{type:'failed',safeCode:'FAILED'}),packet(15,{type:'artifact_changed',filename:'f',filePath:'/hidden',artifactType:'file'}),packet(16,undefined,{flowId:'other'}),packet(17,undefined,{port:'other'}),packet(18,undefined,{kind:'control'}),packet(19)];
    x.store.save({messageId:'p19',connectorId:'im',status:'delivered',attempt:1});
    const values = barriers.flatMap((barrier,n) => [packet(100+n*2),barrier,packet(101+n*2)]);
    await x.run(source(values));
    const outputs=x.deliver.mock.calls.map(call=>call[1]);
    expect(outputs).not.toContainEqual(barriers[5].payload);
    expect(outputs.filter(e=>e.type==='text_delta').flatMap(e=>e.delta.split(','))).not.toContain('19');
    for(let n=0;n<barriers.length;n++) expect(outputs.some(e=>e.type==='text_delta'&&e.delta.includes(`${100+n*2},${101+n*2},`))).toBe(false);
    expect(outputs.filter(e=>e.type!=='text_delta')).toEqual(barriers.slice(0,5).map(p=>p.payload));
  });
  it('retries a fixed group and preserves attempts for each original packet', async () => {
    const x=setup(); let calls=0;
    x.deliver.mockImplementation(async()=>{ if(++calls===2)throw Error('network'); await tick();return {messageId:'ack',connectorId:'im',status:'delivered',attempt:1}; });
    await x.run(source(Array.from({length:64},(_,n)=>packet(n))));
    expect(x.deliver.mock.calls[1][1]).toEqual(x.deliver.mock.calls[2][1]);
    const retried=x.store.list().filter(r=>r.attempt===2);expect(retried.length).toBeGreaterThan(1);
    const before=x.deliver.mock.calls.length;await x.run(source(Array.from({length:64},(_,n)=>packet(n))));expect(x.deliver).toHaveBeenCalledTimes(before);
  });
  it('does not append a repeated packet ID within the buffered group', async () => {
    const x = setup(); await x.run(source([packet(0), packet(0), packet(1)]));
    expect(x.deliver.mock.calls.map(call => call[1]).map(e => e.type === 'text_delta' ? e.delta : '').join('')).toBe('0,1,');
    expect(x.store.list()).toHaveLength(2);
  });
  it('records exhausted failure for every packet in a group', async()=>{
    const x=setup();x.deliver.mockImplementation(async()=>{await tick();throw Error('network');});
    const receipts=await x.run(source(Array.from({length:64},(_,n)=>packet(n))));
    expect(receipts).toHaveLength(64);expect(receipts.every(r=>r.status==='failed'&&r.attempt===2)).toBe(true);
    expect(x.deliver.mock.calls.length).toBeLessThan(10);
  });
  it('does not resend an acknowledged group when its second receipt fails to persist and closes source', async()=>{
    const x=setup();let cleaned=false;let writes=0;let acknowledgedAtFailure=0;const save=x.store.save.bind(x.store);
    vi.spyOn(x.store,'save').mockImplementation(receipt=>{if(++writes===3){acknowledgedAtFailure=x.deliver.mock.calls.length;throw Error('disk');}return save(receipt);});
    x.deliver.mockImplementation(async()=>{await tick();return {messageId:'ack',connectorId:'im',status:'delivered',attempt:1};});
    async function* input(){try{for(let n=0;n<100;n++)yield packet(n);}finally{cleaned=true;}}
    await expect(x.run(input())).rejects.toThrow('disk');await tick();
    expect(x.deliver).toHaveBeenCalledTimes(acknowledgedAtFailure);expect(x.store.list()).toHaveLength(2);expect(cleaned).toBe(true);
  });
  it('drains yielded packets before propagating a source error without fake completion', async()=>{
    const x=setup();async function* input(){yield packet(0);yield packet(1);throw Error('source-error');}
    await expect(x.run(input())).rejects.toThrow('source-error');
    expect(x.deliver.mock.calls.map(call=>call[1]).map(e=>e.type==='text_delta'?e.delta:e.type).join('')).toBe('0,1,');
    expect(x.store.list()).toHaveLength(2);
  });
});
