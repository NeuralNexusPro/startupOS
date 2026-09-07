import { createHash, randomUUID } from 'node:crypto';
import type { JsonValue, PerceptionEventV1 } from '@originos/core/types';
import type { DingTalkStreamFrame } from './types';

interface NormalizeContext {
  connectorId: string;
  inboxRef: string;
  receivedAt: string;
}

export class DingTalkStreamNormalizer {
  normalize(frame: DingTalkStreamFrame, context: NormalizeContext): PerceptionEventV1[] {
    const data = parseFrameData(frame.data);
    const topic = frame.headers.topic ?? '';
    const stableId = readString(data, 'msgId') ?? frame.headers.messageId;
    if (!stableId) throw new Error('DINGTALK_MESSAGE_ID_REQUIRED');
    const isChatbot = topic === '/v1.0/im/bot/messages/get';
    const isMention =
      isChatbot &&
      (data['isInAtList'] === true || readArray(data, 'atUsers').length > 0);
    const actorId =
      readString(data, 'senderId') ??
      readString(data, 'senderStaffId') ??
      'unknown';
    const content = readObject(data, 'text');
    const resource = readObject(data, 'content');
    const resourceKey =
      readString(resource, 'downloadCode') ?? readString(resource, 'fileId');
    return [
      {
        schemaVersion: '1.0',
        id: randomUUID(),
        source: 'dingtalk',
        sourceEventId: `dingtalk:${hash(stableId)}`,
        connectorId: context.connectorId,
        type: isChatbot
          ? isMention
            ? 'mention.received'
            : 'message.received'
          : 'action.invoked',
        occurredAt: timestampToIso(
          readNumber(data, 'createAt') ?? frame.headers.time,
          context.receivedAt
        ),
        receivedAt: context.receivedAt,
        actor: {
          externalId: actorId,
          displayName: readString(data, 'senderNick'),
        },
        conversation: {
          externalId: readString(data, 'conversationId') ?? actorId,
          kind:
            readString(data, 'conversationType') === '2' ? 'group' : 'direct',
        },
        content: {
          text: readString(content, 'content') ??
            (isChatbot ? undefined : topic),
          attachmentRefs: resourceKey
            ? [`perception://attachment/dingtalk/${hash(resourceKey)}`]
            : undefined,
        },
        provenance: {
          tenantExternalId: readString(data, 'senderCorpId'),
          rawPayloadRef: context.inboxRef,
        },
      },
    ];
  }
}

export function parseFrameData(
  value: DingTalkStreamFrame['data']
): Record<string, JsonValue> {
  if (typeof value !== 'string') return value;
  const parsed = JSON.parse(value) as JsonValue;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')
    throw new Error('DINGTALK_INVALID_FRAME_DATA');
  return parsed;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function readObject(
  value: Record<string, JsonValue>,
  key: string
): Record<string, JsonValue> {
  const nested = value[key];
  return nested !== null && !Array.isArray(nested) && typeof nested === 'object'
    ? nested
    : {};
}
function readArray(value: Record<string, JsonValue>, key: string): JsonValue[] {
  return Array.isArray(value[key]) ? (value[key] as JsonValue[]) : [];
}
function readString(
  value: Record<string, JsonValue>,
  key: string
): string | undefined {
  const nested = value[key];
  return typeof nested === 'string' || typeof nested === 'number'
    ? String(nested)
    : undefined;
}
function readNumber(
  value: Record<string, JsonValue>,
  key: string
): number | undefined {
  return typeof value[key] === 'number' ? value[key] : undefined;
}
function timestampToIso(
  value: string | number | undefined,
  fallback: string
): string {
  if (value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const milliseconds =
    String(Math.trunc(numeric)).length > 10 ? numeric : numeric * 1000;
  return new Date(milliseconds).toISOString();
}
