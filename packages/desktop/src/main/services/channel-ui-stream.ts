import { randomUUID } from 'node:crypto';
import type { AgentSession } from '../../../../core/src/types/agent';
import type {
  AgentOutputEvent,
  ChannelFlowMessageIngress,
  ChannelRuntimeTarget,
} from '../../../../core/src/modules/channel-runtime';
import {
  getVisibleStreamDelta,
  reconcileFinalStreamContent,
} from '../../../../core/src/lib/integrations/pi-agent/stream-dedupe';
import { StreamEventBatcher } from './stream-event-batcher';

interface UiChannelStreamRequest {
  ingress: ChannelFlowMessageIngress;
  session: AgentSession;
  content: string;
  streamId?: string;
  send(payload: Record<string, unknown>): void;
}

export function toUiChannelTarget(session: AgentSession): ChannelRuntimeTarget {
  const entryId = session.projectContext.entryId ?? session.projectContext.projectId;
  if (session.projectContext.entryType === 'role-agent') return { kind: 'role-agent', id: entryId };
  if (session.projectContext.entryType === 'agent') return { kind: 'agent', id: entryId };
  if (session.projectContext.entryType === 'skill') {
    return { kind: 'skill', id: entryId, ownership: { mode: 'ephemeral' } };
  }
  return {
    kind: 'project-agent',
    id: session.projectContext.projectId,
    projectId: session.projectContext.projectId,
  };
}

export async function runUiChannelStream(request: UiChannelStreamRequest): Promise<void> {
  const { session, streamId, send } = request;
  const sendPayload = (type: string, data: unknown): void => send({
    type,
    sessionId: session.sessionId,
    streamId,
    data,
  });
  const batcher = new StreamEventBatcher({
    onFlush: (events) => send({
      type: 'batch_events',
      sessionId: session.sessionId,
      streamId,
      events,
    }),
  });
  let assistantContent = '';
  let failed = false;
  let terminalSent = false;

  const emit = (event: AgentOutputEvent): void => {
    switch (event.type) {
      case 'accepted':
        return;
      case 'text_delta': {
        const merged = getVisibleStreamDelta(assistantContent, event.delta);
        assistantContent = merged.content;
        if (merged.delta) batcher.push({ type: 'text_delta', data: { delta: merged.delta } });
        return;
      }
      case 'tool_status':
        batcher.flush();
        sendPayload(event.state === 'running' ? 'tool_start' : 'tool_end', { toolName: event.label });
        return;
      case 'hitl_request':
        batcher.flush();
        sendPayload('hitl_request', { requestId: event.requestId, summary: event.summary });
        return;
      case 'artifact_changed':
        batcher.flush();
        sendPayload('artifact_changed', {
          filename: event.filename,
          filePath: event.filePath,
          artifactType: event.artifactType,
        });
        return;
      case 'assistant_message':
        assistantContent = reconcileFinalStreamContent(assistantContent, event.content);
        batcher.flush();
        sendPayload('assistant_message', { content: assistantContent, isStreaming: false });
        return;
      case 'failed':
        failed = true;
        batcher.flush();
        sendPayload('error', { message: event.safeCode });
        sendPayload('agent_error', { message: event.safeCode });
        return;
      case 'cancelled':
        failed = true;
        batcher.flush();
        sendPayload('error', { message: 'CHANNEL_RUNTIME_CANCELLED' });
        return;
      case 'completed':
        return;
    }
  };

  try {
    const packets = request.ingress.sendPackets({
      message: {
        protocolVersion: '1.0',
        id: randomUUID(),
        origin: 'originos-ui',
        connectorId: 'desktop',
        conversationId: session.sessionId,
        actorId: session.projectContext.userId ?? 'local-user',
        content: { text: request.content },
        receivedAt: new Date().toISOString(),
      },
      target: toUiChannelTarget(session),
      sessionId: session.sessionId,
      sessionProjectId: session.projectContext.projectId,
    });
    for await (const packet of packets) emit(packet.payload);
  } catch {
    failed = true;
    sendPayload('error', { message: 'CHANNEL_RUNTIME_FAILED' });
    sendPayload('agent_error', { message: 'CHANNEL_RUNTIME_FAILED' });
  } finally {
    batcher.dispose();
    if (!terminalSent) {
      terminalSent = true;
      sendPayload('done', { content: assistantContent, failed });
    }
  }
}
