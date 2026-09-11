import { CognitionBank } from './cognition-bank';
import type { CognitionRecord, EvidenceFoldInput, ObservationPolicy } from './types';

export class ObservationEngine {
  fold(bank: CognitionBank, input: EvidenceFoldInput, policy: ObservationPolicy): CognitionRecord {
    const relation = input.relation;
    if (!relation) return this.promote(bank.retain(input), bank, policy);
    const target = bank.get(relation.targetRecordId);
    if (!target) throw new Error(`Cognition relation target not found: ${relation.targetRecordId}`);

    if (relation.type === 'retract') {
      return bank.update(target.id, (record) => {
        if (!record.evidence.some((evidence) => evidence.id === input.evidence.id)) record.evidence.push(input.evidence);
        record.status = 'retracted';
        record.validTo = input.validTo ?? new Date().toISOString();
      });
    }

    const retained = bank.retain({
      ...input,
      status: relation.type === 'conflict' ? 'conflicted' : 'active',
      validFrom: input.validFrom ?? new Date().toISOString(),
    });
    if (relation.type === 'conflict') {
      bank.update(target.id, (record) => {
        record.status = 'conflicted';
        record.confidence *= 0.75;
        record.conflictsWith = [...new Set([...(record.conflictsWith ?? []), retained.id])];
      });
      return bank.update(retained.id, (record) => {
        record.confidence *= 0.75;
        record.conflictsWith = [...new Set([...(record.conflictsWith ?? []), target.id])];
      });
    }

    bank.update(target.id, (record) => {
      record.status = 'retracted';
      record.validTo = input.validFrom ?? new Date().toISOString();
    });
    return bank.update(retained.id, (record) => {
      record.supersedes = [...new Set([...(record.supersedes ?? []), target.id])];
    });
  }

  private promote(record: CognitionRecord, bank: CognitionBank, policy: ObservationPolicy): CognitionRecord {
    if (record.status !== 'candidate') return record;
    const trusted = record.evidence.some((evidence) => policy.trustedSources.includes(evidence.source));
    if (!trusted && record.proofCount < policy.minimumIndependentEvidence) return record;
    return bank.update(record.id, (candidate) => {
      candidate.status = 'active';
    });
  }
}
