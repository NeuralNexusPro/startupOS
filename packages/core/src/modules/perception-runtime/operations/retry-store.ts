import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PerceptionDeadLetter, PerceptionRetryRecord } from '../../../types/perception';
import { assertSafePerceptionId } from '../protocol/validation';
import { AtomicDataFileStore } from '../storage/data-file-store';
import { resolvePerceptionPath } from '../storage/paths';

export class PerceptionRetryStore {
  constructor(private readonly dataRoot: string) {}
  create(input: Omit<PerceptionRetryRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): PerceptionRetryRecord {
    const now = new Date().toISOString();
    const record: PerceptionRetryRecord = { ...input, id: input.id ?? randomUUID(), createdAt: now, updatedAt: now };
    this.write(record);
    return record;
  }
  get(connectorId: string, id: string): PerceptionRetryRecord | null {
    const store = this.store(connectorId, id);
    return store.exists() ? store.read().data : null;
  }
  write(record: PerceptionRetryRecord): PerceptionRetryRecord {
    validateRetry(record);
    this.store(record.connectorId, record.id).write(record);
    return record;
  }
  listDue(now: string, limit = 100): PerceptionRetryRecord[] {
    const root = resolvePerceptionPath(this.dataRoot, 'retry');
    if (!fs.existsSync(root)) return [];
    const records: PerceptionRetryRecord[] = [];
    for (const connectorId of fs.readdirSync(root).sort()) {
      const directory = path.join(root, connectorId);
      if (!fs.statSync(directory).isDirectory()) continue;
      for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
        const record = this.get(connectorId, file.slice(0, -5));
        if (record?.status === 'scheduled' && record.nextAttemptAt <= now) records.push(record);
        if (records.length >= limit) return records;
      }
    }
    return records;
  }
  stableId(eventId: string, ruleId: string): string { return createHash('sha256').update(`${eventId}\0${ruleId}`).digest('hex') }
  private store(connectorId: string, id: string): AtomicDataFileStore<PerceptionRetryRecord> {
    assertSafePerceptionId(connectorId, 'retry connector id');
    assertSafePerceptionId(id, 'retry id');
    return new AtomicDataFileStore<PerceptionRetryRecord>(path.join(resolvePerceptionPath(this.dataRoot, 'retry', connectorId), `${id}.json`));
  }
}

export class PerceptionDeadLetterStore {
  constructor(private readonly dataRoot: string) {}
  save(record: PerceptionDeadLetter): PerceptionDeadLetter {
    assertSafePerceptionId(record.id, 'dead letter id');
    assertSafePerceptionId(record.connectorId, 'dead letter connector id');
    this.store(record.connectorId, record.id).write(record);
    return record;
  }
  get(connectorId: string, id: string): PerceptionDeadLetter | null {
    const store = this.store(connectorId, id);
    return store.exists() ? store.read().data : null;
  }
  list(connectorId?: string): PerceptionDeadLetter[] {
    const root = resolvePerceptionPath(this.dataRoot, 'dead-letter');
    if (!fs.existsSync(root)) return [];
    const connectors = connectorId ? [connectorId] : fs.readdirSync(root);
    return connectors.flatMap((id) => {
      const directory = path.join(root, id);
      if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
      return fs.readdirSync(directory).filter((file) => file.endsWith('.json')).map((file) => this.get(id, file.slice(0, -5))).filter((item): item is PerceptionDeadLetter => item !== null);
    });
  }
  private store(connectorId: string, id: string): AtomicDataFileStore<PerceptionDeadLetter> {
    assertSafePerceptionId(connectorId, 'dead letter connector id');
    assertSafePerceptionId(id, 'dead letter id');
    return new AtomicDataFileStore<PerceptionDeadLetter>(path.join(resolvePerceptionPath(this.dataRoot, 'dead-letter', connectorId), `${id}.json`));
  }
}

function validateRetry(record: PerceptionRetryRecord): void {
  assertSafePerceptionId(record.id, 'retry id');
  assertSafePerceptionId(record.connectorId, 'retry connector id');
  assertSafePerceptionId(record.eventId, 'retry event id');
  assertSafePerceptionId(record.ruleId, 'retry rule id');
  if (record.attempt < 0 || record.attempt > record.maxAttempts) throw new Error('Invalid retry attempt');
  if (!Number.isFinite(Date.parse(record.nextAttemptAt))) throw new Error('Invalid retry timestamp');
}
