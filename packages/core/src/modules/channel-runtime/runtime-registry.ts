import { packetizeOutputEvents } from './packet-stream';
import type { AgentOutputEvent, ChannelFlowRuntimePort, ChannelInvocation, ChannelRuntimePort, ChannelRuntimeTarget, FlowPacket } from './types';

export type ChannelRuntimeKind = ChannelRuntimeTarget['kind'];

export class ChannelRuntimeRegistry implements ChannelFlowRuntimePort {
  private readonly runtimes = new Map<ChannelRuntimeKind, ChannelRuntimePort>();

  register(kind: ChannelRuntimeKind, runtime: ChannelRuntimePort): void {
    if (this.runtimes.has(kind)) throw new Error(`CHANNEL_RUNTIME_ALREADY_REGISTERED:${kind}`);
    this.runtimes.set(kind, runtime);
  }

  async *invoke(input: ChannelInvocation) {
    const runtime = this.runtimes.get(input.target.kind);
    if (!runtime) {
      yield { type: 'failed' as const, safeCode: 'CHANNEL_RUNTIME_NOT_REGISTERED' };
      return;
    }
    yield* runtime.invoke(input);
  }

  async *invokePackets(input: ChannelInvocation): AsyncIterable<FlowPacket<AgentOutputEvent>> {
    const runtime = this.runtimes.get(input.target.kind);
    if (!runtime) {
      yield* packetizeOutputEvents(input.message.id, 'runtime.output', this.invoke(input));
      return;
    }
    if ('invokePackets' in runtime && typeof runtime.invokePackets === 'function') {
      yield* (runtime as ChannelFlowRuntimePort).invokePackets(input);
      return;
    }
    yield* packetizeOutputEvents(input.message.id, 'runtime.output', runtime.invoke(input));
  }

  async cancel(sessionId: string): Promise<void> {
    await Promise.all([...this.runtimes.values()].map(async (runtime) => runtime.cancel?.(sessionId)));
  }
}
