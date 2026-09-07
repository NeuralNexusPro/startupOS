import { createHash, randomUUID } from 'node:crypto';
import type { JsonValue, PerceptionEventV1 } from '@originos/core/modules/perception-runtime/plugins';
import type { FeishuSdkMessageEvent } from './types';

export function normalizeFeishuMessage(input: { connectorId: string; message: FeishuSdkMessageEvent; receivedAt?: string; createId?: () => string }): PerceptionEventV1 {
  const receivedAt = input.receivedAt ?? new Date().toISOString();
  const { message, sender } = input.message;
  const eventId = input.message.event_id ?? message.message_id;
  const actorId = sender.sender_id?.open_id ?? sender.sender_id?.user_id ?? 'unknown';
  const content = parseContent(message.content);
  const refs = attachmentRefs(content, message.message_type);
  return {
    schemaVersion: '1.0', id: input.createId?.() ?? randomUUID(), source: 'feishu', connectorId: input.connectorId,
    sourceEventId: `feishu:${createHash('sha256').update(eventId).digest('hex')}`,
    type: message.mentions?.length ? 'mention.received' : 'message.received',
    occurredAt: timestampToIso(input.message.create_time ?? message.create_time, receivedAt), receivedAt,
    actor: { externalId: actorId }, conversation: { externalId: message.chat_id, kind: message.chat_type === 'group' ? 'group' : 'direct' },
    content: { text: stringValue(content.text), ...(refs ? { attachmentRefs: refs } : {}) },
    provenance: { tenantExternalId: input.message.tenant_key, rawPayloadRef: `feishu-ws://${input.connectorId}/${message.message_id}` },
  };
}

function parseContent(value: string): Record<string, JsonValue> { try { const parsed = JSON.parse(value) as JsonValue; return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : { text: value }; } catch { return { text: value }; } }
function stringValue(value: JsonValue | undefined): string | undefined { return typeof value === 'string' ? value : undefined; }
function attachmentRefs(content: Record<string, JsonValue>, type: string): string[] | undefined { if (!['image', 'file', 'audio', 'media', 'sticker'].includes(type)) return undefined; const key = stringValue(content.file_key) ?? stringValue(content.image_key); return key ? [`perception://attachment/feishu/${createHash('sha256').update(key).digest('hex')}`] : undefined; }
function timestampToIso(value: string | undefined, fallback: string): string { if (!value || !/^\d+$/.test(value)) return fallback; const numeric = Number(value); return Number.isFinite(numeric) ? new Date(value.length > 10 ? numeric : numeric * 1_000).toISOString() : fallback; }
