import { createHmac } from 'node:crypto';
import type {
  JevDecisionRequest,
  PerceptionDecisionCandidate,
  PerceptionEventV1,
  PerceptionTargetAuthorization,
  PerceptionTargetProfile,
  PerceptionTriggerTarget,
  JsonValue,
} from '../../../types/perception';
import { redactSensitiveContent } from '../security/content-defense';

const SUMMARY_LIMIT = 500;

export interface AuthorizedDecisionCandidate {
  candidate: PerceptionDecisionCandidate;
  authorization?: PerceptionTargetAuthorization;
  profile?: PerceptionTargetProfile;
}
export interface DecisionConversationContext {
  feedback?: PerceptionEventV1;
  history?: readonly PerceptionEventV1[];
  pendingChoiceFeedback?: boolean;
}

export function decisionCandidateKey(target: PerceptionTriggerTarget): string {
  return `${target.kind}:${target.id}`;
}

export function buildDecisionRequest(
  event: PerceptionEventV1,
  candidates: readonly AuthorizedDecisionCandidate[],
  hashSalt: string,
  context?: DecisionConversationContext,
  cognitiveGuidance?: string,
): JevDecisionRequest {
  if (!hashSalt) throw new Error('Decision state hash salt is required');
  const ordered = [...candidates].sort((left, right) => left.candidate.key.localeCompare(right.candidate.key));
  const externalIds = [event, ...(context?.history ?? []), ...(context?.feedback ? [context.feedback] : [])].flatMap((item) => [item.actor.externalId, item.conversation?.externalId]).filter((value): value is string => Boolean(value));
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
    ...(cognitiveGuidance?.trim() ? { userCognitiveGuidance: summary(cognitiveGuidance, [], 2_000) } : {}),
    ...(context?.feedback ? { userFeedback: eventSummary(context.feedback, externalIds) } : {}),
    ...(context?.history?.length ? { conversationHistory: context.history.slice(-8).map((item) => eventSummary(item, externalIds)) } : {}),
    candidates: ordered.map(({ candidate, authorization, profile }) => ({
      key: candidate.key,
      action: candidate.action,
      ...(candidate.action === 'dispatch' ? { targetKind: candidate.target.kind } : {}),
      ...(authorization?.effectiveToolScope ? { effectiveToolScope: [...new Set(authorization.effectiveToolScope)].sort() } : {}),
      ...(profile ? { targetProfile: safeProfile(profile) } : {}),
    })),
  });
  return {
    state,
    candidateKeys: ordered.map(({ candidate }) => candidate.key),
    candidateCriteria: Object.fromEntries(ordered.map(({ candidate, authorization, profile }) => [candidate.key, candidateCriterion(candidate, authorization, profile)])),
    catalogVersion: '1.0',
    ...(context?.pendingChoiceFeedback ? { pendingChoiceFeedback: true } : {}),
  };
}

function eventSummary(event: PerceptionEventV1, externalIds: readonly string[]): JsonValue {
  return {
    eventType: event.type,
    occurredAt: event.occurredAt,
    ...(event.content.subject !== undefined ? { subject: summary(event.content.subject, externalIds) } : {}),
    ...(event.content.text !== undefined ? { text: summary(event.content.text, externalIds) } : {}),
  };
}

function candidateCriterion(candidate: PerceptionDecisionCandidate, authorization?: PerceptionTargetAuthorization, profile?: PerceptionTargetProfile): JsonValue {
  if (candidate.action === 'ignore') return { action: 'ignore', description: 'No user attention or target action is needed.' };
  if (candidate.action === 'notify_user') return { action: 'notify_user', description: 'Notify the user directly without invoking a target capability.' };
  if (candidate.action === 'ask_user_to_choose_target') return {
    action: 'ask_user_to_choose_target',
    description: 'Ask the user to choose which authorized role or capability should handle the request.',
  };
  return {
    action: 'dispatch',
    targetKind: candidate.target.kind,
    ...(authorization?.effectiveToolScope ? { effectiveToolScope: [...new Set(authorization.effectiveToolScope)].sort() } : {}),
    ...(profile ? safeProfile(profile) : {}),
  };
}

function safeProfile(profile: PerceptionTargetProfile): Record<string, JsonValue> {
  return {
    name: summary(profile.name, []),
    ...(profile.description ? { description: summary(profile.description, []) } : {}),
    ...(profile.domain ? { domain: summary(profile.domain, []) } : {}),
    ...(profile.tags?.length ? { tags: profile.tags.slice(0, 8).map((tag) => summary(tag, [])) } : {}),
    ...(profile.owner ? {
      owner: {
        kind: profile.owner.kind,
        name: summary(profile.owner.name, []),
        ...(profile.owner.description ? { description: summary(profile.owner.description, []) } : {}),
      },
    } : {}),
  };
}

function reference(value: string, hashSalt: string): string {
  return createHmac('sha256', hashSalt).update(value).digest('hex');
}

function summary(value: string, externalIds: readonly string[], limit = SUMMARY_LIMIT): string {
  const withoutExternalIds = externalIds.reduce((text, externalId) => text.replaceAll(externalId, '[REDACTED_REF]'), value);
  const safe = withoutExternalIds
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*)['"]?[^\s'"]+['"]?/gi, '$1[REDACTED]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return safe.length <= limit ? safe : `${safe.slice(0, limit)}…`;
}
