import { randomUUID } from 'node:crypto';
import type { PerceptionDeadLetter, PerceptionRetryRecord } from '../../../types/perception';
import { computeRetryDelayMs, type RetryPolicyOptions } from './retry-policy';
import { PerceptionDeadLetterStore, PerceptionRetryStore } from './retry-store';

export interface RetryHandler { execute(record: PerceptionRetryRecord): Promise<void> }

export class PerceptionRetryService {
  constructor(
    private readonly retries: PerceptionRetryStore,
    private readonly deadLetters: PerceptionDeadLetterStore,
    private readonly policy: RetryPolicyOptions = {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  schedule(input: { eventId: string; ruleId: string; connectorId: string; maxAttempts: number; safeCode: string }): PerceptionRetryRecord | PerceptionDeadLetter {
    const id = this.retries.stableId(input.eventId, input.ruleId);
    const existing = this.retries.get(input.connectorId, id);
    const attempt = (existing?.attempt ?? 0) + 1;
    if (attempt >= input.maxAttempts) return this.deadLetter(input, id, attempt);
    const now = this.now();
    return this.retries.create({
      id, eventId: input.eventId, ruleId: input.ruleId, connectorId: input.connectorId,
      attempt, maxAttempts: input.maxAttempts, status: 'scheduled',
      nextAttemptAt: new Date(now.getTime() + computeRetryDelayMs(attempt, this.policy)).toISOString(),
      lastSafeCode: input.safeCode,
    });
  }

  async processDue(handler: RetryHandler, limit = 100): Promise<{ completed: number; failed: number }> {
    let completed = 0;
    let failed = 0;
    for (const record of this.retries.listDue(this.now().toISOString(), limit)) {
      this.retries.write({ ...record, status: 'processing', updatedAt: this.now().toISOString() });
      try {
        await handler.execute(record);
        this.retries.write({ ...record, status: 'completed', updatedAt: this.now().toISOString() });
        completed += 1;
      } catch {
        this.schedule({ ...record, safeCode: 'RETRY_EXECUTION_FAILED' });
        failed += 1;
      }
    }
    return { completed, failed };
  }

  replay(deadLetter: PerceptionDeadLetter): PerceptionRetryRecord {
    const now = this.now().toISOString();
    this.deadLetters.save({ ...deadLetter, replayedAt: now });
    return this.retries.create({
      id: randomUUID(), eventId: deadLetter.eventId, ruleId: deadLetter.ruleId, connectorId: deadLetter.connectorId,
      attempt: 0, maxAttempts: Math.max(1, deadLetter.attempts), status: 'scheduled', nextAttemptAt: now,
      lastSafeCode: 'MANUAL_REPLAY',
    });
  }

  private deadLetter(input: { eventId: string; ruleId: string; connectorId: string; safeCode: string }, retryId: string, attempts: number): PerceptionDeadLetter {
    const retry = this.retries.get(input.connectorId, retryId);
    if (retry) this.retries.write({ ...retry, attempt: Math.min(attempts, retry.maxAttempts), status: 'dead-letter', lastSafeCode: input.safeCode, updatedAt: this.now().toISOString() });
    return this.deadLetters.save({
      id: randomUUID(), retryId, eventId: input.eventId, ruleId: input.ruleId, connectorId: input.connectorId,
      attempts, lastSafeCode: input.safeCode, createdAt: this.now().toISOString(),
    });
  }
}
