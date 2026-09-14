import { DefaultChannelMessageIngress } from './ingress';
import { ChannelSessionBindingStore } from './session-binding-store';
import type {
  AgentOutputEvent,
  ChannelFlowMessageIngress,
  ChannelInvocation,
  ChannelRuntimePort,
  FlowPacket,
} from './types';

export interface ChannelSessionProvisionerPort {
  provision(input: ChannelInvocation): Promise<string>;
}

export class BindingChannelMessageIngress implements ChannelFlowMessageIngress {
  private readonly ingress: DefaultChannelMessageIngress;

  constructor(
    private readonly bindings: ChannelSessionBindingStore,
    private readonly sessions: ChannelSessionProvisionerPort,
    runtime: ChannelRuntimePort,
  ) {
    this.ingress = new DefaultChannelMessageIngress(runtime);
  }

  async *send(input: ChannelInvocation): AsyncIterable<AgentOutputEvent> {
    yield* this.ingress.send(await this.bind(input));
  }

  async *sendPackets(input: ChannelInvocation): AsyncIterable<FlowPacket<AgentOutputEvent>> {
    yield* this.ingress.sendPackets(await this.bind(input));
  }

  private async bind(input: ChannelInvocation): Promise<ChannelInvocation> {
    if (input.sessionId) return input;
    const binding = await this.bindings.resolve({
      origin: input.message.origin,
      connectorId: input.message.connectorId,
      conversationId: input.message.conversationId,
      target: input.target,
      createSessionId: () => this.sessions.provision(input),
    });
    return { ...input, sessionId: binding.sessionId };
  }
}
