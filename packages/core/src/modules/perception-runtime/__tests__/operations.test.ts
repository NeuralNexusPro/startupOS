import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorHealth, PerceptionRetryRecord } from '../../../types/perception';
import {
  ConnectorHealthStore,
  PerceptionDeadLetterStore,
  PerceptionRetryService,
  PerceptionRetryStore,
  computeRetryDelayMs,
} from '..';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-perception-operations-'));
  roots.push(value);
  return value;
}

describe('perception retry operations', () => {
  it('uses bounded exponential backoff with deterministic jitter injection', () => {
    const policy = { baseDelayMs: 1_000, maxDelayMs: 5_000, jitterRatio: 0.2, random: () => 1 };
    expect(computeRetryDelayMs(1, policy)).toBe(1_200);
    expect(computeRetryDelayMs(2, policy)).toBe(2_400);
    expect(computeRetryDelayMs(9, policy)).toBe(5_000);
  });

  it('isolates a failed connector while another due retry completes', async () => {
    const dataRoot = root();
    const retries = new PerceptionRetryStore(dataRoot);
    let clock = new Date('2026-08-28T08:00:00.000Z');
    const service = new PerceptionRetryService(
      retries,
      new PerceptionDeadLetterStore(dataRoot),
      { baseDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 },
      () => clock,
    );
    service.schedule({ eventId: 'event-a', ruleId: 'rule-a', connectorId: 'email-a', maxAttempts: 3, safeCode: 'INGRESS_FAILED' });
    service.schedule({ eventId: 'event-b', ruleId: 'rule-b', connectorId: 'feishu-b', maxAttempts: 3, safeCode: 'INGRESS_FAILED' });
    clock = new Date('2026-08-28T08:00:00.002Z');

    const result = await service.processDue({
      execute: async (record: PerceptionRetryRecord) => {
        if (record.connectorId === 'email-a') throw new Error('credential-secret');
      },
    });

    expect(result).toEqual({ completed: 1, failed: 1 });
    expect(retries.get('feishu-b', retries.stableId('event-b', 'rule-b'))?.status).toBe('completed');
    const persisted = fs.readFileSync(path.join(dataRoot, 'perception', 'retry', 'email-a', `${retries.stableId('event-a', 'rule-a')}.json`), 'utf8');
    expect(persisted).not.toContain('credential-secret');
  });

  it('moves exhausted retries to a dead letter and supports a fresh replay record', async () => {
    const dataRoot = root();
    const retries = new PerceptionRetryStore(dataRoot);
    const deadLetters = new PerceptionDeadLetterStore(dataRoot);
    let clock = new Date('2026-08-28T08:00:00.000Z');
    const service = new PerceptionRetryService(
      retries,
      deadLetters,
      { baseDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 },
      () => clock,
    );
    service.schedule({ eventId: 'event-1', ruleId: 'rule-1', connectorId: 'email-main', maxAttempts: 2, safeCode: 'FAILED' });
    clock = new Date('2026-08-28T08:00:00.002Z');
    await service.processDue({ execute: async () => { throw new Error('still failing'); } });
    const deadLetter = deadLetters.list('email-main')[0];
    expect(deadLetter).toMatchObject({ eventId: 'event-1', attempts: 2, lastSafeCode: 'RETRY_EXECUTION_FAILED' });
    const replay = service.replay(deadLetter!);
    expect(replay).toMatchObject({ status: 'scheduled', attempt: 0, lastSafeCode: 'MANUAL_REPLAY' });
    expect(replay.id).not.toBe(deadLetter?.retryId);
  });
});

describe('connector health isolation', () => {
  it('persists mode-specific email, webhook, and Stream health independently', () => {
    const store = new ConnectorHealthStore(root());
    const updatedAt = '2026-08-28T08:00:00.000Z';
    const values: ConnectorHealth[] = [
      { connectorId: 'email-main', mode: 'email-poll', status: 'healthy', updatedAt, lastUid: 42, lastCursorAt: updatedAt },
      { connectorId: 'feishu-main', mode: 'webhook', status: 'degraded', updatedAt, lastCallbackAt: updatedAt },
      { connectorId: 'dingtalk-main', mode: 'stream', status: 'disconnected', updatedAt, connectionState: 'disconnected', reconnectCount: 3, pendingHandlers: 1 },
    ];
    values.forEach((value) => store.save(value));
    expect(store.list()).toEqual(expect.arrayContaining(values));
    expect(store.get('email-main')).toMatchObject({ mode: 'email-poll', lastUid: 42 });
    expect(store.get('feishu-main')).toMatchObject({ mode: 'webhook', lastCallbackAt: updatedAt });
    expect(store.get('dingtalk-main')).toMatchObject({ mode: 'stream', reconnectCount: 3 });
  });
});
