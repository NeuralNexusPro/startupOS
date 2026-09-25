import type {
  CanonicalAgentContract,
  CanonicalConceptReference,
  CanonicalContractEdge,
  CanonicalOntologyReference,
  CanonicalSkillContract,
  CanonicalSourceReference,
  CanonicalOntology,
} from '../ontology';

export const SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION = '1.0.0' as const;

export type SolutionExecutionContractSchemaVersion =
  typeof SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION;

export interface SolutionContractNode {
  readonly id: string;
  readonly kind: 'agent' | 'skill';
  readonly contractRef: string;
  readonly requiresVerification: boolean;
  readonly hitlPolicyId?: string;
}

export interface CollaborationTopologyContract {
  readonly nodes: readonly SolutionContractNode[];
  readonly edges: readonly CanonicalContractEdge[];
  readonly externalInputs: readonly (CanonicalConceptReference & {
    readonly factTypeId: string;
  })[];
}

export interface VerificationPolicy {
  readonly id: string;
  readonly nodeId: string;
  readonly verifierRef: string;
  readonly evidenceSchemaRef: string;
}

export interface HitlPolicy {
  readonly id: string;
  readonly nodeId: string;
  readonly trigger: 'before_execution' | 'after_verification' | 'on_failure';
  readonly approverRole: string;
}

export interface PermissionPolicy {
  readonly allowed: readonly string[];
}

export interface RuntimeBudgetPolicy {
  readonly maxAttempts: number;
  readonly maxDurationMs: number;
  readonly maxTokens: number;
}

export type SemanticConceptResolution =
  | {
      readonly status: 'confirmed';
      readonly evidenceSourceRefIds: readonly string[];
    }
  | {
      readonly status: 'ambiguous';
      readonly candidateConceptIds: readonly string[];
      readonly reason: string;
    };

export interface SemanticObjectSlot {
  readonly id: string;
  readonly concept: CanonicalConceptReference;
  readonly required: boolean;
  readonly resolution: SemanticConceptResolution;
}

export type SemanticFactStatePolicy =
  | { readonly mode: 'any' }
  | { readonly mode: 'required'; readonly stateIds: readonly string[] };

export type SemanticFactFreshnessPolicy =
  | { readonly mode: 'any' }
  | { readonly mode: 'max_age'; readonly maxAgeMs: number };

export interface SemanticFactPolicy {
  readonly factType: CanonicalConceptReference & {
    readonly factTypeId: string;
  };
  readonly state: SemanticFactStatePolicy;
  readonly freshness: SemanticFactFreshnessPolicy;
}

export interface SolutionTaskTemplate {
  readonly id: string;
  readonly designNodeId: string;
  readonly objective: string;
  readonly candidateAgentIds: readonly string[];
  readonly candidateSkillIds: readonly string[];
}

export interface SemanticContextContract {
  readonly ontology: CanonicalOntologyReference;
  readonly sourceRefs: readonly CanonicalSourceReference[];
  readonly objectSlots: readonly SemanticObjectSlot[];
  readonly factPolicies: readonly SemanticFactPolicy[];
  readonly allowedActionIds: readonly string[];
  readonly taskTemplates: readonly SolutionTaskTemplate[];
}

export interface SolutionExecutionContractBody {
  readonly schemaVersion: SolutionExecutionContractSchemaVersion;
  readonly contractId: string;
  readonly projectId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly status: 'approved';
  readonly modelingDimension: 'workflow' | 'team';
  readonly topology: CollaborationTopologyContract;
  readonly agents: readonly CanonicalAgentContract[];
  readonly skills: readonly CanonicalSkillContract[];
  readonly semanticContext: SemanticContextContract;
  readonly verification: readonly VerificationPolicy[];
  readonly hitl: readonly HitlPolicy[];
  readonly permissions: PermissionPolicy;
  readonly budget: RuntimeBudgetPolicy;
  readonly createdAt: string;
}

export interface SolutionExecutionContract extends SolutionExecutionContractBody {
  readonly contractHash: string;
}

export interface SolutionExecutionContractRevocation {
  readonly contractId: string;
  readonly revokedAt: string;
  readonly reason: string;
}

export interface PublishedSolutionExecutionContract {
  readonly contract: SolutionExecutionContract;
  readonly revocation?: SolutionExecutionContractRevocation;
}

export interface SolutionVersionRef {
  readonly projectId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
}

export interface ContractRef extends SolutionVersionRef {
  readonly contractId: string;
}

export interface DesignGap {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly scope: 'solution' | 'node' | 'edge' | 'contract' | 'policy';
  readonly refId?: string;
  readonly path?: string;
  readonly message: string;
  readonly remediation: string;
}

export interface DesignValidationResult {
  readonly valid: boolean;
  readonly gaps: readonly DesignGap[];
}

export type SolutionContractCompilationResult =
  | { readonly ok: true; readonly contract: SolutionExecutionContract }
  | { readonly ok: false; readonly gaps: readonly DesignGap[] };

export type ContractIntegrityResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code: 'SCHEMA_MISMATCH' | 'HASH_MISMATCH';
      readonly message: string;
    };

export interface SolutionExecutionContractPort {
  load(
    input: SolutionVersionRef
  ): Promise<PublishedSolutionExecutionContract | null>;
  verifyIntegrity(
    contract: SolutionExecutionContract
  ): Promise<ContractIntegrityResult>;
}

/** Read-only project catalog used by task creation surfaces. */
export interface SolutionExecutionContractCatalogPort {
  listProject(
    projectId: string
  ): Promise<readonly PublishedSolutionExecutionContract[]>;
}

export type SolutionDesignStatus = 'draft' | 'reviewing' | 'confirmed';

export interface SolutionExecutionContractDesign {
  readonly ontology: CanonicalOntology;
  readonly status: SolutionDesignStatus;
  readonly body: SolutionExecutionContractBody;
}

export type SolutionDesignSourceResult =
  | {
      readonly ok: true;
      readonly design: SolutionExecutionContractDesign;
    }
  | {
      readonly ok: false;
      readonly gaps: readonly DesignGap[];
    };

/**
 * Narrow boundary implemented by project adapters that understand the
 * persisted P2.5/P2.6/P2.7 design bundle. The publishing service deliberately
 * does not parse project files or invent missing semantic fields.
 */
export type SolutionDesignSourceFormat =
  'versioned_bundle' | 'legacy_compatibility';

export interface SolutionDesignLoadOptions {
  readonly sourceFormat: SolutionDesignSourceFormat;
}

export interface SolutionContractCompilationInput extends SolutionVersionRef {
  /** Defaults to the canonical versioned bundle. Legacy input requires opt-in. */
  readonly sourceFormat?: SolutionDesignSourceFormat;
}

export interface SolutionDesignSource {
  load(
    input: SolutionVersionRef,
    options: SolutionDesignLoadOptions
  ): Promise<SolutionDesignSourceResult | null>;
}

export interface RevokeSolutionExecutionContractInput extends ContractRef {
  readonly reason: string;
}

export type SolutionContractPublishingErrorCategory =
  'validation' | 'not_found' | 'conflict' | 'integrity' | 'internal';

export type SolutionContractPublishingErrorCode =
  | 'INVALID_REQUEST'
  | 'DESIGN_NOT_FOUND'
  | 'CONTRACT_NOT_FOUND'
  | 'CONTRACT_VERSION_CONFLICT'
  | 'CONTRACT_ID_MISMATCH'
  | 'CONTRACT_INTEGRITY_FAILED'
  | 'INTERNAL_ERROR';
