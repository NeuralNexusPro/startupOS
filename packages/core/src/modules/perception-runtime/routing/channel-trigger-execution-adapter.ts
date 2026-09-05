import type { ChannelInvocation, ChannelMessageIngress, ChannelRuntimeTarget } from '../../channel-runtime';
import type {
  PerceptionTriggerTarget,
  TriggerExecutionPort,
  TriggerExecutionResult,
} from '../../../types/perception';

export interface ChannelTriggerEscalationNotifier {
  notify(input: {
    eventId: string;
    connectorId: string;
    actorId: string;
    subject?: string;
    target: PerceptionTriggerTarget;
  }): Promise<void>;
}

export class ChannelTriggerExecutionAdapter implements TriggerExecutionPort {
  constructor(
    private readonly ingress: ChannelMessageIngress,
    private readonly escalationNotifier?: ChannelTriggerEscalationNotifier,
  ) {}

  async dispatch(input: Parameters<TriggerExecutionPort['dispatch']>[0]): Promise<TriggerExecutionResult> {
    const invocation = toChannelInvocation(input);
    let sessionId: string | undefined;
    let resultRef: string | undefined;
    const responseTexts: string[] = [];
    for await (const output of this.ingress.send(invocation)) {
      if (output.type === 'accepted') sessionId = output.sessionId;
      else if (output.type === 'assistant_message') responseTexts.push(output.content);
      else if (output.type === 'completed') resultRef = output.resultRef;
      else if (output.type === 'failed' || output.type === 'cancelled') throw new Error('CHANNEL_TRIGGER_FAILED');
    }
    if (!resultRef) throw new Error('CHANNEL_TRIGGER_INCOMPLETE');
    const responseText = responseTexts.at(-1);
    if (responseText?.includes('[PERCEPTION_ESCALATE]')) await this.notifyEscalation(input);
    return {
      resultRef,
      ...(sessionId ? { sessionId } : {}),
      ...(responseText ? { responseText } : {}),
      ...(responseTexts.length > 0 ? { responseTexts } : {}),
    };
  }

  private async notifyEscalation(input: Parameters<TriggerExecutionPort['dispatch']>[0]): Promise<void> {
    if (!this.escalationNotifier) return;
    try {
      await this.escalationNotifier.notify({
        eventId: input.event.id,
        connectorId: input.event.connectorId,
        actorId: input.event.actor.externalId,
        subject: input.event.content.subject,
        target: input.target,
      });
    } catch {
      // Notification remains best-effort and must not retry a completed target.
    }
  }
}

function toChannelInvocation(input: Parameters<TriggerExecutionPort['dispatch']>[0]): ChannelInvocation {
  const event = input.event;
  return {
    message: {
      protocolVersion: '1.0',
      id: event.id,
      origin: event.source,
      connectorId: event.connectorId,
      conversationId: event.conversation?.externalId ?? event.sourceEventId,
      actorId: event.actor.externalId,
      content: {
        text: perceptionText(input),
        ...(event.content.attachmentRefs?.length ? { attachmentRefs: event.content.attachmentRefs } : {}),
      },
      receivedAt: event.receivedAt,
    },
    target: toChannelTarget(input.target),
  };
}

function perceptionText(input: Parameters<TriggerExecutionPort['dispatch']>[0]): string {
  const lines = [
    `Perception event: ${input.event.id}`,
    `Rule: ${input.context.ruleId}`,
    `Requires HITL for protected actions: ${input.context.requireHitl ? 'yes' : 'no'}`,
    'If human handling is required, include the exact marker [PERCEPTION_ESCALATE] once in the final response.',
  ];
  if (input.event.content.subject) lines.push(`Subject: ${input.event.content.subject}`);
  if (input.event.content.text) lines.push('', input.event.content.text);
  return lines.join('\n');
}

function toChannelTarget(target: PerceptionTriggerTarget): ChannelRuntimeTarget {
  if (target.kind === 'project') return { kind: 'project-agent', id: target.id, projectId: target.id };
  if (target.kind === 'role-agent') return { kind: 'role-agent', id: target.id };
  return {
    kind: 'skill',
    id: target.id,
    ownership: target.skillOwnership ?? { mode: 'ephemeral' },
  };
}
