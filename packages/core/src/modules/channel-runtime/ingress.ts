import { packetizeOutputEvents } from './packet-stream';
import type { AgentOutputEvent, ChannelFlowMessageIngress, ChannelFlowRuntimePort, ChannelInvocation, FlowPacket, ChannelRuntimePort } from './types';
import { validateChannelInboundMessage, validateChannelRuntimeTarget } from './validation';

export class DefaultChannelMessageIngress implements ChannelFlowMessageIngress {
  constructor(private readonly runtime: ChannelRuntimePort) {}

  async *send(input: ChannelInvocation): AsyncIterable<AgentOutputEvent> {
    validateChannelInboundMessage(input.message);
    validateChannelRuntimeTarget(input.target);
    for await (const event of this.runtime.invoke(input)) yield event;
  }

  async *sendPackets(input: ChannelInvocation): AsyncIterable<FlowPacket<AgentOutputEvent>> {
    validateChannelInboundMessage(input.message);
    validateChannelRuntimeTarget(input.target);
    if (isFlowRuntime(this.runtime)) {
      yield* this.runtime.invokePackets(input);
      return;
    }
    yield* packetizeOutputEvents(input.message.id, 'runtime.output', this.runtime.invoke(input));
  }
}

function isFlowRuntime(runtime: ChannelRuntimePort): runtime is ChannelFlowRuntimePort {
  return 'invokePackets' in runtime && typeof runtime.invokePackets === 'function';
}
