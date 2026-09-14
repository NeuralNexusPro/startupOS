import type { AgentOutputEvent, ChannelFlowRuntimePort, ChannelInvocation, FlowPacket } from './types';

export class SessionSerializingChannelRuntime implements ChannelFlowRuntimePort {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly runtime: ChannelFlowRuntimePort) {}

  async *invoke(input: ChannelInvocation): AsyncIterable<AgentOutputEvent> {
    for await (const packet of this.invokePackets(input)) yield packet.payload;
  }

  async *invokePackets(input: ChannelInvocation): AsyncIterable<FlowPacket<AgentOutputEvent>> {
    if (!input.sessionId) {
      yield {
        protocolVersion: '1.0', flowId: input.message.id, packetId: `${input.message.id}:session-error`,
        sequence: 0, port: 'runtime.output', kind: 'error', emittedAt: new Date().toISOString(),
        payload: { type: 'failed', safeCode: 'CHANNEL_SESSION_ID_REQUIRED' },
      };
      return;
    }
    const release = await this.acquire(input.sessionId);
    try {
      yield* this.runtime.invokePackets(input);
    } finally {
      release();
    }
  }

  async cancel(sessionId: string): Promise<void> {
    await this.runtime.cancel?.(sessionId);
  }

  private async acquire(sessionId: string): Promise<() => void> {
    const previous = this.tails.get(sessionId) ?? Promise.resolve();
    let releaseGate: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const tail = previous.then(() => gate);
    this.tails.set(sessionId, tail);
    await previous;
    return () => {
      if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId);
      releaseGate?.();
    };
  }
}
