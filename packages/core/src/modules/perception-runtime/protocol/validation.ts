import type { PerceptionEventV1, PerceptionEventType, PerceptionSource } from './types';

const SOURCES = new Set<PerceptionSource>(['email', 'wecom', 'feishu', 'dingtalk']);
const EVENT_TYPES = new Set<PerceptionEventType>([
  'message.received',
  'mention.received',
  'mail.received',
  'action.invoked',
]);

export const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

export function assertSafePerceptionId(value: string, label: string): void {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validatePerceptionEvent(event: PerceptionEventV1): void {
  if (event.schemaVersion !== '1.0') throw new Error('Unsupported perception event schema');
  assertSafePerceptionId(event.id, 'event id');
  assertSafePerceptionId(event.connectorId, 'connector id');
  assertSafePerceptionId(event.sourceEventId, 'source event id');
  if (!SOURCES.has(event.source)) throw new Error('Unsupported perception source');
  if (!EVENT_TYPES.has(event.type)) throw new Error('Unsupported perception event type');
  if (!isIsoDate(event.occurredAt) || !isIsoDate(event.receivedAt)) throw new Error('Invalid perception event timestamp');
  if (!event.actor.externalId.trim()) throw new Error('Perception actor externalId is required');
  if (!event.provenance.rawPayloadRef.trim()) throw new Error('rawPayloadRef is required');
}

