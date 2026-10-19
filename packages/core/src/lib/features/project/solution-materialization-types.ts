import type { SolutionVersionRef } from '../solution';

export const SOLUTION_MATERIALIZATION_TASK_SCHEMA_VERSION = '1.0.0' as const;

export type SolutionMaterializationTaskStatus =
  | 'pending'
  | 'running'
  | 'failed'
  | 'completed';

export type SolutionMaterializationStepStatus =
  | 'pending'
  | 'running'
  | 'failed'
  | 'completed';

export type SolutionMaterializationStepKind = 'agent' | 'skill' | 'validation';

export interface SolutionMaterializationFrozenFile {
  readonly file: 'manifest.json' | 'agents.json' | 'skills.json';
  readonly digest: string;
  readonly size: number;
}

export interface SolutionMaterializationInputSnapshot {
  readonly digest: string;
  readonly files: readonly SolutionMaterializationFrozenFile[];
  readonly frozenAt: string;
}

export interface SolutionMaterializationArtifact {
  readonly path: string;
  readonly digest: string;
  readonly size: number;
}

export interface SolutionMaterializationClaim {
  readonly token: string;
  readonly workerId: string;
  readonly claimedAt: string;
  readonly expiresAt: string;
}

export interface SolutionMaterializationStep {
  readonly id: string;
  readonly kind: SolutionMaterializationStepKind;
  readonly subjectId: string;
  readonly ownerAgentId?: string;
  readonly sourceIndex?: number;
  readonly inputDigest: string;
  readonly expectedArtifacts: readonly string[];
  readonly dependsOn: readonly string[];
  readonly status: SolutionMaterializationStepStatus;
  readonly attempts: number;
  readonly claim?: SolutionMaterializationClaim;
  readonly artifacts: readonly SolutionMaterializationArtifact[];
  readonly error?: string;
  readonly completedAt?: string;
}

/**
 * Internal infrastructure ledger. It is intentionally not a ProjectTask,
 * collaboration Run, or WorkItem and must never be projected to a task board.
 */
export interface SolutionMaterializationTask extends SolutionVersionRef {
  readonly schemaVersion: typeof SOLUTION_MATERIALIZATION_TASK_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly status: SolutionMaterializationTaskStatus;
  readonly input: SolutionMaterializationInputSnapshot;
  readonly steps: readonly SolutionMaterializationStep[];
  readonly artifacts: readonly SolutionMaterializationArtifact[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export type SolutionMaterializationErrorCode =
  | 'INVALID_REFERENCE'
  | 'SOLUTION_NOT_FOUND'
  | 'SOLUTION_NOT_CONFIRMED'
  | 'INVALID_SOLUTION_BUNDLE'
  | 'INPUT_CHANGED'
  | 'REVISION_CONFLICT'
  | 'STEP_NOT_FOUND'
  | 'STEP_NOT_CLAIMED'
  | 'CLAIM_TOKEN_MISMATCH'
  | 'CLAIM_NOT_EXPIRED'
  | 'NO_READY_STEP'
  | 'ARTIFACT_INVALID'
  | 'VALIDATION_FAILED';

export interface ClaimSolutionMaterializationStepInput
  extends SolutionVersionRef {
  readonly workerId: string;
  readonly expectedRevision: number;
  readonly claimTtlMs?: number;
  readonly now?: string;
}

export interface CompleteSolutionMaterializationStepInput
  extends SolutionVersionRef {
  readonly stepId: string;
  readonly claimToken: string;
  readonly expectedRevision: number;
  readonly now?: string;
}

export interface FailSolutionMaterializationStepInput
  extends CompleteSolutionMaterializationStepInput {
  readonly error: string;
}

export interface RecoverSolutionMaterializationTaskInput
  extends SolutionVersionRef {
  readonly expectedRevision: number;
  readonly retryFailed?: boolean;
  readonly now?: string;
}
