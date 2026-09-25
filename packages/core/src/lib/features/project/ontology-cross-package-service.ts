import type {
  CanonicalContextProjectionRecord,
  CanonicalFactRecord,
  CanonicalOntologyOSDK,
  CanonicalValidationIssue,
} from '../ontology';
import type {
  CollaborationExecutionPort,
  CollaborationRunSnapshot,
} from '../../../modules/collaboration-runtime/facade';
import type { SolutionExecutionContractPort } from '../solution';
import {
  ProjectTaskRequestIdConflictError,
  ProjectTaskRevisionConflictError,
  type ProjectTaskBoardService,
  type ProjectTaskPage,
} from './task-board';
import type {
  OntologyCrossPackageActionData,
  OntologyCrossPackageErrorCategory,
  OntologyCrossPackageIssue,
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
  OntologyCrossPackageRunData,
  OntologyCrossPackageWorkItemRecoveryPort,
  OntologyCrossPackageWorkItemRecoveryResult,
} from './ontology-cross-package-contract';

export interface OntologyCrossPackageServiceDeps {
  readonly osdk: Pick<
    CanonicalOntologyOSDK,
    'queryFacts' | 'queryProjections' | 'resolveProjection' | 'submitAction'
  >;
  readonly contractPort: Pick<SolutionExecutionContractPort, 'load' | 'verifyIntegrity'>;
  readonly executionPort: Pick<CollaborationExecutionPort, 'start' | 'inspect'>;
  readonly taskBoard: Pick<
    ProjectTaskBoardService,
    'listProjectTasks' | 'getProjectTask' | 'requestProjectTaskAction'
  >;
  readonly workItemRecovery: OntologyCrossPackageWorkItemRecoveryPort;
}

interface SemanticContextData {
  readonly ontologyId: string;
  readonly ontologyVersion: string;
  readonly projections: readonly CanonicalContextProjectionRecord[];
  readonly projectTasks: ProjectTaskPage;
}

interface FactQueryData {
  readonly facts: readonly CanonicalFactRecord[];
}

interface ProjectionData {
  readonly projection: CanonicalContextProjectionRecord;
}

interface StartRequestEntry {
  readonly inputHash: string;
  readonly result: Promise<OntologyCrossPackageResponse>;
}

function issueFromCanonical(issue: CanonicalValidationIssue): OntologyCrossPackageIssue {
  return {
    code: issue.code,
    message: issue.message,
    field: issue.path,
  };
}

export class OntologyCrossPackageService {
  private readonly starts = new Map<string, StartRequestEntry>();

  constructor(private readonly deps: OntologyCrossPackageServiceDeps) {}

  async invoke(request: OntologyCrossPackageRequest): Promise<OntologyCrossPackageResponse> {
    switch (request.type) {
      case 'read_semantic_context':
        return this.readSemanticContext(request);
      case 'query_facts':
        return this.queryFacts(request);
      case 'query_projection':
        return this.queryProjection(request);
      case 'list_project_tasks':
        return this.listProjectTasks(request);
      case 'inspect_bound_task':
        return this.inspectBoundTask(request);
      case 'start_bound_task':
        return this.startBoundTask(request);
      case 'submit_action':
        return this.submitAction(request);
      case 'control_bound_task':
        return this.controlBoundTask(request);
    }
  }

  private async readSemanticContext(
    request: Extract<OntologyCrossPackageRequest, { type: 'read_semantic_context' }>
  ): Promise<OntologyCrossPackageResponse> {
    const projections = await this.deps.osdk.queryProjections({
      projectId: request.projectId,
      ontologyId: request.ontologyId,
      ontologyVersion: request.ontologyVersion,
      latestOnly: true,
    });
    if ('issues' in projections) {
      return this.failure(request, 'unavailable', 'ONTOLOGY_PROJECTION_UNAVAILABLE', projections.issues, false);
    }

    const projectTasks = await this.deps.taskBoard.listProjectTasks({
      projectId: request.projectId,
      limit: 50,
    });

    const data: SemanticContextData = {
      ontologyId: request.ontologyId,
      ontologyVersion: request.ontologyVersion,
      projections: projections.projections,
      projectTasks,
    };
    return this.success(request, data, { revision: projectTasks.revision });
  }

  private async queryFacts(
    request: Extract<OntologyCrossPackageRequest, { type: 'query_facts' }>
  ): Promise<OntologyCrossPackageResponse> {
    const result = await this.deps.osdk.queryFacts({
      projectId: request.projectId,
      ontologyId: request.ontologyId,
      ontologyVersion: request.ontologyVersion,
      conceptId: request.conceptId,
      factTypeId: request.factTypeId,
      latestOnly: true,
    });
    if ('issues' in result) {
      return this.failure(request, 'unavailable', 'ONTOLOGY_FACTS_UNAVAILABLE', result.issues, false);
    }

    const facts = request.limit ? result.facts.slice(0, request.limit) : result.facts;
    const data: FactQueryData = { facts };
    return this.success(request, data, {
      revision: facts.reduce((max, fact) => Math.max(max, fact.revision), 0),
    });
  }

  private async queryProjection(
    request: Extract<OntologyCrossPackageRequest, { type: 'query_projection' }>
  ): Promise<OntologyCrossPackageResponse> {
    const result = await this.deps.osdk.queryProjections({
      projectId: request.projectId,
      ontologyId: request.ontologyId,
      ontologyVersion: request.ontologyVersion,
      latestOnly: true,
    });
    if ('issues' in result) {
      return this.failure(request, 'unavailable', 'ONTOLOGY_PROJECTION_UNAVAILABLE', result.issues, false);
    }

    const projection = result.projections.find(({ id }) => id === request.projectionId);
    if (!projection) {
      return this.failure(request, 'validation', 'PROJECTION_NOT_FOUND', [
        { code: 'PROJECTION_NOT_FOUND', message: `Projection ${request.projectionId} was not found`, field: 'projectionId' },
      ], false);
    }

    const resolved = await this.deps.osdk.resolveProjection({
      projectId: request.projectId,
      ontologyId: request.ontologyId,
      ontologyVersion: request.ontologyVersion,
      projection,
    });
    if ('issues' in resolved) {
      return this.failure(request, 'unavailable', 'ONTOLOGY_PROJECTION_UNRESOLVED', resolved.issues, false);
    }

    const data: ProjectionData = { projection: resolved.projection };
    return this.success(request, data, { revision: projection.revision });
  }

  private async inspectBoundTask(
    request: Extract<OntologyCrossPackageRequest, { type: 'inspect_bound_task' }>
  ): Promise<OntologyCrossPackageResponse> {
    const task = await this.deps.taskBoard.getProjectTask(request.projectId, request.taskId);
    return this.success(request, task, { revision: task.task.revision });
  }

  private async listProjectTasks(
    request: Extract<OntologyCrossPackageRequest, { type: 'list_project_tasks' }>
  ): Promise<OntologyCrossPackageResponse> {
    const page = await this.deps.taskBoard.listProjectTasks({
      projectId: request.projectId,
      ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    });
    return this.success(request, page, {
      revision: page.revision,
      ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
    });
  }

  private async submitAction(
    request: Extract<OntologyCrossPackageRequest, { type: 'submit_action' }>
  ): Promise<OntologyCrossPackageResponse> {
    const result = await this.deps.osdk.submitAction({
      projectId: request.projectId,
      ontologyId: request.ontologyId,
      ontologyVersion: request.ontologyVersion,
      operationId: request.operationId,
      actionId: request.actionId,
      conceptId: request.conceptId,
      ...(request.currentStateId === undefined ? {} : { currentStateId: request.currentStateId }),
      permissions: request.permissions,
      inputFactRefs: request.inputFactRefs,
      outputs: request.outputs,
      expectedRevision: request.expectedRevision,
      audit: {
        actorId: request.actorId,
        requestId: request.requestId,
        runId: request.runId,
        workItemId: request.workItemId,
        attemptId: request.attemptId,
        leaseEpoch: request.leaseEpoch,
      },
    });
    if (result.ok === false) {
      return this.canonicalFailure(request, result.issues);
    }

    const recovered = await this.deps.workItemRecovery.reconcile({
      projectId: request.projectId,
      requestId: request.requestId,
      operationId: request.operationId,
      receipt: result.receipt,
      runId: request.runId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      leaseEpoch: request.leaseEpoch,
      expectedWorkItemRevision: request.expectedWorkItemRevision,
    });
    if (recovered.ok === false) {
      return this.recoveryFailure(request, recovered);
    }

    const data: OntologyCrossPackageActionData = {
      operationId: result.receipt.operationId,
      actionId: result.receipt.actionId,
      status: result.receipt.status,
      factRefs: result.receipt.factRefs,
      workItemRevision: recovered.workItemRevision,
      evidenceRevision: recovered.evidenceRevision,
    };
    return this.success(request, data, {
      revision: recovered.workItemRevision,
      receiptRef: result.receipt.operationId,
    });
  }

  private startBoundTask(
    request: Extract<OntologyCrossPackageRequest, { type: 'start_bound_task' }>
  ): Promise<OntologyCrossPackageResponse> {
    const key = `${request.projectId}:${request.requestId}`;
    const inputHash = JSON.stringify(request);
    const existing = this.starts.get(key);
    if (existing) {
      if (existing.inputHash !== inputHash) {
        return Promise.resolve(this.failure(request, 'conflict', 'REQUEST_ID_CONFLICT', [
          { code: 'REQUEST_ID_CONFLICT', message: 'Request ID was already used with different input', field: 'requestId' },
        ], false));
      }
      return existing.result;
    }
    const result = this.startRun(request).catch((error: unknown) => this.mutationError(request, error));
    this.starts.set(key, { inputHash, result });
    return result;
  }

  private async startRun(
    request: Extract<OntologyCrossPackageRequest, { type: 'start_bound_task' }>
  ): Promise<OntologyCrossPackageResponse> {
    try {
      const task = await this.deps.taskBoard.getProjectTask(request.projectId, request.parentTaskId);
      if (task.task.revision !== request.taskRevision) {
        return this.failure(request, 'conflict', 'TASK_REVISION_CONFLICT', [
          { code: 'TASK_REVISION_CONFLICT', message: 'Parent task revision does not match', field: 'taskRevision' },
        ], true, 'Reload the parent task and retry with its current revision.');
      }
      if (task.runId) {
        const run = await this.deps.executionPort.inspect(task.runId);
        return this.runMatchesRequest(run, request)
          ? this.runSuccess(request, run)
          : this.failure(request, 'conflict', 'RUN_SCOPE_MISMATCH', [
            { code: 'RUN_SCOPE_MISMATCH', message: 'The existing run does not match the requested binding', field: 'runId' },
          ], false);
      }

      const published = await this.deps.contractPort.load({
        projectId: request.projectId,
        solutionId: request.solutionId,
        solutionVersion: request.solutionVersion,
      });
      if (!published) {
        return this.failure(request, 'validation', 'CONTRACT_NOT_FOUND', [
          { code: 'CONTRACT_NOT_FOUND', message: 'Execution contract was not found', field: 'executionContractId' },
        ], false);
      }
      if (published.revocation) {
        return this.failure(request, 'validation', 'CONTRACT_REVOKED', [
          { code: 'CONTRACT_REVOKED', message: 'Execution contract is revoked', field: 'executionContractId' },
        ], false);
      }
      const { contract } = published;
      const scopeMatches = contract.projectId === request.projectId
        && contract.solutionId === request.solutionId
        && contract.solutionVersion === request.solutionVersion
        && contract.contractId === request.executionContractId
        && contract.contractHash === request.contractHash
        && contract.semanticContext.ontology.ontologyId === request.ontologyId
        && contract.semanticContext.ontology.ontologyVersion === request.ontologyVersion;
      if (!scopeMatches) {
        return this.failure(request, 'validation', 'CONTRACT_SCOPE_MISMATCH', [
          { code: 'CONTRACT_SCOPE_MISMATCH', message: 'Execution contract references do not match the request', field: 'executionContractId' },
        ], false);
      }
      const integrity = await this.deps.contractPort.verifyIntegrity(contract);
      if (integrity.valid !== true) {
        return this.failure(request, 'validation', 'CONTRACT_INTEGRITY_INVALID', [
          { code: 'CONTRACT_INTEGRITY_INVALID', message: 'Execution contract integrity check failed', field: 'contractHash' },
        ], false);
      }

      const run = await this.deps.executionPort.start({
        projectId: request.projectId,
        solutionId: request.solutionId,
        solutionVersion: request.solutionVersion,
        parentTaskId: request.parentTaskId,
        parentStepId: request.parentStepId,
        taskRevision: request.taskRevision,
        executionContractId: request.executionContractId,
        contractHash: request.contractHash,
        inputRefs: request.inputRefs,
      });
      return this.runSuccess(request, run);
    } catch (error) {
      return this.mutationError(request, error);
    }
  }

  private runMatchesRequest(
    run: CollaborationRunSnapshot,
    request: Extract<OntologyCrossPackageRequest, { type: 'start_bound_task' }>
  ): boolean {
    return run.projectId === request.projectId
      && run.binding.parentTaskId === request.parentTaskId
      && run.binding.parentStepId === request.parentStepId
      && run.binding.taskRevision === request.taskRevision
      && run.binding.solutionId === request.solutionId
      && run.binding.solutionVersion === request.solutionVersion
      && run.binding.executionContractId === request.executionContractId
      && run.binding.contractHash === request.contractHash;
  }

  private runSuccess(
    request: Extract<OntologyCrossPackageRequest, { type: 'start_bound_task' }>,
    run: CollaborationRunSnapshot
  ): OntologyCrossPackageResponse {
    const data: OntologyCrossPackageRunData = {
      runId: run.runId,
      status: run.status,
      revision: run.revision,
      workItemCount: run.workItems.length,
    };
    return this.success(request, data, { revision: run.revision, receiptRef: run.runId });
  }

  private async controlBoundTask(
    request: Extract<OntologyCrossPackageRequest, { type: 'control_bound_task' }>
  ): Promise<OntologyCrossPackageResponse> {
    try {
      const task = await this.deps.taskBoard.requestProjectTaskAction({
        projectId: request.projectId,
        taskId: request.taskId,
        action: request.action,
        requestId: request.requestId,
        expectedRevision: request.expectedRevision,
      });
      return this.success(request, task, { revision: task.task.revision });
    } catch (error) {
      return this.mutationError(request, error);
    }
  }

  private canonicalFailure(
    request: OntologyCrossPackageRequest,
    issues: readonly CanonicalValidationIssue[]
  ): OntologyCrossPackageResponse {
    const codes = new Set(issues.map(({ code }) => code));
    const category: OntologyCrossPackageErrorCategory = codes.has('PERMISSION_DENIED')
      ? 'authorization'
      : codes.has('OPERATION_CONFLICT') || codes.has('REVISION_CONFLICT')
        ? 'conflict'
        : 'validation';
    return this.failure(
      request,
      category,
      codes.has('OPERATION_CONFLICT') ? 'OPERATION_CONFLICT' : 'ACTION_REJECTED',
      issues.map(issueFromCanonical),
      category === 'conflict'
    );
  }

  private recoveryFailure(
    request: OntologyCrossPackageRequest,
    result: Extract<OntologyCrossPackageWorkItemRecoveryResult, { ok: false }>
  ): OntologyCrossPackageResponse {
    if (result.code === 'UNKNOWN_EXTERNAL_RECEIPT') {
      return this.failure(request, 'unavailable', 'MANUAL_RECONCILIATION_REQUIRED', [
        { code: result.code, message: result.message, field: 'receiptRef' },
      ], false, 'Do not retry automatically; reconcile the external receipt manually.');
    }
    return this.failure(request, 'conflict', result.code, [
      { code: result.code, message: result.message, field: 'workItemId' },
    ], false, 'Reload the current work item and retry with its active attempt.');
  }

  private mutationError(
    request: OntologyCrossPackageRequest,
    error: unknown
  ): OntologyCrossPackageResponse {
    if (error instanceof ProjectTaskRevisionConflictError) {
      return this.failure(request, 'conflict', 'REVISION_CONFLICT', [
        { code: 'REVISION_CONFLICT', message: 'Task revision does not match', field: 'expectedRevision' },
      ], true, 'Reload the task and retry with its current revision.');
    }
    if (error instanceof ProjectTaskRequestIdConflictError) {
      return this.failure(request, 'conflict', 'REQUEST_ID_CONFLICT', [
        { code: 'REQUEST_ID_CONFLICT', message: 'Request ID was already used with different input', field: 'requestId' },
      ], false);
    }
    if (error instanceof TypeError) {
      return this.failure(request, 'validation', 'INVALID_REQUEST', [
        { code: 'INVALID_REQUEST', message: 'Request fields are invalid', field: 'request' },
      ], false);
    }
    return this.failure(request, 'internal', 'MUTATION_FAILED', [
      { code: 'MUTATION_FAILED', message: 'The mutation could not be completed safely', field: 'requestId' },
    ], false, 'Inspect the authoritative ledgers before retrying.');
  }

  private success<TData>(
    request: OntologyCrossPackageRequest,
    data: TData,
    metadata: { readonly revision?: number; readonly cursor?: string; readonly receiptRef?: string } = {}
  ): OntologyCrossPackageResponse {
    return {
      ok: true,
      requestId: request.requestId,
      data,
      ...(metadata.revision === undefined ? {} : { revision: metadata.revision }),
      ...(metadata.cursor === undefined ? {} : { cursor: metadata.cursor }),
      ...(metadata.receiptRef === undefined ? {} : { receiptRef: metadata.receiptRef }),
    };
  }

  private failure(
    request: OntologyCrossPackageRequest,
    category: OntologyCrossPackageErrorCategory,
    code: string,
    issues: readonly OntologyCrossPackageIssue[],
    retryable: boolean,
    remediation = 'Check the request scope and retry with current references.'
  ): OntologyCrossPackageResponse {
    return {
      ok: false,
      requestId: request.requestId,
      error: {
        category,
        code,
        issues,
        retryable,
        remediation,
      },
    };
  }
}

export type { OntologyCrossPackageIssue, OntologyCrossPackageErrorCategory };
