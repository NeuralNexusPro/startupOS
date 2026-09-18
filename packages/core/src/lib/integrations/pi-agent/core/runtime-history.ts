import type { AgentMessage } from '@originos/pi-agent-adapter';
import type {
  Api,
  AssistantMessage,
  Model,
} from '@originos/pi-agent-adapter/ai';
import { encodeCommunicationUserMessage, type CommunicationSource } from '../../../shared/cognitive';

export interface PersistedRuntimeMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'toolResult';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type RestorableRuntimeApi =
  | 'anthropic-messages'
  | 'openai-completions'
  | 'google'
  | 'azure-openai-responses';

function isRestorableRuntimeApi(api: Api): api is RestorableRuntimeApi {
  return api === 'anthropic-messages'
    || api === 'openai-completions'
    || api === 'google'
    || api === 'azure-openai-responses';
}

export function toRestorableRuntimeModel(
  model: Model<Api>,
): Model<RestorableRuntimeApi> {
  if (!isRestorableRuntimeApi(model.api)) {
    throw new Error(`不支持恢复消息的 Runtime API: ${model.api}`);
  }

  return {
    ...model,
    api: model.api,
  };
}

function createRestoredUsage(): AssistantMessage['usage'] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

export function mapPersistedMessagesForRuntime(
  messages: readonly PersistedRuntimeMessage[],
  model: Model<RestorableRuntimeApi>,
  sessionId?: string,
): AgentMessage[] {
  return messages.flatMap((message): AgentMessage[] => {
    if (message.role === 'system') {
      return [];
    }
    if (message.role === 'user') {
      const source = persistedCommunicationSource(message, sessionId);
      return [{
        role: 'user',
        content: source
          ? encodeCommunicationUserMessage(message.content, source, attachmentRefs(message.metadata))
          : message.content,
        timestamp: message.timestamp,
      }];
    }
    if (message.role === 'assistant') {
      return [{
        role: 'assistant',
        content: [{ type: 'text', text: message.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: createRestoredUsage(),
        stopReason: 'stop',
        timestamp: message.timestamp,
      }];
    }

    const label = message.role === 'toolResult' ? 'Tool result' : 'Tool output';
    return [{
      role: 'user',
      content: `[${label} from restored history]\n${message.content}`,
      timestamp: message.timestamp,
    }];
  });
}

function persistedCommunicationSource(message: PersistedRuntimeMessage, sessionId?: string): CommunicationSource | undefined {
  if (!sessionId) return undefined;
  const channel = message.metadata?.['channel'];
  if (!channel || typeof channel !== 'object' || Array.isArray(channel)) return undefined;
  const value = channel as Record<string, unknown>;
  const origin = stringField(value, 'origin');
  if (!origin) return undefined;
  const conversationKind = value['conversationKind'];
  return {
    origin,
    connectorId: stringField(value, 'connectorId'),
    conversationKind: conversationKind === 'direct' || conversationKind === 'group' || conversationKind === 'thread' ? conversationKind : undefined,
    conversationId: stringField(value, 'conversationId'),
    actorId: stringField(value, 'actorId'),
    actorDisplayName: stringField(value, 'actorDisplayName'),
    sessionId,
    messageId: stringField(value, 'id') ?? message.id,
    observedAt: stringField(value, 'occurredAt') ?? stringField(value, 'receivedAt'),
  };
}

function attachmentRefs(metadata?: Record<string, unknown>): string[] {
  const refs = metadata?.['attachmentRefs'];
  return Array.isArray(refs) ? refs.filter((value): value is string => typeof value === 'string') : [];
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === 'string' && value[key].length > 0 ? value[key] : undefined;
}
