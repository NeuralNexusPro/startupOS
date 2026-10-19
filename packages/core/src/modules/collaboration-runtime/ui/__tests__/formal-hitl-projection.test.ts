import { describe, expect, it } from 'vitest';

import type { RuntimeEvent } from '../../session/types';
import { reconcileFormalHitlProjection } from '../formal-hitl-projection';

function event(
  id: string,
  type: RuntimeEvent['type'],
  payload: Record<string, unknown>,
): RuntimeEvent {
  return {
    id,
    sessionId: 'session-a',
    seq: 1,
    type,
    source: 'supervisor',
    payload,
    timestamp: '2026-10-19T00:00:00.000Z',
  };
}

describe('reconcileFormalHitlProjection', () => {
  it('injects a HITL that appears after the conversation is already open', () => {
    const request = event('formal-hitl:hitl-a', 'HUMAN_REVIEW_REQUEST', {
      requestId: 'hitl-a',
      question: '是否继续？',
    });
    expect(reconcileFormalHitlProjection([], [request], 'session-a')).toEqual([request]);
  });

  it('closes a projected HITL that was resolved through another entry point', () => {
    const request = event('formal-hitl:hitl-a', 'HUMAN_REVIEW_REQUEST', { requestId: 'hitl-a' });
    expect(reconcileFormalHitlProjection(
      [request],
      [],
      'session-a',
      '2026-10-19T00:01:00.000Z',
    )).toEqual([
      expect.objectContaining({
        type: 'HUMAN_REVIEW_RESPONSE',
        payload: { requestId: 'hitl-a', response: '该确认已在其他入口处理' },
      }),
    ]);
  });

  it('does not duplicate an existing request or response', () => {
    const request = event('formal-hitl:hitl-a', 'HUMAN_REVIEW_REQUEST', { requestId: 'hitl-a' });
    const response = event('formal-hitl-response:hitl-a', 'HUMAN_REVIEW_RESPONSE', { requestId: 'hitl-a' });
    expect(reconcileFormalHitlProjection([request], [request], 'session-a')).toEqual([]);
    expect(reconcileFormalHitlProjection([request, response], [], 'session-a')).toEqual([]);
  });
});
