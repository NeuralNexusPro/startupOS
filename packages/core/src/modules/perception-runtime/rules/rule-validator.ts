import type { PerceptionTriggerRule, TriggerFilterOperator, TriggerFilterPath } from '../../../types/perception';
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
  assertSafePerceptionId(rule.target.id, 'trigger target id');
  if (rule.target.kind === 'skill') {
    if (!rule.target.skillOwnership) throw new Error('Skill cognition ownership is required');
    if (rule.target.skillOwnership.mode === 'inherited') assertSafePerceptionId(rule.target.skillOwnership.ownerId, 'skill owner id');
  } else if (rule.target.skillOwnership !== undefined) {
    throw new Error('Only Skill targets may declare skill ownership');
  }
  if (!Number.isSafeInteger(rule.execution.maxAttempts) || rule.execution.maxAttempts < 1 || rule.execution.maxAttempts > 10) {
    throw new Error('Trigger rule maxAttempts must be between 1 and 10');
  }
  if (!Number.isFinite(Date.parse(rule.createdAt)) || !Number.isFinite(Date.parse(rule.updatedAt))) throw new Error('Invalid trigger rule timestamp');
}
