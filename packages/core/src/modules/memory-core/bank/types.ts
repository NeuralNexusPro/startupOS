export type CognitionScope = 'user' | 'agent' | 'project';

export type CognitionKind =
  | 'world_fact'
  | 'experience'
  | 'observation'
  | 'mental_model';

export type CognitionStatus = 'candidate' | 'active' | 'conflicted' | 'retracted';

export interface EvidenceRef {
  id: string;
  source: 'conversation' | 'tool' | 'document' | 'legacy' | 'user_confirmation';
  sourceId: string;
  excerpt: string;
  observedAt: string;
}

export interface CognitionRecord {
  id: string;
  scope: CognitionScope;
  ownerId: string;
  kind: CognitionKind;
  content: string;
  confidence: number;
  status: CognitionStatus;
  evidence: EvidenceRef[];
  proofCount: number;
  tags: string[];
  validFrom?: string;
  validTo?: string;
  conflictsWith?: string[];
  supersedes?: string[];
  createdAt: string;
  updatedAt: string;
}

export type ObservationMode = 'role-agent' | 'project' | 'standalone-skill' | 'inherited-skill';
export type PatternApplicability = 'role-wide' | 'project-local' | 'none';

export interface ObservationPolicy {
  allowedKnowledgeKinds: CognitionKind[];
  allowPatternPromotion: boolean;
  minimumIndependentEvidence: number;
  trustedSources: EvidenceRef['source'][];
  temporalMode: 'stable' | 'project-state' | 'ephemeral';
  conflictMode: 'conflict' | 'supersede' | 'discard';
  patternApplicability: PatternApplicability;
  promptTemplateId: string;
}

export interface ObservationOwner {
  scope: 'agent' | 'project' | 'session';
  ownerId: string;
}

export interface ObservationContext {
  mode: ObservationMode;
  owner: ObservationOwner;
  provenance: {
    sessionId: string;
    agentId?: string;
    projectId?: string;
    skillId?: string;
  };
  policy: ObservationPolicy;
  persistent: boolean;
}

export interface ObservationResolutionInput {
  entryType: 'role-agent' | 'project' | 'skill';
  sessionId: string;
  agentId?: string;
  projectId?: string;
  skillId?: string;
  callerOwner?: { scope: 'agent' | 'project'; ownerId: string };
  callerMode?: 'role-agent' | 'project';
}

export type EvidenceFoldRelation =
  | { type: 'conflict'; targetRecordId: string }
  | { type: 'supersede'; targetRecordId: string }
  | { type: 'retract'; targetRecordId: string };

export interface EvidenceFoldInput extends RetainInput {
  relation?: EvidenceFoldRelation;
}

export interface MentalModelSnapshotData {
  model: 'user-profile' | 'world-model';
  scope: CognitionScope;
  ownerId: string;
  content: string;
  recordIds: string[];
}

export interface KnowledgeCognitionCandidate {
  stableKey: string;
  ownerScope: 'agent' | 'project';
  ownerId: string;
  recordId: string;
  kind: 'world_fact' | 'observation';
  content: string;
  confidence: number;
  evidenceRefs: EvidenceRef[];
  proofCount: number;
  sourceSkillId?: string;
}

export interface PatternEvidenceCandidate {
  stableKey: string;
  ownerScope: 'agent' | 'project';
  ownerId: string;
  recordId: string;
  content: string;
  polarity: 'positive' | 'negative';
  evidenceRefs: EvidenceRef[];
  proofCount: number;
  applicability: PatternApplicability;
  sourceSkillId?: string;
}

export interface CognitionCandidateConsumers {
  knowledge?: { ingestCognitionCandidates(candidates: KnowledgeCognitionCandidate[]): Promise<void> };
  pattern?: { ingestPatternEvidence(candidates: PatternEvidenceCandidate[]): Promise<void> };
}

export interface CognitionBankData {
  scope: CognitionScope;
  ownerId: string;
  records: CognitionRecord[];
}

export interface CognitionDataFile<T> {
  version: string;
  createdAt: string;
  updatedAt: string;
  data: T;
}

export interface CognitionBankLocation {
  scope: CognitionScope;
  ownerId: string;
  dataRoot: string;
  ownerDirectory?: string;
}

export interface RetainInput {
  kind: CognitionKind;
  content: string;
  confidence?: number;
  status?: CognitionStatus;
  evidence: EvidenceRef;
  tags?: string[];
  validFrom?: string;
  validTo?: string;
}

export interface CognitionRecallOptions {
  limit?: number;
  kinds?: CognitionKind[];
  statuses?: CognitionStatus[];
}

export interface CognitionRecallResult {
  record: CognitionRecord;
  score: number;
  strategy: 'semantic' | 'keyword';
}
