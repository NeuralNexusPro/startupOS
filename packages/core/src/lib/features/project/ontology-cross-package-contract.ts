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
      readonly operationId: string;
      readonly actionId: string;
      readonly inputs: Readonly<Record<string, unknown>>;
      readonly expectedRevision: number;
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
      readonly taskRevision: number;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'inspect_bound_task';
      readonly taskId: string;
    })
  | (OntologyCrossPackageRequestBase & {
      readonly type: 'control_bound_task';
      readonly taskId: string;
      readonly action: 'pause' | 'resume' | 'cancel';
      readonly expectedRevision: number;
    });

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
}

export interface OntologyCrossPackageSuccess<TData> {
  readonly ok: true;
  readonly requestId: string;
  readonly data: TData;
  readonly revision?: number;
  readonly cursor?: string;
  readonly receiptRef?: string;
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
