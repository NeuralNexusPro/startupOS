import type {
  CanonicalActionOutputDraft,
  CanonicalFactReference,
  CanonicalOperationRecord,
} from '../ontology';
import type {
  ProjectTaskBoardStatus,
  ProjectTaskDetail,
  ProjectTaskEvidenceGap,
  ProjectTaskSummary,
} from './task-board';
import type {
  AgentTaskProjectMetadataMutationReceiptV1,
  AgentTaskProjectPriorityV1,
} from '../../integrations/pi-agent/task-runtime';
import type {
  WorkItemHandoffCandidate,
  WorkItemHandoffReceipt,
} from '../../../modules/collaboration-runtime/facade';
import type {
  ApprovedProjectTaskCreationReceipt,
  ProjectTaskSemanticInput,
} from './project-task-creation';
import type {
  DesignGap,
  SemanticFactPolicy,
  SemanticObjectSlot,
} from '../solution';

export const ONTOLOGY_CROSS_PACKAGE_CONTRACT_VERSION = '1';

export type OntologyCrossPackageContractVersion =
  typeof ONTOLOGY_CROSS_PACKAGE_CONTRACT_VERSION;

export interface OntologyCrossPackageRequestBase {
  readonly contractVersion: OntologyCrossPackageContractVersion;
  readonly requestId: string;
  readonly actorId: string;
  readonly projectId: string;
}

export type OntologyCrossPackageRequest =
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'read_semantic_context';
      readonly ontologyId: string;
      readonly ontologyVersion: string;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'query_facts';
      readonly ontologyId: string;
      readonly ontologyVersion: string;
      readonly conceptId?: string;
      readonly factTypeId?: string;
      readonly cursor?: string;
      readonly limit?: number;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'query_projection';
      readonly ontologyId: string;
      readonly projectionId: string;
      readonly ontologyVersion: string;
      readonly cursor?: string;
      readonly limit?: number;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'submit_action';
      readonly ontologyId: string;
      readonly ontologyVersion: string;
      readonly operationId: string;
      readonly actionId: string;
      readonly conceptId: string;
      readonly currentStateId?: string;
      readonly permissions: readonly string[];
      readonly inputFactRefs: readonly CanonicalFactReference[];
      readonly outputs: readonly CanonicalActionOutputDraft[];
      readonly expectedRevision: number;
      readonly runId: string;
      readonly workItemId: string;
      readonly attemptId: string;
      readonly leaseEpoch: number;
      readonly expectedWorkItemRevision: number;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'start_bound_task';
      readonly ontologyId: string;
      readonly ontologyVersion: string;
      readonly solutionId: string;
      readonly solutionVersion: string;
      readonly executionContractId: string;
      readonly contractHash: string;
      readonly parentTaskId: string;
      readonly parentStepId: string;
      readonly parentSessionId?: string;
      readonly taskRevision: number;
      readonly inputRefs: readonly string[];
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'inspect_bound_task';
      readonly taskId: string;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'list_project_tasks';
      readonly cursor?: string;
      readonly limit?: number;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'control_bound_task';
      readonly taskId: string;
      readonly action: 'pause' | 'resume' | 'retry' | 'cancel';
      readonly expectedRevision: number;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'transition_project_task';
      readonly taskId: string;
      readonly targetStatus: ProjectTaskBoardStatus;
      readonly expectedRevision: number;
      readonly expectedLeaseEpoch?: number;
      readonly reason?: string;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'update_project_task_priority';
      readonly taskId: string;
      readonly priority: AgentTaskProjectPriorityV1;
      readonly expectedRevision: number;
      readonly expectedCursor: string | null;
      readonly bridgeEpoch: number;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'list_work_item_handoff_candidates';
      readonly runId: string;
      readonly workItemId: string;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'handoff_work_item';
      readonly runId: string;
      readonly workItemId: string;
      readonly targetAgentId: string;
      readonly expectedRunRevision: number;
      readonly expectedWorkItemRevision: number;
      readonly expectedLeaseEpoch: number;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'list_approved_task_templates';
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'create_approved_project_task';
      readonly solutionId: string;
      readonly solutionVersion: string;
      readonly contractId: string;
      readonly contractHash: string;
      readonly taskTemplateId: string;
      readonly objective: string;
      readonly semanticInputs: readonly ProjectTaskSemanticInput[];
    });

export interface OntologyApprovedTaskTemplateSummary {
  readonly id: string;
  readonly designNodeId: string;
  readonly objective: string;
  readonly candidateAgentIds: readonly string[];
  readonly candidateSkillIds: readonly string[];
}

export interface OntologyApprovedTaskContractSummary {
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly ontologyId: string;
  readonly ontologyVersion: string;
  readonly objectSlots: readonly SemanticObjectSlot[];
  readonly factPolicies: readonly SemanticFactPolicy[];
  readonly taskTemplates: readonly OntologyApprovedTaskTemplateSummary[];
}

export interface OntologyApprovedTaskTemplateCatalogData {
  readonly contracts: readonly OntologyApprovedTaskContractSummary[];
}

export type OntologyApprovedProjectTaskData = ApprovedProjectTaskCreationReceipt;

export type OntologyCrossPackageErrorCategory =
  | 'authorization'
  | 'conflict'
  | 'internal'
  | 'unavailable'
  | 'validation';

export interface OntologyCrossPackageIssue {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

export interface OntologyCrossPackageError {
  readonly category: OntologyCrossPackageErrorCategory;
  readonly code: string;
  readonly issues: readonly OntologyCrossPackageIssue[];
  readonly retryable: boolean;
  readonly remediation: string;
  readonly authoritative?: ProjectTaskSummary;
  readonly gaps?: readonly ProjectTaskEvidenceGap[];
  readonly designGaps?: readonly DesignGap[];
}

export interface OntologyCrossPackageSuccess<TData> {
  readonly ok: true;
  readonly requestId: string;
  readonly data: TData;
  readonly revision?: number;
  readonly cursor?: string;
  readonly receiptRef?: string;
}

export interface OntologyCrossPackageActionData {
  readonly operationId: string;
  readonly actionId: string;
  readonly status: CanonicalOperationRecord['status'];
  readonly factRefs: readonly CanonicalFactReference[];
  readonly workItemRevision: number;
  readonly evidenceRevision: number;
}

export interface OntologyCrossPackageRunData {
  readonly runId: string;
  readonly status: 'running' | 'paused' | 'canceled';
  readonly revision: number;
  readonly workItemCount: number;
}

export interface OntologyCrossPackageTaskPriorityData {
  readonly receipt: AgentTaskProjectMetadataMutationReceiptV1;
  readonly task: ProjectTaskDetail;
}

export interface OntologyCrossPackageHandoffCandidatesData {
  readonly candidates: readonly WorkItemHandoffCandidate[];
  readonly authority: {
    readonly runRevision: number;
    readonly workItemRevision: number;
    readonly leaseEpoch: number;
    readonly assignedAgentId: string;
  };
}

export interface OntologyCrossPackageWorkItemHandoffData {
  readonly receipt: WorkItemHandoffReceipt;
  readonly task: ProjectTaskDetail;
}

export interface OntologyCrossPackageWorkItemRecoveryInput {
  readonly projectId: string;
  readonly requestId: string;
  readonly operationId: string;
  readonly receipt: CanonicalOperationRecord & { status: 'accepted' };
  readonly runId: string;
  readonly workItemId: string;
  readonly attemptId: string;
  readonly leaseEpoch: number;
  readonly expectedWorkItemRevision: number;
}

export type OntologyCrossPackageWorkItemRecoveryResult =
  | {
      readonly ok: true;
      readonly status: 'accepted' | 'recovered';
      readonly workItemRevision: number;
      readonly evidenceRevision: number;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'WORK_ITEM_SCOPE_MISMATCH'
        | 'WORK_ITEM_REVISION_CONFLICT'
        | 'OLD_LEASE_EPOCH'
        | 'UNKNOWN_EXTERNAL_RECEIPT';
      readonly message: string;
    };

export interface OntologyCrossPackageWorkItemRecoveryPort {
  reconcile(
    input: OntologyCrossPackageWorkItemRecoveryInput
  ): Promise<OntologyCrossPackageWorkItemRecoveryResult>;
}

export type OntologyCrossPackageResponse<TData = unknown> =
  | OntologyCrossPackageSuccess<TData>
  | {
      readonly ok: false;
      readonly requestId: string;
      readonly error: OntologyCrossPackageError;
    };

export interface OntologyCrossPackageTransportPort {
  invoke(request: OntologyCrossPackageRequest): Promise<OntologyCrossPackageResponse>;
}
