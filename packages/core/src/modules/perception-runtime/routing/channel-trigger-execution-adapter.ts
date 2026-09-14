import { randomUUID } from 'node:crypto';
import { writePluginLog, type PluginLogPort } from '../plugins/logging';
import { withChannelFileReply, type ChannelReplyFile, type ChannelFileSender } from '../../../lib/integrations/pi-agent/channel-file-reply';
import { fanOutFlowPackets, isImChannel } from '../../channel-runtime';
import type { AgentOutputEvent, ChannelFlowMessageIngress, ChannelInvocation, ChannelMessageIngress, ChannelRuntimeTarget, DeliveryReceipt, FlowPacket } from '../../channel-runtime';
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

export interface ChannelTriggerDeliveryPort {
  canDeliver(replyHandle: string): boolean;
  captureFileSender?(replyHandle: string): ChannelFileSender | undefined;
  canSendFile?(replyHandle: string): boolean;
  sendFile?(replyHandle: string, file: ChannelReplyFile, toolCallId: string, signal?: AbortSignal): Promise<void>;
  dispatch(input: { connectorId: string; replyHandle: string; packets: AsyncIterable<FlowPacket<AgentOutputEvent>>; onDiagnostic?: (error: unknown) => void }): Promise<DeliveryReceipt[]>;
}

export class ChannelTriggerExecutionAdapter implements TriggerExecutionPort {
  constructor(
    private readonly ingress: ChannelMessageIngress,
    private readonly escalationNotifier?: ChannelTriggerEscalationNotifier,
    private readonly delivery?: ChannelTriggerDeliveryPort,
    private readonly logFor?: (source: string, connectorId: string) => PluginLogPort,
  ) {}

  async dispatch(input: Parameters<TriggerExecutionPort['dispatch']>[0]): Promise<TriggerExecutionResult> {
    const invocation = toChannelInvocation(input);
    const log = this.logFor?.(input.event.source, input.event.connectorId);
    invocation.onDiagnostic = diagnostic => writePluginLog(log, { level: 'error', ...diagnostic });
    let sessionId: string | undefined;
    let resultRef: string | undefined;
    let hitlRequested = false;
    let escalationNotified = false;
    const responseTexts: string[] = [];
    const consume = async (outputs: AsyncIterable<AgentOutputEvent>): Promise<void> => { for await (const output of outputs) {
      if (output.type === 'accepted') sessionId = output.sessionId;
      else if (output.type === 'assistant_message') responseTexts.push(output.content);
      else if (output.type === 'hitl_request') hitlRequested = true;
      else if (output.type === 'completed') resultRef = output.resultRef;
      else if (output.type === 'failed' || output.type === 'cancelled') throw Object.assign(new Error('CHANNEL_TRIGGER_FAILED'), { safeCode: output.type === 'failed' ? output.safeCode : 'CHANNEL_CANCELLED', diagnosticId: output.type === 'failed' ? output.diagnosticId : undefined, sessionId });
    } };
    try {
    const replyHandle = invocation.message.replyHandle;
    if (replyHandle && this.delivery?.canDeliver(replyHandle) && isFlowIngress(this.ingress)) {
      const ingress = this.ingress;
      const delivery = this.delivery;
      const run = async () => {
        let deliveryDiagnosticId: string | undefined;
        const fanOut = fanOutFlowPackets(ingress.sendPackets(invocation), { branches: 2 });
        await Promise.all([
          consume(unpack(fanOut.branches[0]!)),
          delivery.dispatch({ connectorId: invocation.message.connectorId, replyHandle, packets: fanOut.branches[1]!, onDiagnostic: error => {
            deliveryDiagnosticId ??= randomUUID();
            writePluginLog(log, { level: 'error', stage: 'delivery', safeCode: 'CHANNEL_DELIVERY_FAILED', eventId: input.event.id, sessionId, diagnosticId: deliveryDiagnosticId, error });
          } }).then(receipts => {
            if (receipts.some(receipt => receipt.status === 'failed' || receipt.status === 'expired')) {
              const diagnosticId = deliveryDiagnosticId ?? randomUUID();
              writePluginLog(log, { level: 'error', stage: 'delivery', safeCode: 'CHANNEL_DELIVERY_FAILED', eventId: input.event.id, sessionId, diagnosticId });
              throw Object.assign(new Error('CHANNEL_DELIVERY_FAILED'), { diagnosticId, safeCode: 'CHANNEL_DELIVERY_FAILED', sessionId });
            }
          }),
          fanOut.completed,
        ]);
      };
      const sender = delivery.captureFileSender?.(replyHandle);
      if (sender) await withChannelFileReply(sender, run);
      else await run();
    } else {
      await consume(this.ingress.send(invocation));
    }
    if (!resultRef) throw new Error('CHANNEL_TRIGGER_INCOMPLETE');
    if (hitlRequested && (!replyHandle || !this.delivery?.canDeliver(replyHandle))) {
      await this.notifyEscalation(input);
      escalationNotified = true;
    }
    const responseText = responseTexts.at(-1);
    if (!escalationNotified && responseText?.includes('[PERCEPTION_ESCALATE]')) await this.notifyEscalation(input);
    return {
      resultRef,
      ...(sessionId ? { sessionId } : {}),
      ...(responseText ? { responseText } : {}),
      ...(responseTexts.length > 0 ? { responseTexts } : {}),
    };
    } catch (error) {
      if (error instanceof Error && 'diagnosticId' in error && error.diagnosticId) throw error;
      const diagnosticId = randomUUID();
      writePluginLog(log, { level: 'error', stage: 'ingress', safeCode: 'CHANNEL_TRIGGER_FAILED', eventId: input.event.id, sessionId, diagnosticId, error });
      throw Object.assign(new Error('CHANNEL_TRIGGER_FAILED'), { safeCode: 'CHANNEL_TRIGGER_FAILED', diagnosticId, sessionId });
    }
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
      ...(event.actor.displayName !== undefined ? { actorDisplayName: event.actor.displayName } : {}),
      ...(event.conversation ? { conversationKind: event.conversation.kind } : {}),
      content: {
        text: isImChannel(event.source) ? event.content.text : perceptionText(input),
        ...(event.content.attachmentRefs?.length ? { attachmentRefs: event.content.attachmentRefs } : {}),
      },
      receivedAt: event.receivedAt,
      replyHandle: event.provenance.rawPayloadRef,
    },
    target: toChannelTarget(input.target),
  };
}

function isFlowIngress(ingress: ChannelMessageIngress): ingress is ChannelFlowMessageIngress {
  return 'sendPackets' in ingress && typeof (ingress as Partial<ChannelFlowMessageIngress>).sendPackets === 'function';
}

async function* unpack(packets: AsyncIterable<FlowPacket<AgentOutputEvent>>): AsyncIterable<AgentOutputEvent> {
  for await (const packet of packets) yield packet.payload;
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
