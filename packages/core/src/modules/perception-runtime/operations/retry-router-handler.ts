import type { PerceptionRetryRecord } from '../../../types/perception';
import { PerceptionRouter } from '../routing/perception-router';
import { PerceptionEventStore } from '../storage/event-store';
import { TriggerRuleStore } from '../rules/rule-store';
import type { RetryHandler } from './retry-service';

export class PerceptionRetryRouterHandler implements RetryHandler {
  constructor(
    private readonly events: PerceptionEventStore,
    private readonly rules: TriggerRuleStore,
    private readonly router: PerceptionRouter,
  ) {}

  async execute(record: PerceptionRetryRecord): Promise<void> {
    const event = this.events.get(record.eventId);
    const rule = this.rules.get(record.ruleId);
    if (!rule) throw new Error('Retry rule no longer exists');
    const result = await this.router.retry(event, rule, record.id);
    if (result.status !== 'dispatched' && result.status !== 'duplicate') throw new Error(`Retry route ${result.status}`);
  }
}
