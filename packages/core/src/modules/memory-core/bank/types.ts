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
  createdAt: string;
  updatedAt: string;
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

