import { createHash, randomUUID } from 'node:crypto';
import type {
  ConnectorAck,
  ConnectorCapabilities,
  ConnectorNormalizeContext,
  ConnectorVerificationContext,
  ConnectorVerificationResult,
  JsonValue,
  PerceptionConnector,
  PerceptionEventType,
  PerceptionEventV1,
} from '../../../../types/perception';
import { decryptFeishuPayload, secureStringEquals, verifyFeishuSignature } from './crypto';
import type { FeishuSecrets } from './types';

export const FEISHU_APP_CAPABILITIES: ConnectorCapabilities = {
  inboundEvents: ['message.received', 'mention.received', 'action.invoked'],
  outboundReply: true,
  callbackHandshake: true,
  encryptedPayload: true,
  polling: false,
  attachments: true,
};

export const FEISHU_CUSTOM_BOT_CAPABILITIES: ConnectorCapabilities = {
  inboundEvents: [],
  outboundReply: true,
  callbackHandshake: false,
  encryptedPayload: false,
  polling: false,
  attachments: false,
};

export class FeishuAppConnector implements PerceptionConnector {
  readonly source = 'feishu' as const;
  readonly capabilities = FEISHU_APP_CAPABILITIES;

  constructor(private readonly secrets: FeishuSecrets) {}

  async verify(payload: JsonValue, context: ConnectorVerificationContext): Promise<ConnectorVerificationResult> {
    try {
      if (this.secrets.encryptKey) {
        const rawBody = context.rawBody;
        const timestamp = context.headers['x-lark-request-timestamp'] ?? '';
        const nonce = context.headers['x-lark-request-nonce'] ?? '';
        const signature = context.headers['x-lark-signature'] ?? '';
        if (!rawBody || !verifyFeishuSignature(timestamp, nonce, this.secrets.encryptKey, rawBody, signature)) {
          return { authenticated: false, reason: 'Invalid Feishu signature' };
        }
      }
      const callback = this.decode(payload);
      const token = readString(readObject(callback, 'header'), 'token') ?? readString(callback, 'token');
      const authenticated = token !== undefined && secureStringEquals(token, this.secrets.verificationToken);
      const timestamp = context.headers['x-lark-request-timestamp'];
      const timestampMs = timestamp ? Number(timestamp) * 1000 : Number.NaN;
      return {
        authenticated,
        reason: authenticated ? undefined : 'Invalid Feishu verification token',
        replayKey: authenticated ? `feishu:${context.headers['x-lark-signature'] ?? readString(readObject(callback, 'header'), 'event_id') ?? ''}` : undefined,
        signedAt: Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : undefined,
      };
    } catch {
      return { authenticated: false, reason: 'Invalid Feishu callback' };
    }
  }

  async normalize(payload: JsonValue, context: ConnectorNormalizeContext): Promise<PerceptionEventV1[]> {
    const callback = this.decode(payload);
    if (readString(callback, 'type') === 'url_verification' || readString(callback, 'challenge')) return [];
    const header = readObject(callback, 'header');
    const event = readObject(callback, 'event');
    const eventId = requiredString(header, 'event_id');
    const eventType = requiredString(header, 'event_type');
    const tenantKey = readString(header, 'tenant_key');
    const sender = readObject(readObject(event, 'sender'), 'sender_id');
    const actorId = readString(sender, 'open_id') ?? readString(sender, 'user_id') ?? 'unknown';
    const message = readObject(event, 'message');
    const chatId = readString(message, 'chat_id') ?? actorId;
    const messageType = readString(message, 'message_type') ?? '';
    const content = parseContent(readString(message, 'content'));
    const mentions = readArray(message, 'mentions');
    const normalizedType: PerceptionEventType = eventType.includes('card') || eventType.includes('action')
      ? 'action.invoked'
      : mentions.length > 0 ? 'mention.received' : 'message.received';
    const occurredAt = timestampToIso(readString(header, 'create_time') ?? readString(message, 'create_time'), context.receivedAt);
    return [{
      schemaVersion: '1.0',
      id: randomUUID(),
      source: 'feishu',
      sourceEventId: `feishu:${createHash('sha256').update(eventId).digest('hex')}`,
      connectorId: context.connectorId,
      type: normalizedType,
      occurredAt,
      receivedAt: context.receivedAt,
      actor: { externalId: actorId },
      conversation: { externalId: chatId, kind: readString(message, 'chat_type') === 'group' ? 'group' : 'direct' },
      content: {
        text: readString(content, 'text') ?? (normalizedType === 'action.invoked' ? eventType : undefined),
        attachmentRefs: attachmentRefs(content, messageType),
      },
      provenance: { tenantExternalId: tenantKey, rawPayloadRef: context.inboxRef },
    }];
  }

  async acknowledge(_events: readonly PerceptionEventV1[], payload?: JsonValue): Promise<ConnectorAck> {
    if (payload !== undefined) {
      const callback = this.decode(payload);
      const challenge = readString(callback, 'challenge');
      if (challenge) return { status: 200, body: { challenge } };
    }
    return { status: 200, body: {} };
  }

  private decode(payload: JsonValue): Record<string, JsonValue> {
    const outer = asObject(payload);
    const encrypted = readString(outer, 'encrypt');
    if (!encrypted) return outer;
    if (!this.secrets.encryptKey) throw new Error('Feishu encrypt key is required');
    return asObject(JSON.parse(decryptFeishuPayload(encrypted, this.secrets.encryptKey)) as JsonValue);
  }
}

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error('Expected JSON object');
  return value;
}

function readObject(value: Record<string, JsonValue>, key: string): Record<string, JsonValue> {
  const nested = value[key];
  return nested !== null && !Array.isArray(nested) && typeof nested === 'object' ? nested : {};
}

function readArray(value: Record<string, JsonValue>, key: string): JsonValue[] {
  const nested = value[key];
  return Array.isArray(nested) ? nested : [];
}

function readString(value: Record<string, JsonValue>, key: string): string | undefined {
  const nested = value[key];
  return typeof nested === 'string' || typeof nested === 'number' ? String(nested) : undefined;
}

function requiredString(value: Record<string, JsonValue>, key: string): string {
  const result = readString(value, key);
  if (!result) throw new Error(`Feishu ${key} is required`);
  return result;
}

function parseContent(value: string | undefined): Record<string, JsonValue> {
  if (!value) return {};
  try {
    return asObject(JSON.parse(value) as JsonValue);
  } catch {
    return { text: value };
  }
}

function attachmentRefs(content: Record<string, JsonValue>, messageType: string): string[] | undefined {
  if (!['image', 'file', 'audio', 'media', 'sticker'].includes(messageType)) return undefined;
  const key = readString(content, 'file_key') ?? readString(content, 'image_key');
  return key ? [`perception://attachment/feishu/${createHash('sha256').update(key).digest('hex')}`] : undefined;
}

function timestampToIso(value: string | undefined, fallback: string): string {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const numeric = Number(value);
  const milliseconds = value.length > 10 ? numeric : numeric * 1000;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : fallback;
}
