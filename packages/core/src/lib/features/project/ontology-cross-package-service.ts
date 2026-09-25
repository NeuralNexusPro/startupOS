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
import { CollaborationWorkItemHandoffError } from '../../../modules/collaboration-runtime/facade';
import {
  AgentTaskRuntimeConflictError,
  AgentTaskRuntimeProtocolError,
  type AgentTaskProjectMetadataMutationReceiptV1,
  type AgentTaskProjectPriorityV1,
} from '../../integrations/pi-agent/task-runtime';
import type {
  DesignGap,
  SolutionExecutionContractCatalogPort,
  SolutionExecutionContractPort,
} from '../solution';
import {
  ProjectTaskRequestIdConflictError,
  ProjectTaskRevisionConflictError,
  ProjectTaskTransitionRejectedError,
  type ProjectTaskBoardService,
  type ProjectTaskEvidenceGap,
  type ProjectTaskPage,
  type ProjectTaskSummary,
} from './task-board';
import {
  ProjectTaskRuntimeRecoveryConflictError,
  ProjectTaskSourceUnavailableError,
} from './project-task-source';
import type {
  OntologyCrossPackageActionData,
  OntologyCrossPackageErrorCategory,
  OntologyCrossPackageIssue,
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
  OntologyCrossPackageRunData,
  OntologyApprovedTaskTemplateCatalogData,
  OntologyCrossPackageTaskPriorityData,
  OntologyCrossPackageWorkItemHandoffData,
  OntologyCrossPackageWorkItemRecoveryPort,
  OntologyCrossPackageWorkItemRecoveryResult,
} from './ontology-cross-package-contract';
import {
  ProjectTaskCreationError,
  type ApprovedProjectTaskCreationService,
} from './project-task-creation';
import {
  PROJECT_ACCESS_DENIED_CODE,
  ProjectAccessDeniedError,
  isProjectAccessAuthorized,
  projectAccessCapabilityForRequest,
  type ProjectAccessPort,
  type ProjectTaskSubscription,
  type ProjectTaskSubscriptionInput,
  type ProjectTaskSubscriptionObserver,
  type ProjectTaskSubscriptionPort,
} from './project-task-access-subscription';

export interface ProjectTaskPriorityMutationInput {
  readonly projectId: string;
  readonly taskId: string;
  readonly requestId: string;
  readonly priority: AgentTaskProjectPriorityV1;
  readonly expectedRevision: number;
  readonly expectedCursor: string | null;
  readonly bridgeEpoch: number;
}

export interface ProjectTaskPriorityMutationPort {
  updateProjectTaskPriority(
    input: ProjectTaskPriorityMutationInput,
  ): Promise<AgentTaskProjectMetadataMutationReceiptV1>;
}

export interface OntologyCrossPackageServiceDeps {
  readonly projectAccess?: ProjectAccessPort;
  readonly osdk: Pick<
    CanonicalOntologyOSDK,
    'queryFacts' | 'queryProjections' | 'resolveProjection' | 'submitAction'
  >;
  readonly contractPort: Pick<SolutionExecutionContractPort, 'load' | 'verifyIntegrity'>;
  readonly executionPort: Pick<
    CollaborationExecutionPort,
    'start' | 'inspect' | 'listWorkItemHandoffCandidates' | 'handoffWorkItem'
  >;
  readonly taskBoard: Pick<
    ProjectTaskBoardService,
    | 'listProjectTasks'
    | 'getProjectTask'
    | 'requestProjectTaskAction'
    | 'requestProjectTaskTransition'
  >;
  readonly workItemRecovery: OntologyCrossPackageWorkItemRecoveryPort;
  readonly taskPriority: ProjectTaskPriorityMutationPort;
  readonly contractCatalog?: Pick<SolutionExecutionContractCatalogPort, 'listProject'>;
  readonly taskCreation?: Pick<ApprovedProjectTaskCreationService, 'create'>;
  readonly taskSubscriptions?: ProjectTaskSubscriptionPort;
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
    const authorized = await isProjectAccessAuthorized(this.deps.projectAccess, {
      actorId: request.actorId,
      projectId: request.projectId,
      capability: projectAccessCapabilityForRequest(request),
    });
    if (!authorized) return this.accessDenied(request);

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
      case 'transition_project_task':
        return this.transitionProjectTask(request);
      case 'update_project_task_priority':
        return this.updateProjectTaskPriority(request);
      case 'list_work_item_handoff_candidates':
        return this.listWorkItemHandoffCandidates(request);
      case 'handoff_work_item':
        return this.handoffWorkItem(request);
      case 'list_approved_task_templates':
        return this.listApprovedTaskTemplates(request);
      case 'create_approved_project_task':
        return this.createApprovedProjectTask(request);
    }
  }

  async subscribeProjectTasks(
    input: ProjectTaskSubscriptionInput,
    observer: ProjectTaskSubscriptionObserver,
  ): Promise<ProjectTaskSubscription> {
    const authorized = await isProjectAccessAuthorized(this.deps.projectAccess, {
      actorId: input.actorId,
      projectId: input.projectId,
      capability: 'subscribe',
    });
    if (!authorized) throw new ProjectAccessDeniedError();
    if (!this.deps.taskSubscriptions) {
      throw new Error('Project task subscriptions are unavailable');
    }
    return this.deps.taskSubscriptions.subscribeProjectTasks(input, observer);
  }

  private accessDenied(request: OntologyCrossPackageRequest): OntologyCrossPackageResponse {
    return this.failure(request, 'authorization', PROJECT_ACCESS_DENIED_CODE, [{
      code: PROJECT_ACCESS_DENIED_CODE,
      message: 'Project access is denied',
    }], false, 'Request access to the project before retrying.');
  }

  private async listApprovedTaskTemplates(
    request: Extract<OntologyCrossPackageRequest, { type: 'list_approved_task_templates' }>
  ): Promise<OntologyCrossPackageResponse> {
    if (!this.deps.contractCatalog) {
      return this.failure(request, 'unavailable', 'TASK_TEMPLATE_CATALOG_UNAVAILABLE', [{
        code: 'TASK_TEMPLATE_CATALOG_UNAVAILABLE',
        message: 'Published task template catalog is not available',
      }], true, 'Retry after the project contract catalog is available.');
    }
    try {
      const published = await this.deps.contractCatalog.listProject(request.projectId);
      const contracts: OntologyApprovedTaskTemplateCatalogData['contracts'][number][] = [];
      for (const item of published) {
        if (item.revocation || item.contract.status !== 'approved') {
          continue;
        }
        const integrity = await this.deps.contractPort.verifyIntegrity(item.contract);
        if (!integrity.valid || item.contract.semanticContext.taskTemplates.length === 0) {
          continue;
        }
        const { contract } = item;
        contracts.push({
          solutionId: contract.solutionId,
          solutionVersion: contract.solutionVersion,
          contractId: contract.contractId,
          contractHash: contract.contractHash,
          ontologyId: contract.semanticContext.ontology.ontologyId,
          ontologyVersion: contract.semanticContext.ontology.ontologyVersion,
          objectSlots: contract.semanticContext.objectSlots,
          factPolicies: contract.semanticContext.factPolicies,
          taskTemplates: contract.semanticContext.taskTemplates.map((template) => ({
            id: template.id,
            designNodeId: template.designNodeId,
            objective: template.objective,
            candidateAgentIds: template.candidateAgentIds,
            candidateSkillIds: template.candidateSkillIds,
          })),
        });
      }
      contracts.sort((left, right) => left.solutionId.localeCompare(right.solutionId)
        || left.solutionVersion.localeCompare(right.solutionVersion)
        || left.contractId.localeCompare(right.contractId));
      return this.success(request, { contracts } satisfies OntologyApprovedTaskTemplateCatalogData);
    } catch {
      return this.failure(request, 'unavailable', 'TASK_TEMPLATE_CATALOG_UNAVAILABLE', [{
        code: 'TASK_TEMPLATE_CATALOG_UNAVAILABLE',
        message: 'Published task template catalog could not be read safely',
      }], true, 'Retry after checking the project contract catalog.');
    }
  }

  private async createApprovedProjectTask(
    request: Extract<OntologyCrossPackageRequest, { type: 'create_approved_project_task' }>
  ): Promise<OntologyCrossPackageResponse> {
    if (!this.deps.taskCreation) {
      return this.failure(request, 'unavailable', 'TASK_CREATION_UNAVAILABLE', [{
        code: 'TASK_CREATION_UNAVAILABLE',
        message: 'Approved project task creation is not available',
      }], true, 'Retry after the project task runtime is available.');
    }
    try {
      const result = await this.deps.taskCreation.create({
        projectId: request.projectId,
        solutionId: request.solutionId,
        solutionVersion: request.solutionVersion,
        contractId: request.contractId,
        contractHash: request.contractHash,
        taskTemplateId: request.taskTemplateId,
        objective: request.objective,
        semanticInputs: request.semanticInputs,
        requestId: request.requestId,
      });
      if (result.ok === false) {
        return this.failure(request, 'validation', 'PROJECT_TASK_DESIGN_GAP', result.gaps.map((gap) => ({
          code: gap.code,
          message: gap.message,
          ...(gap.path === undefined ? {} : { field: gap.path }),
        })), false, 'Resolve the reported solution design gaps before creating the task.', {
          designGaps: result.gaps,
        });
      }
      return this.success(request, result.receipt, {
        revision: result.receipt.task.task.revision,
        receiptRef: result.receipt.run.runId,
      });
    } catch (error) {
      return this.taskCreationFailure(request, error);
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
        ...(request.parentSessionId === undefined
          ? {}
          : { parentSessionId: request.parentSessionId }),
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

  private async transitionProjectTask(
    request: Extract<OntologyCrossPackageRequest, { type: 'transition_project_task' }>
  ): Promise<OntologyCrossPackageResponse> {
    try {
      const task = await this.deps.taskBoard.requestProjectTaskTransition({
        projectId: request.projectId,
        taskId: request.taskId,
        targetStatus: request.targetStatus,
        requestId: request.requestId,
        expectedRevision: request.expectedRevision,
        ...(request.expectedLeaseEpoch === undefined
          ? {}
          : { expectedLeaseEpoch: request.expectedLeaseEpoch }),
        ...(request.reason === undefined ? {} : { reason: request.reason }),
      });
      return this.success(request, task, { revision: task.task.revision });
    } catch (error) {
      return this.mutationError(request, error);
    }
  }

  private async updateProjectTaskPriority(
    request: Extract<OntologyCrossPackageRequest, { type: 'update_project_task_priority' }>
  ): Promise<OntologyCrossPackageResponse> {
    try {
      const receipt = await this.deps.taskPriority.updateProjectTaskPriority({
        projectId: request.projectId,
        taskId: request.taskId,
        requestId: request.requestId,
        priority: request.priority,
        expectedRevision: request.expectedRevision,
        expectedCursor: request.expectedCursor,
        bridgeEpoch: request.bridgeEpoch,
      });
      const task = await this.deps.taskBoard.getProjectTask(request.projectId, request.taskId);
      const data: OntologyCrossPackageTaskPriorityData = { receipt, task };
      return this.success(request, data, {
        revision: task.task.revision,
        receiptRef: receipt.requestId,
      });
    } catch (error) {
      return this.mutationError(request, error);
    }
  }

  private async listWorkItemHandoffCandidates(
    request: Extract<OntologyCrossPackageRequest, { type: 'list_work_item_handoff_candidates' }>
  ): Promise<OntologyCrossPackageResponse> {
    try {
      const candidates = await this.deps.executionPort.listWorkItemHandoffCandidates({
        projectId: request.projectId,
        runId: request.runId,
        workItemId: request.workItemId,
      });
      const snapshot = await this.deps.executionPort.inspect(request.runId);
      if (snapshot.projectId !== request.projectId) {
        throw new Error('PROJECT_SCOPE_MISMATCH');
      }
      const workItem = snapshot.workItems.find(({ id }) => id === request.workItemId);
      if (!workItem) throw new Error('WORK_ITEM_NOT_FOUND');
      return this.success(request, {
        candidates,
        authority: {
          runRevision: snapshot.revision,
          workItemRevision: workItem.revision,
          leaseEpoch: workItem.leaseEpoch,
          assignedAgentId: workItem.assignedAgentId,
        },
      });
    } catch (error) {
      return this.mutationError(request, error);
    }
  }

  private async handoffWorkItem(
    request: Extract<OntologyCrossPackageRequest, { type: 'handoff_work_item' }>
  ): Promise<OntologyCrossPackageResponse> {
    try {
      const result = await this.deps.executionPort.handoffWorkItem({
        projectId: request.projectId,
        runId: request.runId,
        workItemId: request.workItemId,
        targetAgentId: request.targetAgentId,
        requestId: request.requestId,
        expectedRunRevision: request.expectedRunRevision,
        expectedWorkItemRevision: request.expectedWorkItemRevision,
        expectedLeaseEpoch: request.expectedLeaseEpoch,
      });
      const taskId = result.snapshot.binding.parentTaskId;
      const task = await this.deps.taskBoard.getProjectTask(request.projectId, taskId);
      const data: OntologyCrossPackageWorkItemHandoffData = {
        receipt: result.receipt,
        task,
      };
      return this.success(request, data, {
        revision: task.task.revision,
        receiptRef: result.receipt.receiptId,
      });
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
    if (error instanceof AgentTaskRuntimeConflictError) {
      return this.failure(request, 'conflict', 'TASK_METADATA_CONFLICT', [
        { code: 'TASK_METADATA_CONFLICT', message: error.message, field: 'expectedRevision' },
      ], true, 'Reload the task and retry with its current revision, cursor and epoch.');
    }
    if (error instanceof AgentTaskRuntimeProtocolError) {
      return this.failure(request, 'validation', 'TASK_METADATA_REJECTED', [
        { code: 'TASK_METADATA_REJECTED', message: error.message, field: 'priority' },
      ], false, 'Correct the priority request before retrying.');
    }
    if (error instanceof CollaborationWorkItemHandoffError) {
      const conflict = error.code === 'HANDOFF_REVISION_CONFLICT'
        || error.code === 'HANDOFF_LEASE_CONFLICT'
        || error.code === 'HANDOFF_REQUEST_ID_CONFLICT'
        || error.code === 'STALE_LEASE_EPOCH';
      return this.failure(
        request,
        conflict ? 'conflict' : error.code === 'HANDOFF_TARGET_UNAUTHORIZED'
          ? 'authorization'
          : 'validation',
        error.code,
        [{ code: error.code, message: error.message, field: 'workItemId' }],
        conflict,
        conflict
          ? 'Reload the run and work item before retrying.'
          : 'Choose an authorized Agent from the current frozen contract.',
      );
    }
    if (error instanceof ProjectTaskRuntimeRecoveryConflictError) {
      return this.failure(request, 'conflict', error.code, [
        { code: error.code, message: error.message, field: 'taskId' },
      ], true, 'Reload the task and retry against its recovered runtime.');
    }
    if (error instanceof ProjectTaskSourceUnavailableError) {
      return this.failure(request, 'unavailable', error.code, [
        { code: error.code, message: error.message, field: 'taskId' },
      ], true, 'Retry after the original Task Runtime is available.');
    }
    if (error instanceof ProjectTaskRevisionConflictError) {
      return this.failure(request, 'conflict', 'REVISION_CONFLICT', [
        { code: 'REVISION_CONFLICT', message: 'Task revision does not match', field: 'expectedRevision' },
      ], true, 'Reload the task and retry with its current revision.', {
        ...(error.authoritative === undefined ? {} : { authoritative: error.authoritative }),
      });
    }
    if (error instanceof ProjectTaskRequestIdConflictError) {
      return this.failure(request, 'conflict', 'REQUEST_ID_CONFLICT', [
        { code: 'REQUEST_ID_CONFLICT', message: 'Request ID was already used with different input', field: 'requestId' },
      ], false);
    }
    if (error instanceof ProjectTaskTransitionRejectedError) {
      const conflict = error.code === 'LEASE_CONFLICT';
      return this.failure(
        request,
        conflict ? 'conflict' : 'validation',
        error.code,
        error.gaps.length > 0
          ? error.gaps.map((gap) => ({
              code: `PROJECT_TASK_${gap.kind.toUpperCase()}_GAP`,
              message: gap.message,
              field: `task.${gap.kind}.${gap.id}`,
            }))
          : [{ code: error.code, message: error.message, field: 'targetStatus' }],
        conflict,
        conflict
          ? 'Reload the task and retry with its current lease.'
          : 'Resolve the reported task gaps or choose an available transition.',
        { authoritative: error.authoritative, gaps: error.gaps },
      );
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

  private taskCreationFailure(
    request: OntologyCrossPackageRequest,
    error: unknown
  ): OntologyCrossPackageResponse {
    if (error instanceof ProjectTaskCreationError) {
      if (error.code === 'REQUEST_ID_CONFLICT') {
        return this.failure(request, 'conflict', error.code, [{
          code: error.code,
          message: 'Request ID was already used with different task creation input',
          field: 'requestId',
        }], false, 'Use the original input or a new requestId.');
      }
      if (error.code === 'INVALID_REQUEST') {
        return this.failure(request, 'validation', error.code, [{
          code: error.code,
          message: 'Task creation request fields are invalid',
          field: 'request',
        }], false, 'Correct the task creation request and retry.');
      }
    }
    return this.failure(request, 'internal', 'TASK_CREATION_FAILED', [{
      code: 'TASK_CREATION_FAILED',
      message: 'The task creation operation could not be completed safely',
      field: 'requestId',
    }], false, 'Inspect the authoritative task creation ledger before retrying.');
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
    remediation = 'Check the request scope and retry with current references.',
    taskContext: {
      readonly authoritative?: ProjectTaskSummary;
      readonly gaps?: readonly ProjectTaskEvidenceGap[];
      readonly designGaps?: readonly DesignGap[];
    } = {},
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
        ...(taskContext.authoritative === undefined
          ? {}
          : { authoritative: taskContext.authoritative }),
        ...(taskContext.gaps === undefined ? {} : { gaps: taskContext.gaps }),
        ...(taskContext.designGaps === undefined
          ? {}
          : { designGaps: taskContext.designGaps }),
      },
    };
  }
}

export type { OntologyCrossPackageIssue, OntologyCrossPackageErrorCategory };
