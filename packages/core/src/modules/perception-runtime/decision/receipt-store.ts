import { createHash } from 'node:crypto';
import path from 'node:path';
import type { JevDecisionReceipt } from '../../../types/perception';
import { assertSafePerceptionId } from '../protocol/validation';
import { AtomicDataFileStore } from '../storage/data-file-store';
import { resolvePerceptionPath } from '../storage/paths';

export class DecisionReceiptStore {
  private readonly directory: string;

  constructor(dataRoot: string) { this.directory = resolvePerceptionPath(dataRoot, 'decisions') }

  stableId(eventId: string, ruleId: string, catalogVersion: string): string {
    return createHash('sha256').update(`${eventId}\0${ruleId}\0${catalogVersion}`).digest('hex');
  }

  get(id: string): JevDecisionReceipt | null {
    const store = this.store(id);
    if (!store.exists()) return null;
    const receipt = store.read().data;
    validateReceipt(receipt);
    return receipt;
  }

  save(receipt: JevDecisionReceipt): JevDecisionReceipt {
    validateReceipt(receipt);
    this.store(receipt.id).write(receipt);
    return receipt;
  }

  async reserve(receipt: JevDecisionReceipt): Promise<{ receipt: JevDecisionReceipt; created: boolean }> {
    validateReceipt(receipt);
    let created = false;
    const file = await this.store(receipt.id).updateAsync((current) => {
      if (current) return current;
      created = true;
      return receipt;
    });
    validateReceipt(file.data);
    return { receipt: file.data, created };
  }

  async update(id: string, update: (receipt: JevDecisionReceipt) => JevDecisionReceipt): Promise<JevDecisionReceipt> {
    const file = await this.store(id).updateAsync((current) => {
      if (!current) throw new Error('Decision receipt not found');
      const next = update(current);
      validateReceipt(next);
      return next;
    });
    return file.data;
  }

  private store(id: string): AtomicDataFileStore<JevDecisionReceipt> {
    assertSafePerceptionId(id, 'decision receipt id');
    return new AtomicDataFileStore<JevDecisionReceipt>(path.join(this.directory, `${id}.json`));
  }
}

function validateReceipt(receipt: JevDecisionReceipt): void {
  assertSafePerceptionId(receipt.id, 'decision receipt id');
  assertSafePerceptionId(receipt.eventId, 'decision event id');
  assertSafePerceptionId(receipt.ruleId, 'decision rule id');
  if (receipt.threshold !== 0.8 || new Set(receipt.candidateKeys).size !== receipt.candidateKeys.length) throw new Error('Invalid decision receipt');
  if (!Number.isFinite(Date.parse(receipt.createdAt)) || !Number.isFinite(Date.parse(receipt.updatedAt))) throw new Error('Invalid decision receipt timestamp');
}
