import { describe, expect, it, vi } from 'vitest';
import { SessionSerializingChannelRuntime, type ChannelFlowRuntimePort, type ChannelInvocation } from '..';

function invocation(messageId: string): ChannelInvocation {
  return {
    message: { protocolVersion: '1.0', id: messageId, origin: 'wecom', connectorId: 'wecom-main', conversationId: 'chat-1', actorId: 'user', content: { text: messageId }, receivedAt: '2026-09-04T10:00:00.000Z' },
    target: { kind: 'agent', id: 'agent-1' },
    sessionId: 'session-1',
  };
}

describe('SessionSerializingChannelRuntime', () => {
  it('serializes concurrent messages for the same session', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const entered: string[] = [];
    const runtime: ChannelFlowRuntimePort = {
      invoke: async function* () { /* compatibility */ },
      invokePackets: async function* (input) {
        entered.push(input.message.id);
        if (input.message.id === 'first') await firstGate;
        yield { protocolVersion: '1.0', flowId: input.message.id, packetId: `${input.message.id}-0`, sequence: 0, port: 'runtime.output', kind: 'complete', emittedAt: '2026-09-04T10:00:00.000Z', payload: { type: 'completed', resultRef: input.message.id } };
      },
    };
    const coordinated = new SessionSerializingChannelRuntime(runtime);
    const consume = async (input: ChannelInvocation) => {
      const packets = [];
      for await (const packet of coordinated.invokePackets(input)) packets.push(packet);
      return packets;
    };
    const first = consume(invocation('first'));
    await vi.waitFor(() => expect(entered).toEqual(['first']));
    const second = consume(invocation('second'));
    await Promise.resolve();
    expect(entered).toEqual(['first']);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(entered).toEqual(['first', 'second']);
  });

  it('does not serialize different sessions and delegates cancellation', async () => {
    const entered: string[] = [];
    const cancel = vi.fn(async () => undefined);
    const runtime: ChannelFlowRuntimePort = {
      invoke: async function* () { /* compatibility */ },
      invokePackets: async function* (input) {
        entered.push(input.sessionId ?? 'missing');
        yield { protocolVersion: '1.0', flowId: input.message.id, packetId: `${input.message.id}-0`, sequence: 0, port: 'runtime.output', kind: 'complete', emittedAt: '2026-09-04T10:00:00.000Z', payload: { type: 'completed', resultRef: input.message.id } };
      },
      cancel,
    };
    const coordinated = new SessionSerializingChannelRuntime(runtime);
    const other = { ...invocation('other'), sessionId: 'session-2' };
    await Promise.all([
      (async () => { for await (const _packet of coordinated.invokePackets(invocation('first'))) { /* consume */ } })(),
      (async () => { for await (const _packet of coordinated.invokePackets(other)) { /* consume */ } })(),
    ]);
    expect(entered).toEqual(expect.arrayContaining(['session-1', 'session-2']));
    await coordinated.cancel('session-1');
    expect(cancel).toHaveBeenCalledWith('session-1');
  });
});
