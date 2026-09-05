import { describe, expect, it, vi } from 'vitest';
import { BoundedFlowPort, FlowPortClosedError } from '..';

describe('BoundedFlowPort', () => {
  it('applies backpressure when its bounded buffer is full', async () => {
    const port = new BoundedFlowPort<string>({
      flowId: 'flow-1',
      port: 'runtime.output',
      capacity: 1,
      idFactory: (sequence) => `packet-${sequence}`,
      clock: () => '2026-09-04T10:00:00.000Z',
    });

    await port.send('first');
    const released = vi.fn();
    const blocked = port.send('second').then(released);
    await Promise.resolve();
    expect(released).not.toHaveBeenCalled();

    const iterator = port[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ value: { payload: 'first', sequence: 0 } });
    await blocked;
    expect(released).toHaveBeenCalledOnce();
    await expect(iterator.next()).resolves.toMatchObject({ value: { payload: 'second', sequence: 1 } });
  });

  it('emits one ordered terminal packet and rejects writes after it', async () => {
    const port = new BoundedFlowPort<string>({ flowId: 'flow-2', port: 'runtime.output', capacity: 2 });
    await port.send('delta');
    await port.complete('done');

    await expect(port.send('late')).rejects.toBeInstanceOf(FlowPortClosedError);
    await expect(port.fail('duplicate-terminal')).rejects.toBeInstanceOf(FlowPortClosedError);

    const packets = [];
    for await (const packet of port) packets.push(packet);
    expect(packets.map(({ kind, sequence, payload }) => ({ kind, sequence, payload }))).toEqual([
      { kind: 'data', sequence: 0, payload: 'delta' },
      { kind: 'complete', sequence: 1, payload: 'done' },
    ]);
  });

  it('emits cancellation once and exposes the abort signal to the producer', async () => {
    const port = new BoundedFlowPort<string>({ flowId: 'flow-3', port: 'runtime.output', capacity: 1 });
    expect(port.signal.aborted).toBe(false);
    await port.cancel('cancelled');
    expect(port.signal.aborted).toBe(true);
    await expect(port.cancel('again')).rejects.toBeInstanceOf(FlowPortClosedError);

    const packets = [];
    for await (const packet of port) packets.push(packet);
    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({ kind: 'control', payload: 'cancelled', sequence: 0 });
  });
});
