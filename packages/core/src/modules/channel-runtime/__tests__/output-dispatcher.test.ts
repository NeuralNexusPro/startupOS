import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChannelDeliveryStore, ChannelOutputDispatcher, type FlowPacket } from '..';
import type { AgentOutputEvent } from '../types';

const roots: string[] = [];
afterEach(() => { for (const value of roots.splice(0)) fs.rmSync(value, { recursive: true, force: true }); });

async function* packets(): AsyncIterable<FlowPacket<AgentOutputEvent>> {
  yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'packet-1', sequence: 0, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-05T10:00:00.000Z', payload: { type: 'assistant_message', content: 'hello' } };
  yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'packet-2', sequence: 1, port: 'runtime.output', kind: 'complete', emittedAt: '2026-09-05T10:00:01.000Z', payload: { type: 'completed', resultRef: 'session://one' } };
}

describe('ChannelOutputDispatcher', () => {
  it('delivers ACK and HITL packets while keeping internal artifact paths off external channels', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-delivery-'));
    roots.push(dataRoot);
    const deliver = vi.fn(async () => ({ messageId: 'ignored', connectorId: 'wecom-main', status: 'delivered' as const, attempt: 1 }));
    async function* controlPackets(): AsyncIterable<FlowPacket<AgentOutputEvent>> {
      yield { protocolVersion: '1.0', flowId: 'flow-control', packetId: 'ack-1', sequence: 0, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-07T00:00:00.000Z', payload: { type: 'accepted', sessionId: 'session-1' } };
      yield { protocolVersion: '1.0', flowId: 'flow-control', packetId: 'hitl-1', sequence: 1, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-07T00:00:00.000Z', payload: { type: 'hitl_request', requestId: 'review-1', summary: 'Approve release?' } };
      yield { protocolVersion: '1.0', flowId: 'flow-control', packetId: 'internal-1', sequence: 2, port: 'runtime.output', kind: 'data', emittedAt: '2026-09-07T00:00:00.000Z', payload: { type: 'artifact_changed', filename: 'manifest.json', filePath: '/private/solutions/manifest.json', artifactType: 'solution' } };
    }
    const dispatcher = new ChannelOutputDispatcher({ deliver }, new ChannelDeliveryStore(dataRoot));
    const receipts = await dispatcher.dispatch({ connectorId: 'wecom-main', replyHandle: 'reply-1', packets: controlPackets() });
    expect(deliver.mock.calls.map((call) => call[1].type)).toEqual(['accepted', 'hitl_request']);
    expect(receipts).toHaveLength(2);
    expect(new ChannelDeliveryStore(dataRoot).list()).toHaveLength(2);
  });

  it('retries delivery, persists receipts and skips already delivered packets', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-delivery-'));
    roots.push(dataRoot);
    const deliver = vi.fn()
      .mockResolvedValueOnce({ messageId: 'ignored', connectorId: 'wecom-main', status: 'retrying', attempt: 1, safeCode: 'TEMPORARY' })
      .mockResolvedValueOnce({ messageId: 'ignored', connectorId: 'wecom-main', status: 'delivered', attempt: 2, deliveredAt: '2026-09-05T10:00:00.000Z' })
      .mockResolvedValueOnce({ messageId: 'ignored', connectorId: 'wecom-main', status: 'delivered', attempt: 1, deliveredAt: '2026-09-05T10:00:01.000Z' });
    const sleep = vi.fn(async () => undefined);
    const dispatcher = new ChannelOutputDispatcher({ deliver }, new ChannelDeliveryStore(dataRoot), { maxAttempts: 3, sleep });
    const first = await dispatcher.dispatch({ connectorId: 'wecom-main', replyHandle: 'reply-1', packets: packets() });
    expect(first.map((receipt) => receipt.status)).toEqual(['delivered', 'delivered']);
    expect(deliver).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledOnce();

    const second = await dispatcher.dispatch({ connectorId: 'wecom-main', replyHandle: 'reply-1', packets: packets() });
    expect(second.map((receipt) => receipt.status)).toEqual(['delivered', 'delivered']);
    expect(deliver).toHaveBeenCalledTimes(3);
    expect(new ChannelDeliveryStore(dataRoot).get('packet-1')).toMatchObject({ messageId: 'packet-1', attempt: 2, status: 'delivered' });
  });

  it('stops retrying at the configured bound and records failure', async () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-delivery-'));
    roots.push(dataRoot);
    const deliver = vi.fn(async () => ({ messageId: 'ignored', connectorId: 'wecom-main', status: 'retrying' as const, attempt: 1, safeCode: 'TEMPORARY' }));
    const dispatcher = new ChannelOutputDispatcher({ deliver }, new ChannelDeliveryStore(dataRoot), { maxAttempts: 2, sleep: async () => undefined });
    const receipts = await dispatcher.dispatch({ connectorId: 'wecom-main', replyHandle: 'reply-1', packets: packets() });
    expect(receipts[0]).toMatchObject({ status: 'failed', attempt: 2, safeCode: 'CHANNEL_DELIVERY_EXHAUSTED' });
    expect(deliver).toHaveBeenCalledTimes(4);
  });
});
