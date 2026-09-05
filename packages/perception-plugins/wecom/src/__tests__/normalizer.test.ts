import { describe, expect, it } from 'vitest';
import { normalizeWeComFrame } from '../normalizer';

describe('normalizeWeComFrame', () => {
  it('normalizes a text frame with a stable source event id', () => {
    const event = normalizeWeComFrame({
      connectorId: 'connector-1',
      receivedAt: '2026-09-04T10:00:00.000Z',
      createId: () => 'event-1',
      frame: {
        headers: { req_id: 'request-1' },
        body: {
          msgid: 'message-1', aibotid: 'bot-1', chatid: 'chat-1', chattype: 'group',
          from: { userid: 'user-1' }, create_time: 1_788_516_000,
          text: { content: 'hello' },
        },
      },
    });

    expect(event).toMatchObject({
      id: 'event-1', source: 'wecom', connectorId: 'connector-1',
      sourceEventId: 'wecom-bot:message-1', type: 'message.received',
      actor: { externalId: 'user-1' },
      conversation: { externalId: 'chat-1', kind: 'group' },
      content: { text: 'hello' },
      provenance: { tenantExternalId: 'bot-1', rawPayloadRef: 'wecom-ws://connector-1/request-1' },
    });
  });

  it('normalizes a voice transcript and direct-chat fallback', () => {
    const event = normalizeWeComFrame({
      connectorId: 'connector-2',
      receivedAt: '2026-09-04T10:00:00.000Z',
      createId: () => 'event-2',
      frame: {
        headers: { req_id: 'request-2' },
        body: { from: { userid: 'user-2' }, voice: { content: '语音转写' } },
      },
    });

    expect(event.sourceEventId).toBe('wecom-bot:request-2');
    expect(event.conversation).toEqual({ externalId: 'user-2', kind: 'direct' });
    expect(event.content.text).toBe('语音转写');
    expect(event.occurredAt).toBe(event.receivedAt);
  });
});
