import { createHash, randomUUID } from 'node:crypto';
import type {
  ConnectorCapabilities,
  ConnectorHandshakeContext,
  ConnectorHandshakeResult,
  ConnectorNormalizeContext,
  ConnectorVerificationContext,
  ConnectorVerificationResult,
  JsonValue,
  PerceptionConnector,
  PerceptionEventV1,
} from '../../../../types/perception';
import { decryptWeComMessage, verifyWeComSignature, verifyWeComUrl } from './crypto';
import type { WeComSecrets } from './types';

export const WECOM_APP_CAPABILITIES: ConnectorCapabilities = {
  inboundEvents: ['message.received', 'action.invoked'],
  outboundReply: true,
  callbackHandshake: true,
  encryptedPayload: true,
  polling: false,
  attachments: true,
};

export const WECOM_GROUP_BOT_CAPABILITIES: ConnectorCapabilities = {
  inboundEvents: [],
  outboundReply: true,
  callbackHandshake: false,
  encryptedPayload: false,
  polling: false,
  attachments: false,
};

export class WeComAppConnector implements PerceptionConnector {
  readonly source = 'wecom' as const;
  readonly capabilities = WECOM_APP_CAPABILITIES;

  constructor(private readonly secrets: WeComSecrets) {}

  async handshake(context: ConnectorHandshakeContext): Promise<ConnectorHandshakeResult> {
    const timestamp = context.query.timestamp ?? '';
    const nonce = context.query.nonce ?? '';
    const signature = context.query.msg_signature ?? '';
    const echoStr = context.query.echostr ?? '';
    try {
      const plaintext = verifyWeComUrl(this.secrets, {
        msgSignature: signature,
        timestamp,
        nonce,
        echoStr,
      }, Date.parse(context.receivedAt));
      return {
        authenticated: true,
        replayKey: `wecom-handshake:${signature}`,
        signedAt: new Date(Number(timestamp) * 1000).toISOString(),
        ack: { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: plaintext },
      };
    } catch {
      return { authenticated: false, reason: 'Invalid WeCom URL verification request' };
    }
  }

  async verify(payload: JsonValue, context: ConnectorVerificationContext): Promise<ConnectorVerificationResult> {
    const encrypted = encryptedFrom(payload);
    const signature = context.query.msg_signature ?? '';
    const timestamp = context.query.timestamp ?? '';
    const nonce = context.query.nonce ?? '';
    const authenticated = verifyWeComSignature(this.secrets.token, timestamp, nonce, encrypted, signature);
    const timestampMs = Number(timestamp) * 1000;
    return {
      authenticated,
      reason: authenticated ? undefined : 'Invalid WeCom signature',
      replayKey: authenticated ? `wecom:${signature}` : undefined,
      signedAt: /^\d+$/.test(timestamp) && Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : undefined,
    };
  }

  async normalize(payload: JsonValue, context: ConnectorNormalizeContext): Promise<PerceptionEventV1[]> {
    const decrypted = decryptWeComMessage(encryptedFrom(payload), this.secrets.encodingAesKey, this.secrets.receiveId);
    const callback = parseObject(decrypted);
    const from = stringField(callback, 'FromUserName') ?? 'unknown';
    const to = stringField(callback, 'ToUserName') ?? this.secrets.receiveId;
    const created = stringField(callback, 'CreateTime');
    const occurredAt = created && /^\d+$/.test(created)
      ? new Date(Number(created) * 1000).toISOString()
      : context.receivedAt;
    const eventName = stringField(callback, 'Event');
    const messageId = stringField(callback, 'MsgId');
    const sourceKey = messageId
      ? `msg:${messageId}`
      : `event:${from}:${created ?? 'unknown'}:${eventName ?? 'unknown'}:${stringField(callback, 'EventKey') ?? ''}`;
    const sourceEventId = `wecom:${createHash('sha256').update(sourceKey).digest('hex')}`;
    const content = stringField(callback, 'Content') ?? eventName ?? '';
    return [{
      schemaVersion: '1.0',
      id: randomUUID(),
      source: 'wecom',
      sourceEventId,
      connectorId: context.connectorId,
      type: eventName ? 'action.invoked' : 'message.received',
      occurredAt,
      receivedAt: context.receivedAt,
      actor: { externalId: from },
      conversation: { externalId: to, kind: 'direct' },
      content: { text: content },
      provenance: { tenantExternalId: to, rawPayloadRef: context.inboxRef },
    }];
  }

  async acknowledge(): Promise<{ status: number; body: JsonValue }> {
    return { status: 200, body: '' };
  }
}

function encryptedFrom(payload: JsonValue): string {
  if (payload === null || Array.isArray(payload) || typeof payload !== 'object') throw new Error('Invalid WeCom envelope');
  const encrypted = payload.Encrypt;
  if (typeof encrypted !== 'string' || !encrypted) throw new Error('WeCom Encrypt is required');
  return encrypted;
}

function parseObject(text: string): Record<string, JsonValue> {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text) as JsonValue;
  } catch {
    throw new Error('Invalid decrypted WeCom JSON');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid decrypted WeCom payload');
  return parsed;
}

function stringField(value: Record<string, JsonValue>, key: string): string | undefined {
  const field = value[key];
  return typeof field === 'string' || typeof field === 'number' ? String(field) : undefined;
}
