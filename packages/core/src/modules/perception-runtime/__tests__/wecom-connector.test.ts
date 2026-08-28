import { createCipheriv } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WECOM_APP_CAPABILITIES,
  WECOM_GROUP_BOT_CAPABILITIES,
  WeComAppConnector,
  createWeComSignature,
  decryptWeComMessage,
  verifyWeComUrl,
  type WeComSecrets,
} from '../../../lib/integrations/perception/wecom';
import { ConnectorRegistry, WebhookGateway } from '..';

const secrets: WeComSecrets = {
  token: 'originos-token',
  encodingAesKey: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64').slice(0, 43),
  receiveId: 'ww-originos',
};
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function encryptFixture(message: string, receiveId = secrets.receiveId): string {
  const key = Buffer.from(`${secrets.encodingAesKey}=`, 'base64');
  const body = Buffer.from(message, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const plain = Buffer.concat([Buffer.alloc(16, 7), length, body, Buffer.from(receiveId, 'utf8')]);
  const paddingLength = 32 - (plain.length % 32);
  const padded = Buffer.concat([plain, Buffer.alloc(paddingLength, paddingLength)]);
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

function callback(msgId = '9001'): string {
  return JSON.stringify({
    ToUserName: secrets.receiveId,
    FromUserName: 'zhangsan',
    CreateTime: '1787904000',
    MsgType: 'text',
    Content: 'hello OriginOS',
    MsgId: msgId,
  });
}

describe('WeCom cryptography and connector', () => {
  it('creates a stable sorted SHA-1 signature and decrypts the protocol fixture', () => {
    const encrypted = encryptFixture(callback());
    expect(createWeComSignature(secrets.token, '1787904000', 'nonce-1', encrypted)).toMatch(/^[a-f0-9]{40}$/);
    expect(decryptWeComMessage(encrypted, secrets.encodingAesKey, secrets.receiveId)).toBe(callback());
  });

  it('rejects a mismatched receiveId and corrupted ciphertext', () => {
    expect(() => decryptWeComMessage(encryptFixture(callback(), 'other-corp'), secrets.encodingAesKey, secrets.receiveId))
      .toThrow('receiveId mismatch');
    const corrupted = Buffer.from(encryptFixture(callback()), 'base64');
    corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 1;
    expect(() => decryptWeComMessage(corrupted.toString('base64'), secrets.encodingAesKey, secrets.receiveId)).toThrow();
  });

  it('verifies and decrypts the GET URL challenge inside the replay window', () => {
    const encrypted = encryptFixture('originos-echo');
    const timestamp = '1787904000';
    const nonce = 'nonce-echo';
    const msgSignature = createWeComSignature(secrets.token, timestamp, nonce, encrypted);
    expect(verifyWeComUrl(secrets, { msgSignature, timestamp, nonce, echoStr: encodeURIComponent(encrypted) }, 1787904000 * 1000))
      .toBe('originos-echo');
    expect(() => verifyWeComUrl(secrets, { msgSignature: 'bad', timestamp, nonce, echoStr: encrypted }, 1787904000 * 1000)).toThrow('signature');
  });

  it('serves the GET challenge through the generic gateway handshake contract', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-wecom-handshake-'));
    roots.push(root);
    const encrypted = encryptFixture('gateway-echo');
    const timestamp = '1787904000';
    const nonce = 'nonce-gateway';
    const registry = new ConnectorRegistry();
    registry.register('wecom-main', new WeComAppConnector(secrets));
    const ack = await new WebhookGateway(registry, root).handshake('wecom-main', {
      msg_signature: createWeComSignature(secrets.token, timestamp, nonce, encrypted),
      timestamp,
      nonce,
      echostr: encrypted,
    }, '2026-08-28T08:00:00.000Z');
    expect(ack).toMatchObject({ status: 200, body: 'gateway-echo' });
  });

  it('declares app inbound and group bot outbound capabilities separately', () => {
    expect(WECOM_APP_CAPABILITIES).toMatchObject({ encryptedPayload: true, callbackHandshake: true });
    expect(WECOM_APP_CAPABILITIES.inboundEvents).toContain('message.received');
    expect(WECOM_GROUP_BOT_CAPABILITIES).toMatchObject({ inboundEvents: [], outboundReply: true });
  });

  it('normalizes an encrypted callback and deduplicates a retry with a fresh signature', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-wecom-'));
    roots.push(root);
    const encrypted = encryptFixture(callback());
    const registry = new ConnectorRegistry();
    registry.register('wecom-main', new WeComAppConnector(secrets));
    const gateway = new WebhookGateway(registry, root);
    const receivedAt = '2026-08-28T08:00:00.000Z';
    const timestamp = String(Date.parse(receivedAt) / 1000);
    const invoke = (nonce: string) => gateway.handle({
      connectorId: 'wecom-main',
      payload: { Encrypt: encrypted },
      query: {
        msg_signature: createWeComSignature(secrets.token, timestamp, nonce, encrypted),
        timestamp,
        nonce,
      },
      receivedAt,
    });

    const first = await invoke('nonce-1');
    const second = await invoke('nonce-2');
    expect(first.events[0]).toMatchObject({
      source: 'wecom',
      type: 'message.received',
      actor: { externalId: 'zhangsan' },
      content: { text: 'hello OriginOS' },
    });
    expect(second.duplicateEventIds).toEqual([first.events[0]?.id]);
  });
});
