import { BoundedFlowPort, FlowPortClosedError } from '../../channel-runtime/flow-port';
import type {
  AgentOutputEvent,
  ChannelFlowRuntimePort,
  ChannelInvocation,
  FlowPacket,
} from '../../channel-runtime/types';
import type { EventType } from '../session/types';

export interface CollaborationChannelEvent {
  type: EventType;
  payload: Record<string, unknown>;
  source: string;
}

export interface CollaborationChannelBackendPort {
  resolveSession(input: ChannelInvocation): Promise<string>;
  subscribe(sessionId: string, listener: (event: CollaborationChannelEvent) => Promise<void>): () => void;
  send(sessionId: string, message: string, attachmentRefs: readonly string[]): Promise<{ success: boolean }>;
  abort(sessionId: string): Promise<void>;
}

export class CollaborationChannelRuntimeAdapter implements ChannelFlowRuntimePort {
  constructor(
    private readonly backend: CollaborationChannelBackendPort,
    private readonly portCapacity = 32,
  ) {}

  async *invoke(input: ChannelInvocation): AsyncIterable<AgentOutputEvent> {
    for await (const packet of this.invokePackets(input)) yield packet.payload;
  }

  async *invokePackets(input: ChannelInvocation): AsyncIterable<FlowPacket<AgentOutputEvent>> {
    if (input.target.kind !== 'project-multi-agent') {
      yield* this.failureFlow(input.message.id, 'CHANNEL_COLLABORATION_TARGET_INVALID');
      return;
    }
    const sessionId = await this.backend.resolveSession(input);
    const output = new BoundedFlowPort<AgentOutputEvent>({
      flowId: `${input.message.id}:${sessionId}`,
      port: 'collaboration.output',
      capacity: this.portCapacity,
    });
    await output.send({ type: 'accepted', sessionId });

    let pendingWrites = Promise.resolve();
    const unsubscribe = this.backend.subscribe(sessionId, (source) => {
      pendingWrites = pendingWrites.then(async () => {
        const event = toAgentOutputEvent(source, sessionId);
        if (!event) return;
        await writeOutput(output, event);
      });
      return pendingWrites;
    });
    void this.backend.send(
      sessionId,
      input.message.content.text ?? '',
      input.message.content.attachmentRefs ?? [],
    ).then(async (result) => {
      if (!result.success) await output.fail({ type: 'failed', safeCode: 'CHANNEL_COLLABORATION_REJECTED' });
    }).catch(async () => {
      try {
        await output.fail({ type: 'failed', safeCode: 'CHANNEL_COLLABORATION_FAILED' });
      } catch (error: unknown) {
        if (!(error instanceof FlowPortClosedError)) throw error;
      }
    });

    let reachedTerminal = false;
    try {
      for await (const packet of output) {
        yield packet;
        reachedTerminal = packet.kind !== 'data';
      }
    } finally {
      unsubscribe();
      if (!reachedTerminal) await this.backend.abort(sessionId);
    }
  }

  async cancel(sessionId: string): Promise<void> {
    await this.backend.abort(sessionId);
  }

  private async *failureFlow(messageId: string, safeCode: string): AsyncIterable<FlowPacket<AgentOutputEvent>> {
    const output = new BoundedFlowPort<AgentOutputEvent>({ flowId: messageId, port: 'collaboration.output', capacity: 1 });
    await output.fail({ type: 'failed', safeCode });
    yield* output;
  }
}

async function writeOutput(output: BoundedFlowPort<AgentOutputEvent>, event: AgentOutputEvent): Promise<void> {
  if (event.type === 'completed') await output.complete(event);
  else if (event.type === 'failed') await output.fail(event);
  else if (event.type === 'cancelled') await output.cancel(event);
  else await output.send(event);
}

function toAgentOutputEvent(event: CollaborationChannelEvent, sessionId: string): AgentOutputEvent | null {
  if (event.type === 'ASSISTANT_MESSAGE' || event.type === 'SUPERVISOR_AGGREGATE') {
    const content = stringValue(event.payload['content']) ?? stringValue(event.payload['result']);
    return content ? { type: 'assistant_message', content } : null;
  }
  if (event.type === 'HUMAN_REVIEW_REQUEST' || event.type === 'HITL_ESCALATE' || event.type === 'WORKER_BLOCK') {
    return {
      type: 'hitl_request',
      requestId: stringValue(event.payload['requestId']) ?? `${sessionId}:${event.type}`,
      summary: stringValue(event.payload['summary']) ?? stringValue(event.payload['question']) ?? '需要人工确认',
    };
  }
  if (event.type === 'TASK_STARTED') return { type: 'tool_status', label: taskLabel(event), state: 'running' };
  if (event.type === 'TASK_COMPLETED') return { type: 'tool_status', label: taskLabel(event), state: 'completed' };
  if (event.type === 'TASK_FAILED') return { type: 'tool_status', label: taskLabel(event), state: 'failed' };
  if (event.type === 'DAG_COMPLETE' || event.type === 'SESSION_COMPLETE' || event.type === 'SESSION_END') {
    return { type: 'completed', resultRef: stringValue(event.payload['resultRef']) ?? `collaboration://${sessionId}` };
  }
  if (event.type === 'DAG_FAIL' || event.type === 'SESSION_ERROR') return { type: 'failed', safeCode: 'CHANNEL_COLLABORATION_FAILED' };
  if (event.type === 'SESSION_ABORTED') return { type: 'cancelled' };
  return null;
}

function taskLabel(event: CollaborationChannelEvent): string {
  return stringValue(event.payload['description']) ?? stringValue(event.payload['taskId']) ?? 'project-task';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
