import { describe, expect, it } from 'vitest';
import { DingTalkStreamNormalizer } from '../normalizer';

describe('DingTalk Stream normalizer', () => {
  it('prefers the staff identity and preserves an opaque conversation identity', () => {
    const [event] = new DingTalkStreamNormalizer().normalize({
      specVersion: '1.0',
      type: 'CALLBACK',
      headers: { messageId: 'frame-1', topic: '/v1.0/im/bot/messages/get' },
      data: JSON.stringify({
        msgId: 'message-1',
        senderId: '$:LWCP_v1:$encodedSender',
        senderStaffId: 'staff-1',
        conversationId: 'cid+opaque==',
        conversationType: '2',
        text: { content: 'hello' },
      }),
    }, { connectorId: 'dingtalk-main', inboxRef: 'perception://dingtalk/1', receivedAt: '2026-11-03T00:00:00.000Z' });

    expect(event).toMatchObject({
      actor: { externalId: 'staff-1' },
      conversation: { externalId: 'cid+opaque==', kind: 'group' },
    });
  });

  it.each([undefined, '   '])('falls back to the opaque sender identity when staff identity is %s', (senderStaffId) => {
    const [event] = new DingTalkStreamNormalizer().normalize({
      specVersion: '1.0', type: 'CALLBACK',
      headers: { messageId: 'frame-1', topic: '/v1.0/im/bot/messages/get' },
      data: {
        msgId: 'message-1', senderId: '$:LWCP_v1:$encodedSender',
        ...(senderStaffId !== undefined ? { senderStaffId } : {}),
        text: { content: 'hello' },
      },
    }, { connectorId: 'dingtalk-main', inboxRef: 'perception://dingtalk/1', receivedAt: '2026-11-03T00:00:00.000Z' });

    expect(event?.actor.externalId).toBe('$:LWCP_v1:$encodedSender');
  });
});
