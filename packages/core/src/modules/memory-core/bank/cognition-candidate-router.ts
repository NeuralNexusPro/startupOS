import { createHash } from 'node:crypto';
import type {
  CognitionCandidateConsumers,
  CognitionRecord,
  KnowledgeCognitionCandidate,
  ObservationContext,
  PatternEvidenceCandidate,
} from './types';

export class CognitionCandidateRouter {
  constructor(private readonly consumers: CognitionCandidateConsumers) {}

  async route(records: CognitionRecord[], context: ObservationContext): Promise<void> {
    if (!context.persistent || context.owner.scope === 'session') return;
    const owner = context.owner as { scope: 'agent' | 'project'; ownerId: string };
    const eligible = records.filter((record) =>
      record.scope === owner.scope &&
      record.ownerId === owner.ownerId &&
      record.status === 'active'
    );
    const sourceSkillId = context.provenance.skillId;
    const knowledge: KnowledgeCognitionCandidate[] = eligible
      .filter((record): record is CognitionRecord & { kind: 'world_fact' | 'observation' } =>
        record.kind === 'world_fact' || record.kind === 'observation'
      )
      .filter((record) => context.policy.allowedKnowledgeKinds.includes(record.kind))
      .map((record) => ({
        stableKey: this.stableKey(owner.scope, owner.ownerId, record.id),
        ownerScope: owner.scope,
        ownerId: owner.ownerId,
        recordId: record.id,
        kind: record.kind,
        content: record.content,
        confidence: record.confidence,
        evidenceRefs: record.evidence,
        proofCount: record.proofCount,
        sourceSkillId,
      }));
    const pattern: PatternEvidenceCandidate[] = context.policy.allowPatternPromotion
      ? eligible.filter((record) => record.kind === 'experience').map((record) => ({
          stableKey: this.stableKey(owner.scope, owner.ownerId, record.id),
          ownerScope: owner.scope,
          ownerId: owner.ownerId,
          recordId: record.id,
          content: record.content,
          polarity: record.tags.includes('tool-failure') || record.status === 'conflicted' ? 'negative' : 'positive',
          evidenceRefs: record.evidence,
          proofCount: record.proofCount,
          applicability: context.policy.patternApplicability,
          sourceSkillId,
        }))
      : [];

    if (knowledge.length > 0) await this.consumers.knowledge?.ingestCognitionCandidates(knowledge);
    if (pattern.length > 0) await this.consumers.pattern?.ingestPatternEvidence(pattern);
  }

  private stableKey(scope: string, ownerId: string, recordId: string): string {
    return createHash('sha256').update(`${scope}\0${ownerId}\0${recordId}`).digest('hex');
  }
}
