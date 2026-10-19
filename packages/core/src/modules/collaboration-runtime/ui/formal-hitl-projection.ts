import type { RuntimeEvent } from '../session/types';

/** Merge ledger-projected HITL events into an already-open Supervisor conversation. */
export function reconcileFormalHitlProjection(
  currentEvents: readonly RuntimeEvent[],
  projectedEvents: readonly RuntimeEvent[],
  sessionId: string,
  now = new Date().toISOString(),
): RuntimeEvent[] {
  const currentIds = new Set(currentEvents.map(({ id }) => id));
  const projectedRequests = projectedEvents.filter((event) =>
    event.sessionId === sessionId
    && event.type === 'HUMAN_REVIEW_REQUEST'
    && event.id.startsWith('formal-hitl:')
  );
  const projectedRequestIds = new Set(projectedRequests.map((event) =>
    String(event.payload?.['requestId'] ?? '')
  ));
  const updates = projectedRequests.filter(({ id }) => !currentIds.has(id));

  for (const event of currentEvents) {
    if (
      event.sessionId !== sessionId
      || event.type !== 'HUMAN_REVIEW_REQUEST'
      || !event.id.startsWith('formal-hitl:')
    ) continue;
    const requestId = String(event.payload?.['requestId'] ?? '');
    if (!requestId || projectedRequestIds.has(requestId)) continue;
    const alreadyResolved = currentEvents.some((candidate) =>
      candidate.type === 'HUMAN_REVIEW_RESPONSE'
      && String(candidate.payload?.['requestId'] ?? '') === requestId
    );
    if (alreadyResolved) continue;
    updates.push({
      id: `formal-hitl-resolved:${requestId}`,
      sessionId,
      seq: Date.parse(now),
      type: 'HUMAN_REVIEW_RESPONSE',
      source: 'system',
      payload: { requestId, response: '该确认已在其他入口处理' },
      timestamp: now,
    });
  }
  return updates;
}
