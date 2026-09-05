import { CHANNEL_PROTOCOL_VERSION, type AgentOutputEvent, type FlowPacket, type FlowPacketKind } from './types';

export async function* packetizeOutputEvents(
  flowId: string,
  port: string,
  events: AsyncIterable<AgentOutputEvent>,
  clock: () => string = () => new Date().toISOString(),
): AsyncIterable<FlowPacket<AgentOutputEvent>> {
  let sequence = 0;
  let terminated = false;
  for await (const payload of events) {
    if (terminated) break;
    const kind = outputEventPacketKind(payload);
    yield {
      protocolVersion: CHANNEL_PROTOCOL_VERSION,
      flowId,
      packetId: `${flowId}:${port}:${sequence}`,
      sequence,
      port,
      kind,
      emittedAt: clock(),
      payload,
    };
    sequence += 1;
    terminated = kind !== 'data';
  }
}

function outputEventPacketKind(event: AgentOutputEvent): FlowPacketKind {
  if (event.type === 'completed') return 'complete';
  if (event.type === 'failed') return 'error';
  if (event.type === 'cancelled') return 'control';
  return 'data';
}
