import { createCipheriv, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FEISHU_APP_CAPABILITIES,
  FEISHU_CUSTOM_BOT_CAPABILITIES,
  FeishuAppConnector,
  createFeishuSignature,
  decryptFeishuPayload,
  type FeishuSecrets,
} from '../../../lib/integrations/perception/feishu';
import { ConnectorRegistry, WebhookGateway } from '..';

const secrets: FeishuSecrets = { verificationToken: 'verification-token', encryptKey: 'originos-encrypt-key' };
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-feishu-'));
  roots.push(value);
  return value;
}

function encryptFixture(plaintext: string): string {
  const key = createHash('sha256').update(secrets.encryptKey ?? '').digest();
  const iv = Buffer.alloc(16, 5);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([iv, cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64');
}

function event(eventId = 'event-1', messageType = 'text', content: Record<string, string> = { text: 'hello Feishu' }) {
  return {
    schema: '2.0',
    header: {
      event_id: eventId,
      event_type: 'im.message.receive_v1',
      create_time: '1787904000000',
      token: secrets.verificationToken,
      tenant_key: 'tenant-1',
    },
    event: {
      sender: { sender_id: { open_id: 'ou-user-1' } },
      message: {
        chat_id: 'oc-chat-1',
        chat_type: 'group',
        message_type: messageType,
        content: JSON.stringify(content),
        mentions: [{ id: { open_id: 'ou-bot' }, name: 'OriginOS' }],
      },
    },
  };
}

function signedRequest(callback: object, nonce: string, receivedAt = '2026-08-28T08:00:00.000Z') {
  const payload = { encrypt: encryptFixture(JSON.stringify(callback)) };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.parse(receivedAt) / 1000);
  return {
    payload,
    rawBody,
    receivedAt,
    headers: {
      'x-lark-request-timestamp': timestamp,
      'x-lark-request-nonce': nonce,
      'x-lark-signature': createFeishuSignature(timestamp, nonce, secrets.encryptKey ?? '', rawBody),
    },
  };
}

describe('FeishuAppConnector', () => {
  it('matches the official SHA-256 input order and decrypts an AES fixture', () => {
    const plaintext = JSON.stringify(event());
    const encrypted = encryptFixture(plaintext);
    expect(createFeishuSignature('1', 'n', 'key', '{"a":1}')).toBe(
      createHash('sha256').update('1nkey{"a":1}').digest('hex'),
    );
    expect(decryptFeishuPayload(encrypted, secrets.encryptKey ?? '')).toBe(plaintext);
  });

  it('rejects changed signature, token, and ciphertext', async () => {
    const connector = new FeishuAppConnector(secrets);
    const request = signedRequest(event(), 'nonce-1');
    await expect(connector.verify(request.payload, {
      headers: { ...request.headers, 'x-lark-signature': 'bad' },
      query: {}, receivedAt: request.receivedAt, rawBody: request.rawBody,
    })).resolves.toMatchObject({ authenticated: false });

    const badToken = signedRequest(event('event-token'), 'nonce-2');
    const decrypted = event('event-token');
    decrypted.header.token = 'wrong';
    const badTokenRequest = signedRequest(decrypted, 'nonce-3');
    await expect(connector.verify(badTokenRequest.payload, {
      headers: badTokenRequest.headers, query: {}, receivedAt: badTokenRequest.receivedAt, rawBody: badTokenRequest.rawBody,
    })).resolves.toMatchObject({ authenticated: false });
    expect(badToken.payload).toBeTruthy();
    expect(() => decryptFeishuPayload('broken', secrets.encryptKey ?? '')).toThrow();
  });

  it('returns an encrypted POST challenge without creating an event', async () => {
    const registry = new ConnectorRegistry();
    registry.register('feishu-main', new FeishuAppConnector(secrets));
    const request = signedRequest({
      challenge: 'challenge-value',
      type: 'url_verification',
      token: secrets.verificationToken,
    }, 'challenge-nonce');
    const result = await new WebhookGateway(registry, root()).handle({ connectorId: 'feishu-main', ...request });
    expect(result.events).toEqual([]);
    expect(result.ack).toMatchObject({ status: 200, body: { challenge: 'challenge-value' } });
  });

  it('normalizes a group mention and deduplicates event_id retries', async () => {
    const registry = new ConnectorRegistry();
    registry.register('feishu-main', new FeishuAppConnector(secrets));
    const gateway = new WebhookGateway(registry, root());
    const first = await gateway.handle({ connectorId: 'feishu-main', ...signedRequest(event(), 'nonce-1') });
    const second = await gateway.handle({ connectorId: 'feishu-main', ...signedRequest(event(), 'nonce-2') });
    expect(first.events[0]).toMatchObject({
      source: 'feishu', type: 'mention.received', actor: { externalId: 'ou-user-1' },
      conversation: { externalId: 'oc-chat-1', kind: 'group' }, content: { text: 'hello Feishu' },
    });
    expect(second.duplicateEventIds).toEqual([first.events[0]?.id]);
  });

  it('turns file keys into opaque controlled references', async () => {
    const connector = new FeishuAppConnector(secrets);
    const callback = event('file-event', 'file', { file_key: 'file-secret-key' });
    const request = signedRequest(callback, 'file-nonce');
    const events = await connector.normalize(request.payload, {
      connectorId: 'feishu-main', inboxRef: 'perception://inbox/feishu-main/1', receivedAt: request.receivedAt,
    });
    expect(events[0]?.content.attachmentRefs?.[0]).toMatch(/^perception:\/\/attachment\/feishu\/[a-f0-9]{64}$/);
    expect(JSON.stringify(events)).not.toContain('file-secret-key');
  });

  it('keeps application inbound and custom bot outbound capabilities separate', () => {
    expect(FEISHU_APP_CAPABILITIES.inboundEvents).toContain('message.received');
    expect(FEISHU_CUSTOM_BOT_CAPABILITIES).toMatchObject({ inboundEvents: [], outboundReply: true });
  });
});
