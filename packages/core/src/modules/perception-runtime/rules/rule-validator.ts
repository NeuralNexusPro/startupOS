import type { PerceptionTriggerRule, PerceptionTriggerTarget, TriggerFilterOperator, TriggerFilterPath } from '../../../types/perception';
import { assertSafePerceptionId } from '../protocol/validation';

const PATHS = new Set<TriggerFilterPath>([
  'source', 'connectorId', 'type', 'actor.externalId', 'conversation.externalId',
  'content.text', 'content.subject', 'provenance.tenantExternalId',
]);
const OPERATORS = new Set<TriggerFilterOperator>(['equals', 'contains', 'startsWith', 'exists']);

export function validateTriggerRule(rule: PerceptionTriggerRule): void {
  assertSafePerceptionId(rule.id, 'trigger rule id');
  if (rule.sources.length === 0 || rule.eventTypes.length === 0) throw new Error('Trigger rule source and event type are required');
  if (new Set(rule.sources).size !== rule.sources.length || new Set(rule.eventTypes).size !== rule.eventTypes.length) {
    throw new Error('Trigger rule contains duplicate source or event type');
  }
  if (rule.conditions.length > 20) throw new Error('Trigger rule has too many conditions');
  for (const condition of rule.conditions) {
    if (!PATHS.has(condition.path) || !OPERATORS.has(condition.operator)) throw new Error('Unsupported trigger filter');
    if (condition.operator !== 'exists' && condition.value === undefined) throw new Error('Trigger filter value is required');
    if ((condition.operator === 'contains' || condition.operator === 'startsWith') && typeof condition.value !== 'string') {
      throw new Error('String trigger operator requires a string value');
    }
  }
  if (rule.routingMode === 'jev') validateDecisionRule(rule);
  else validateTarget(rule.target);
  if (!Number.isSafeInteger(rule.execution.maxAttempts) || rule.execution.maxAttempts < 1 || rule.execution.maxAttempts > 10) {
    throw new Error('Trigger rule maxAttempts must be between 1 and 10');
  }
  if (!Number.isFinite(Date.parse(rule.createdAt)) || !Number.isFinite(Date.parse(rule.updatedAt))) throw new Error('Invalid trigger rule timestamp');
}

function validateDecisionRule(rule: Extract<PerceptionTriggerRule, { routingMode: 'jev' }>): void {
  if (rule.decision.catalogVersion !== '1.0' || rule.decision.policyVersion !== '1.0') throw new Error('Unsupported Jev decision version');
  if (rule.decision.cognitiveGuidance !== undefined && (typeof rule.decision.cognitiveGuidance !== 'string' || rule.decision.cognitiveGuidance.trim().length > 4_000)) {
    throw new Error('Jev cognitive guidance must be a string of at most 4000 characters');
  }
  const keys = new Set<string>();
  let dispatchCount = 0;
  let ignoreCount = 0;
  let notifyCount = 0;
  let userSelectionCount = 0;
  for (const candidate of rule.decision.candidates) {
    if (keys.has(candidate.key)) throw new Error('Duplicate Jev decision candidate key');
    keys.add(candidate.key);
    if (candidate.action === 'ignore') {
      if (candidate.key !== 'ignore') throw new Error('Invalid Jev ignore candidate key');
      ignoreCount += 1;
      continue;
    }
    if (candidate.action === 'notify_user') {
      if (candidate.key !== 'notify_user') throw new Error('Invalid Jev notify candidate key');
      notifyCount += 1;
      continue;
    }
    if (candidate.action === 'ask_user_to_choose_target') {
      if (candidate.key !== 'ask_user_to_choose_target') throw new Error('Invalid Jev user target selection candidate key');
      userSelectionCount += 1;
      continue;
    }
    dispatchCount += 1;
    validateTarget(candidate.target);
    if (candidate.key !== `${candidate.target.kind}:${candidate.target.id}` || candidate.key === 'ignore' || candidate.key === 'notify_user' || candidate.key === 'ask_user_to_choose_target') {
      throw new Error('Invalid Jev dispatch candidate key');
    }
  }
  if (ignoreCount !== 1 || notifyCount !== 1) throw new Error('Jev decision requires one of each reserved candidate');
  if (userSelectionCount > 1) throw new Error('Jev decision allows at most one user target selection candidate');
  if (dispatchCount === 0 || dispatchCount > 20) throw new Error('Jev decision requires between 1 and 20 dispatch candidates');
}

function validateTarget(target: PerceptionTriggerTarget): void {
  assertSafePerceptionId(target.id, 'trigger target id');
  if (target.kind === 'skill') {
    if (!target.skillOwnership) throw new Error('Skill cognition ownership is required');
    if (target.skillOwnership.mode === 'inherited') assertSafePerceptionId(target.skillOwnership.ownerId, 'skill owner id');
  } else if (target.skillOwnership !== undefined) {
    throw new Error('Only Skill targets may declare skill ownership');
  }
}
