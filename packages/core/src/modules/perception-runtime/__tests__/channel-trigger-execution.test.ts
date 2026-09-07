import { describe, expect, it, vi } from 'vitest';
import { ChannelTriggerExecutionAdapter } from '../routing/channel-trigger-execution-adapter';
import type { ChannelFlowMessageIngress, ChannelInvocation, ChannelMessageIngress } from '../../channel-runtime';
import type { PerceptionEventV1, PerceptionTriggerExecutionContext, PerceptionTriggerTarget } from '../../../types/perception';

const event: PerceptionEventV1 = {
  schemaVersion: '1.0', id: 'event-1', source: 'email', sourceEventId: 'mail-1', connectorId: 'email-main', type: 'mail.received',
  occurredAt: '2026-09-04T10:00:00.000Z', receivedAt: '2026-09-04T10:00:01.000Z', actor: { externalId: 'sender@example.test' },
  conversation: { externalId: 'thread-1', kind: 'thread' }, content: { subject: 'Invoice', text: 'Please review', attachmentRefs: ['attachment://one'] },
  provenance: { rawPayloadRef: 'perception://raw/one' },
};
const context: PerceptionTriggerExecutionContext = {
  connectorId: 'email-main', eventId: 'event-1', ruleId: 'rule-1', leaseId: 'lease-1', rawPayloadRef: 'perception://raw/one',
  requireHitl: true, cognitionOwner: { kind: 'project', id: 'project-1' },
};

describe('ChannelTriggerExecutionAdapter', () => {
  it('maps perception data to Channel ingress and collects streamed assistant output', async () => {
    let received: ChannelInvocation | undefined;
    const ingress: ChannelMessageIngress = {
      send: async function* (input) {
        received = input;
        yield { type: 'accepted', sessionId: 'session-1' };
        yield { type: 'text_delta', delta: 'partial' };
        yield { type: 'assistant_message', content: 'Complete response' };
        yield { type: 'completed', resultRef: 'session://session-1' };
      },
    };
    const result = await new ChannelTriggerExecutionAdapter(ingress).dispatch({ event, target: { kind: 'project', id: 'project-1' }, context });
    expect(received).toMatchObject({
      message: { origin: 'email', connectorId: 'email-main', conversationId: 'thread-1', actorId: 'sender@example.test', content: { attachmentRefs: ['attachment://one'] } },
      target: { kind: 'project-agent', id: 'project-1', projectId: 'project-1' },
    });
    expect(received?.message.content.text).toContain('Subject: Invoice');
    expect(received?.message.content.text).toContain('Please review');
    expect(result).toEqual({ resultRef: 'session://session-1', sessionId: 'session-1', responseText: 'Complete response', responseTexts: ['Complete response'] });
  });

  it('maps role and Skill ownership and preserves escalation notifications', async () => {
    const targets: ChannelInvocation['target'][] = [];
    const ingress: ChannelMessageIngress = {
      send: async function* (input) {
        targets.push(input.target);
        yield { type: 'accepted', sessionId: 'session-1' };
        yield { type: 'assistant_message', content: '[PERCEPTION_ESCALATE] Need approval' };
        yield { type: 'completed', resultRef: 'session://session-1' };
      },
    };
    const notify = vi.fn(async () => undefined);
    const adapter = new ChannelTriggerExecutionAdapter(ingress, { notify });
    const inputs: PerceptionTriggerTarget[] = [
      { kind: 'role-agent', id: 'role-1' },
      { kind: 'skill', id: 'skill-1', skillOwnership: { mode: 'inherited', ownerKind: 'project', ownerId: 'project-1' } },
    ];
    for (const target of inputs) await adapter.dispatch({ event, target, context });
    expect(targets).toEqual([
      { kind: 'role-agent', id: 'role-1' },
      { kind: 'skill', id: 'skill-1', ownership: { mode: 'inherited', ownerKind: 'project', ownerId: 'project-1' } },
    ]);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('fails when Channel terminates without a result', async () => {
    const ingress: ChannelMessageIngress = { send: async function* () { yield { type: 'failed', safeCode: 'CHANNEL_RUNTIME_FAILED' }; } };
    await expect(new ChannelTriggerExecutionAdapter(ingress).dispatch({ event, target: { kind: 'role-agent', id: 'role-1' }, context }))
      .rejects.toThrow('CHANNEL_TRIGGER_FAILED');
  });

  it('degrades HITL to a system notification when the source has no active reply handle', async () => {
    const ingress: ChannelMessageIngress = { send: async function* () {
      yield { type: 'accepted', sessionId: 'session-1' };
      yield { type: 'hitl_request', requestId: 'review-1', summary: 'Approve?' };
      yield { type: 'completed', resultRef: 'session://session-1' };
    } };
    const notify = vi.fn(async () => undefined);
    const adapter = new ChannelTriggerExecutionAdapter(ingress, { notify }, { canDeliver: () => false, dispatch: vi.fn() });
    await adapter.dispatch({ event, target: { kind: 'role-agent', id: 'role-1' }, context });
    expect(notify).toHaveBeenCalledOnce();
  });

  it('fans packets into collection and registered plugin delivery', async () => {
    const ingress: ChannelFlowMessageIngress = {
      send: async function* () { /* packet path is required */ },
      sendPackets: async function* () {
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p0', sequence: 0, port: 'runtime.output', kind: 'data', emittedAt: event.receivedAt, payload: { type: 'accepted', sessionId: 'session-1' } };
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p1', sequence: 1, port: 'runtime.output', kind: 'data', emittedAt: event.receivedAt, payload: { type: 'assistant_message', content: 'Delivered response' } };
        yield { protocolVersion: '1.0', flowId: 'flow-1', packetId: 'p2', sequence: 2, port: 'runtime.output', kind: 'complete', emittedAt: event.receivedAt, payload: { type: 'completed', resultRef: 'session://session-1' } };
      },
    };
    const dispatch = vi.fn(async ({ packets }: { packets: AsyncIterable<unknown> }) => {
      for await (const _packet of packets) { /* consume delivery branch */ }
      return [];
    });
    const adapter = new ChannelTriggerExecutionAdapter(ingress, undefined, { canDeliver: () => true, dispatch });
    await expect(adapter.dispatch({ event, target: { kind: 'project', id: 'project-1' }, context })).resolves.toMatchObject({ responseText: 'Delivered response' });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ connectorId: 'email-main', replyHandle: 'perception://raw/one' }));
  });
});
