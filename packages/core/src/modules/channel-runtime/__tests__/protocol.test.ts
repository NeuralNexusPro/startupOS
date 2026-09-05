import { describe, expect, it } from 'vitest';
import {
  DefaultChannelMessageIngress,
  validateChannelInboundMessage,
  validateChannelRuntimeTarget,
  type AgentOutputEvent,
  type ChannelInboundMessage,
  type ChannelRuntimePort,
  type ChannelFlowRuntimePort,
} from '..';

function message(overrides: Partial<ChannelInboundMessage> = {}): ChannelInboundMessage {
  return {
    protocolVersion: '1.0', id: 'message-1', origin: 'wecom', connectorId: 'wecom-main',
    conversationId: 'conversation-1', actorId: 'user-1', content: { text: 'hello' },
    replyHandle: 'reply-1', receivedAt: '2026-09-04T10:00:00.000Z', ...overrides,
  };
}

describe('channel protocol', () => {
  it('accepts a structured inbound message and all supported runtime targets', () => {
    expect(validateChannelInboundMessage(message())).toEqual(message());
    for (const target of [
      { kind: 'agent', id: 'agent-1' }, { kind: 'role-agent', id: 'role-1' },
      { kind: 'project-agent', id: 'project-agent-1', projectId: 'project-1' },
      { kind: 'skill', id: 'skill-1', ownership: { mode: 'ephemeral' } },
      { kind: 'project-multi-agent', projectId: 'project-1', runtime: 'collaboration' },
    ] as const) expect(validateChannelRuntimeTarget(target)).toEqual(target);
  });

  it('rejects empty content, unsupported origins, unsafe reply handles and invalid targets', () => {
    expect(() => validateChannelInboundMessage(message({ content: {} }))).toThrow('CHANNEL_CONTENT_EMPTY');
    expect(() => validateChannelInboundMessage(message({ origin: 'unknown' as 'wecom' }))).toThrow('CHANNEL_ORIGIN_UNSUPPORTED');
    expect(() => validateChannelInboundMessage(message({ replyHandle: '../secret' }))).toThrow('CHANNEL_REPLY_HANDLE_INVALID');
    expect(() => validateChannelRuntimeTarget({ kind: 'agent', id: '../escape' })).toThrow('CHANNEL_TARGET_ID_INVALID');
  });

  it('passes validated messages to an injected runtime and preserves event order', async () => {
    const expected: AgentOutputEvent[] = [
      { type: 'accepted', sessionId: 'session-1' },
      { type: 'assistant_message', content: 'done' },
      { type: 'completed', resultRef: 'session://session-1' },
    ];
    const runtime: ChannelRuntimePort = { invoke: async function* () { yield* expected; } };
    const events: AgentOutputEvent[] = [];
    for await (const event of new DefaultChannelMessageIngress(runtime).send({ message: message(), target: { kind: 'agent', id: 'agent-1' } })) events.push(event);
    expect(events).toEqual(expected);
  });

  it('exposes the same validated invocation as an FBP packet stream', async () => {
    const runtime: ChannelFlowRuntimePort = {
      invoke: async function* () { yield { type: 'completed', resultRef: 'legacy' }; },
      invokePackets: async function* () {
        yield {
          protocolVersion: '1.0', flowId: 'flow-1', packetId: 'packet-0', sequence: 0,
          port: 'runtime.output', kind: 'complete', emittedAt: '2026-09-04T10:00:00.000Z',
          payload: { type: 'completed', resultRef: 'session://session-1' },
        };
      },
    };
    const ingress = new DefaultChannelMessageIngress(runtime);
    const packets = [];
    for await (const packet of ingress.sendPackets({ message: message(), target: { kind: 'agent', id: 'agent-1' } })) packets.push(packet);
    expect(packets).toHaveLength(1);
    expect(packets[0]).toMatchObject({ kind: 'complete', sequence: 0, payload: { type: 'completed' } });
  });
});
