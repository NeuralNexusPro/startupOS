import type {
  CanonicalContextProjectionRecord,
  CanonicalFactRecord,
  CanonicalOntologyOSDK,
  CanonicalValidationIssue,
} from '../ontology';
import type { ProjectTaskBoardService, ProjectTaskPage } from './task-board';
import type {
  OntologyCrossPackageErrorCategory,
  OntologyCrossPackageIssue,
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
} from './ontology-cross-package-contract';

export interface OntologyCrossPackageServiceDeps {
  readonly osdk: Pick<CanonicalOntologyOSDK, 'queryFacts' | 'queryProjections' | 'resolveProjection'>;
  readonly taskBoard: Pick<ProjectTaskBoardService, 'listProjectTasks' | 'getProjectTask'>;
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

function issueFromCanonical(issue: CanonicalValidationIssue): OntologyCrossPackageIssue {
  return {
    code: issue.code,
    message: issue.message,
    field: issue.path,
  };
}

export class OntologyCrossPackageService {
  constructor(private readonly deps: OntologyCrossPackageServiceDeps) {}

  async invoke(request: OntologyCrossPackageRequest): Promise<OntologyCrossPackageResponse> {
    switch (request.type) {
      case 'read_semantic_context':
        return this.readSemanticContext(request);
      case 'query_facts':
        return this.queryFacts(request);
      case 'query_projection':
        return this.queryProjection(request);
      case 'inspect_bound_task':
        return this.inspectBoundTask(request);
      case 'submit_action':
      case 'start_bound_task':
      case 'control_bound_task':
        return this.notReady(request);
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

  private notReady(request: OntologyCrossPackageRequest): OntologyCrossPackageResponse {
    return this.failure(request, 'unavailable', 'CAPABILITY_NOT_READY', [
      { code: 'CAPABILITY_NOT_READY', message: `${request.type} is not implemented yet`, field: 'type' },
    ], false);
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
