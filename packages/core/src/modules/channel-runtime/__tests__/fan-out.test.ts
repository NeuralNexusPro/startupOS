import { describe, expect, it, vi } from 'vitest';
import { fanOutFlowPackets, type FlowPacket } from '..';

function packet(sequence: number): FlowPacket<string> {
  return { protocolVersion: '1.0', flowId: 'flow-1', packetId: `packet-${sequence}`, sequence, port: 'runtime.output', kind: sequence === 2 ? 'complete' : 'data', emittedAt: '2026-09-07T00:00:00.000Z', payload: String(sequence) };
}

describe('fanOutFlowPackets', () => {
  it('preserves packet identity and order for fast and slow bounded branches', async () => {
    async function* source(): AsyncIterable<FlowPacket<string>> { yield packet(0); yield packet(1); yield packet(2); }
    const fanOut = fanOutFlowPackets(source(), { branches: 2, capacity: 1 });
    const fast: FlowPacket<string>[] = [];
    const slow: FlowPacket<string>[] = [];
    await Promise.all([
      (async () => { for await (const value of fanOut.branches[0]!) fast.push(value); })(),
      (async () => { for await (const value of fanOut.branches[1]!) { await Promise.resolve(); slow.push(value); } })(),
      fanOut.completed,
    ]);
    expect(fast.map(({ packetId }) => packetId)).toEqual(['packet-0', 'packet-1', 'packet-2']);
    expect(slow).toEqual(fast);
  });

  it('reports an abandoned branch while allowing remaining branches to finish', async () => {
    async function* source(): AsyncIterable<FlowPacket<string>> { yield packet(0); yield packet(1); yield packet(2); }
    const onBranchClosed = vi.fn();
    const fanOut = fanOutFlowPackets(source(), { branches: 2, capacity: 1, onBranchClosed });
    const abandoned = fanOut.branches[0]![Symbol.asyncIterator]();
    await abandoned.next();
    await abandoned.return?.();
    const remaining: string[] = [];
    for await (const value of fanOut.branches[1]!) remaining.push(value.packetId);
    await fanOut.completed;
    expect(remaining).toEqual(['packet-0', 'packet-1', 'packet-2']);
    expect(onBranchClosed).toHaveBeenCalledWith(0, 'FLOW_BRANCH_CLOSED');
  });
});
