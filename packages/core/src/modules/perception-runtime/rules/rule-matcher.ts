import type { JsonPrimitive, PerceptionEventV1, PerceptionTriggerRule, TriggerFilterPath } from '../../../types/perception';

export function matchesTriggerRule(rule: PerceptionTriggerRule, event: PerceptionEventV1): boolean {
  if (!rule.enabled || !rule.sources.includes(event.source) || !rule.eventTypes.includes(event.type)) return false;
  return rule.conditions.every((condition) => {
    const actual = readFilterValue(event, condition.path);
    if (condition.operator === 'exists') return condition.value === false ? actual === undefined : actual !== undefined;
    if (condition.operator === 'equals') return actual === condition.value;
    if (typeof actual !== 'string' || typeof condition.value !== 'string') return false;
    return condition.operator === 'contains' ? actual.includes(condition.value) : actual.startsWith(condition.value);
  });
}

function readFilterValue(event: PerceptionEventV1, path: TriggerFilterPath): JsonPrimitive | undefined {
  switch (path) {
    case 'source': return event.source;
    case 'connectorId': return event.connectorId;
    case 'type': return event.type;
    case 'actor.externalId': return event.actor.externalId;
    case 'conversation.externalId': return event.conversation?.externalId;
    case 'content.text': return event.content.text;
    case 'content.subject': return event.content.subject;
    case 'provenance.tenantExternalId': return event.provenance.tenantExternalId;
  }
}
