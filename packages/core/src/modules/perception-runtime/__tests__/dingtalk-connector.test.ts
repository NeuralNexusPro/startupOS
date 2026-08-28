import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DINGTALK_CUSTOM_BOT_CAPABILITIES,
  DINGTALK_STREAM_CAPABILITIES,
  DingTalkStreamNormalizer,
  type DingTalkStreamFrame,
} from '../../../lib/integrations/perception/dingtalk';
import { DingTalkStreamIngress } from '..';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-dingtalk-'));
  roots.push(value);
  return value;
}

function chatbotFrame(messageId = 'transport-1', msgId = 'business-1'): DingTalkStreamFrame {
  return {
    specVersion: '1.0',
    type: 'CALLBACK',
    headers: {
      appId: 'app-1', connectionId: 'connection-1', messageId, time: '1787904004233',
      topic: '/v1.0/im/bot/messages/get', contentType: 'application/json',
    },
    data: JSON.stringify({
      senderId: 'sender-1', senderNick: 'Sender', senderCorpId: 'corp-1',
      conversationId: 'conversation-1', conversationType: '2', msgId, createAt: 1787904003911,
      isInAtList: true, atUsers: [{ dingtalkId: 'bot-1' }], text: { content: 'hello DingTalk' },
      sessionWebhook: 'https://oapi.dingtalk.com/robot/sendBySession?access_token=top-secret',
      accessToken: 'another-secret',
    }),
  };
}

describe('DingTalk Stream connector', () => {
  it('normalizes an official-shaped chatbot mention frame', () => {
    const events = new DingTalkStreamNormalizer().normalize(chatbotFrame(), {
      connectorId: 'dingtalk-main', inboxRef: 'perception://inbox/dingtalk-main/1', receivedAt: '2026-08-28T08:00:00.000Z',
    });
    expect(events[0]).toMatchObject({
      source: 'dingtalk', type: 'mention.received', actor: { externalId: 'sender-1', displayName: 'Sender' },
      conversation: { externalId: 'conversation-1', kind: 'group' }, content: { text: 'hello DingTalk' },
    });
  });

  it('maps non-chatbot topics to actions and falls back to transport messageId', () => {
    const frame: DingTalkStreamFrame = {
      specVersion: '1.0', type: 'CALLBACK',
      headers: { messageId: 'card-message-1', time: '1787904004233', topic: '/v1.0/card/instances/callback' },
      data: { senderId: 'sender-1', conversationId: 'conversation-1' },
    };
    const events = new DingTalkStreamNormalizer().normalize(frame, {
      connectorId: 'dingtalk-main', inboxRef: 'perception://inbox/dingtalk-main/1', receivedAt: '2026-08-28T08:00:00.000Z',
    });
    expect(events[0]).toMatchObject({ type: 'action.invoked', content: { text: '/v1.0/card/instances/callback' } });
  });

  it('rejects an untrusted frame before creating persistence directories', () => {
    const dataRoot = root();
    const ingress = new DingTalkStreamIngress('dingtalk-main', dataRoot);
    expect(() => ingress.ingest(chatbotFrame(), { authenticated: false })).toThrow('Unauthenticated');
    expect(fs.existsSync(path.join(dataRoot, 'perception'))).toBe(false);
  });

  it('deduplicates by business msgId across transport retries', () => {
    const ingress = new DingTalkStreamIngress('dingtalk-main', root());
    const first = ingress.ingest(chatbotFrame('transport-1', 'same-business'), { authenticated: true });
    const second = ingress.ingest(chatbotFrame('transport-2', 'same-business'), { authenticated: true });
    expect(first.ack.status).toBe('SUCCESS');
    expect(second.duplicateEventIds).toEqual([first.events[0]?.id]);
  });

  it('redacts session credentials before writing the parsed inbox frame', () => {
    const dataRoot = root();
    new DingTalkStreamIngress('dingtalk-main', dataRoot).ingest(chatbotFrame(), { authenticated: true });
    const inboxDirectory = path.join(dataRoot, 'perception', 'inbox', 'dingtalk-main');
    const persisted = fs.readFileSync(path.join(inboxDirectory, fs.readdirSync(inboxDirectory)[0]), 'utf8');
    expect(persisted).not.toContain('top-secret');
    expect(persisted).not.toContain('another-secret');
    expect(persisted).toContain('[REDACTED]');
  });

  it('creates an opaque attachment reference and separates custom bot capabilities', () => {
    const frame = chatbotFrame();
    frame.data = JSON.stringify({
      senderId: 'sender-1', conversationId: 'conversation-1', msgId: 'file-1', msgtype: 'file',
      content: { downloadCode: 'private-download-code' },
    });
    const event = new DingTalkStreamNormalizer().normalize(frame, {
      connectorId: 'dingtalk-main', inboxRef: 'perception://inbox/dingtalk-main/1', receivedAt: '2026-08-28T08:00:00.000Z',
    })[0];
    expect(event?.content.attachmentRefs?.[0]).toMatch(/^perception:\/\/attachment\/dingtalk\/[a-f0-9]{64}$/);
    expect(JSON.stringify(event)).not.toContain('private-download-code');
    expect(DINGTALK_STREAM_CAPABILITIES.inboundEvents).toContain('message.received');
    expect(DINGTALK_CUSTOM_BOT_CAPABILITIES).toMatchObject({ inboundEvents: [], outboundReply: true });
  });
});
