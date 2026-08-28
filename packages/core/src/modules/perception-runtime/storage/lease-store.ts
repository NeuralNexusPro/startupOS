import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ExecutionLease } from '../protocol/types';
import { assertSafePerceptionId } from '../protocol/validation';
import { AtomicDataFileStore } from './data-file-store';
import { resolvePerceptionPath } from './paths';

export class ExecutionLeaseStore {
  private readonly directory: string;

  constructor(dataRoot: string) {
    this.directory = resolvePerceptionPath(dataRoot, 'leases');
  }

  acquire(eventId: string, ruleId: string, attemptKey?: string): { lease: ExecutionLease; acquired: boolean } {
    assertSafePerceptionId(eventId, 'event id');
    assertSafePerceptionId(ruleId, 'rule id');
    if (attemptKey !== undefined) assertSafePerceptionId(attemptKey, 'lease attempt key');
    const id = createHash('sha256').update(`${eventId}\0${ruleId}\0${attemptKey ?? 'initial'}`).digest('hex');
    const store = new AtomicDataFileStore<ExecutionLease>(path.join(this.directory, `${id}.json`));
    if (store.exists()) return { lease: store.read().data, acquired: false };
    const now = new Date().toISOString();
    const lease: ExecutionLease = { id, eventId, ruleId, status: 'acquired', acquiredAt: now, updatedAt: now, attemptKey };
    store.write(lease);
    return { lease, acquired: true };
  }

  complete(leaseId: string, resultRef: string): ExecutionLease {
    return this.update(leaseId, 'completed', resultRef);
  }

  fail(leaseId: string): ExecutionLease {
    return this.update(leaseId, 'failed');
  }

  get(leaseId: string): ExecutionLease {
    assertSafePerceptionId(leaseId, 'lease id');
    return new AtomicDataFileStore<ExecutionLease>(path.join(this.directory, `${leaseId}.json`)).read().data;
  }

  private update(leaseId: string, status: 'completed' | 'failed', resultRef?: string): ExecutionLease {
    const current = this.get(leaseId);
    const updated: ExecutionLease = { ...current, status, updatedAt: new Date().toISOString(), resultRef };
    new AtomicDataFileStore<ExecutionLease>(path.join(this.directory, `${leaseId}.json`)).write(updated);
    return updated;
  }
}
