import { createHash, randomUUID } from 'node:crypto';
import type { ConnectorCapabilities, ConnectorNormalizeContext, JsonValue, PerceptionEventV1 } from '../../../../types/perception';
import type { DingTalkStreamFrame } from './types';

export const DINGTALK_STREAM_CAPABILITIES: ConnectorCapabilities = {
  inboundEvents: ['message.received', 'mention.received', 'action.invoked'],
  outboundReply: true,
  callbackHandshake: false,
  encryptedPayload: false,
  polling: false,
  attachments: true,
};

export const DINGTALK_CUSTOM_BOT_CAPABILITIES: ConnectorCapabilities = {
  inboundEvents: [],
  outboundReply: true,
  callbackHandshake: false,
  encryptedPayload: false,
  polling: false,
  attachments: false,
};

export class DingTalkStreamNormalizer {
  normalize(frame: DingTalkStreamFrame, context: ConnectorNormalizeContext): PerceptionEventV1[] {
    const data = parseFrameData(frame.data);
    const topic = frame.headers.topic ?? '';
    const businessMessageId = readString(data, 'msgId');
    const transportMessageId = frame.headers.messageId;
    const stableId = businessMessageId ?? transportMessageId;
    if (!stableId) throw new Error('DingTalk Stream message id is required');
    const isChatbot = topic === '/v1.0/im/bot/messages/get';
    const isMention = isChatbot && (readBoolean(data, 'isInAtList') || readArray(data, 'atUsers').length > 0);
    const eventType = isChatbot ? (isMention ? 'mention.received' : 'message.received') : 'action.invoked';
    const actorId = readString(data, 'senderId') ?? readString(data, 'senderStaffId') ?? 'unknown';
    const conversationId = readString(data, 'conversationId') ?? actorId;
    const content = readObject(data, 'text');
    const resource = readObject(data, 'content');
    const resourceKey = readString(resource, 'downloadCode') ?? readString(resource, 'fileId');
    return [{
      schemaVersion: '1.0',
      id: randomUUID(),
      source: 'dingtalk',
      sourceEventId: `dingtalk:${createHash('sha256').update(stableId).digest('hex')}`,
      connectorId: context.connectorId,
      type: eventType,
      occurredAt: timestampToIso(readNumber(data, 'createAt') ?? frame.headers.time, context.receivedAt),
      receivedAt: context.receivedAt,
      actor: { externalId: actorId, displayName: readString(data, 'senderNick') },
      conversation: {
        externalId: conversationId,
        kind: readString(data, 'conversationType') === '2' ? 'group' : 'direct',
      },
      content: {
        text: readString(content, 'content') ?? (isChatbot ? undefined : topic),
        attachmentRefs: resourceKey
          ? [`perception://attachment/dingtalk/${createHash('sha256').update(resourceKey).digest('hex')}`]
          : undefined,
      },
      provenance: { tenantExternalId: readString(data, 'senderCorpId'), rawPayloadRef: context.inboxRef },
    }];
  }
}

export function parseFrameData(value: DingTalkStreamFrame['data']): Record<string, JsonValue> {
  if (typeof value !== 'string') return value;
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(value) as JsonValue;
  } catch {
    throw new Error('Invalid DingTalk Stream data JSON');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid DingTalk Stream data');
  return parsed;
}

function readObject(value: Record<string, JsonValue>, key: string): Record<string, JsonValue> {
  const nested = value[key];
  return nested !== null && !Array.isArray(nested) && typeof nested === 'object' ? nested : {};
}
function readArray(value: Record<string, JsonValue>, key: string): JsonValue[] { return Array.isArray(value[key]) ? value[key] as JsonValue[] : [] }
function readString(value: Record<string, JsonValue>, key: string): string | undefined {
  const nested = value[key];
  return typeof nested === 'string' || typeof nested === 'number' ? String(nested) : undefined;
}
function readNumber(value: Record<string, JsonValue>, key: string): number | undefined {
  const nested = value[key];
  return typeof nested === 'number' ? nested : undefined;
}
function readBoolean(value: Record<string, JsonValue>, key: string): boolean { return value[key] === true }
function timestampToIso(value: string | number | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const milliseconds = String(Math.trunc(numeric)).length > 10 ? numeric : numeric * 1000;
  return new Date(milliseconds).toISOString();
}
