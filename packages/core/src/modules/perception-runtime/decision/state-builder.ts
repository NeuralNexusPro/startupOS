import { createHmac } from 'node:crypto';
import type {
  JevDecisionRequest,
  PerceptionDecisionCandidate,
  PerceptionEventV1,
  PerceptionTargetAuthorization,
  PerceptionTriggerTarget,
} from '../../../types/perception';
import { redactSensitiveContent } from '../security/content-defense';

const SUMMARY_LIMIT = 500;

export interface AuthorizedDecisionCandidate {
  candidate: PerceptionDecisionCandidate;
  authorization?: PerceptionTargetAuthorization;
}

export function decisionCandidateKey(target: PerceptionTriggerTarget): string {
  return `${target.kind}:${target.id}`;
}

export function buildDecisionRequest(
  event: PerceptionEventV1,
  candidates: readonly AuthorizedDecisionCandidate[],
  hashSalt: string,
): JevDecisionRequest {
  if (!hashSalt) throw new Error('Decision state hash salt is required');
  const ordered = [...candidates].sort((left, right) => left.candidate.key.localeCompare(right.candidate.key));
  const externalIds = [event.actor.externalId, event.conversation?.externalId].filter((value): value is string => Boolean(value));
  const state = redactSensitiveContent({
    version: '1.0',
    source: event.source,
    eventType: event.type,
    occurredAt: event.occurredAt,
    actorRef: reference(event.actor.externalId, hashSalt),
    ...(event.conversation ? {
      conversation: { kind: event.conversation.kind, ref: reference(event.conversation.externalId, hashSalt) },
    } : {}),
    summary: {
      ...(event.content.subject !== undefined ? { subject: summary(event.content.subject, externalIds) } : {}),
      ...(event.content.text !== undefined ? { text: summary(event.content.text, externalIds) } : {}),
    },
    attachmentCount: event.content.attachmentRefs?.length ?? 0,
    candidates: ordered.map(({ candidate, authorization }) => ({
      key: candidate.key,
      action: candidate.action,
      ...(candidate.action === 'dispatch' ? { targetKind: candidate.target.kind } : {}),
      ...(authorization?.effectiveToolScope ? { effectiveToolScope: [...new Set(authorization.effectiveToolScope)].sort() } : {}),
    })),
  });
  return { state, candidateKeys: ordered.map(({ candidate }) => candidate.key), catalogVersion: '1.0' };
}

function reference(value: string, hashSalt: string): string {
  return createHmac('sha256', hashSalt).update(value).digest('hex');
}

function summary(value: string, externalIds: readonly string[]): string {
  const withoutExternalIds = externalIds.reduce((text, externalId) => text.replaceAll(externalId, '[REDACTED_REF]'), value);
  const safe = withoutExternalIds
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*)['"]?[^\s'"]+['"]?/gi, '$1[REDACTED]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return safe.length <= SUMMARY_LIMIT ? safe : `${safe.slice(0, SUMMARY_LIMIT)}…`;
}
