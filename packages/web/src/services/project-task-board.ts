import type { IpcResponse } from '@originos/core/lib/integrations/electron';
import {
  ONTOLOGY_CROSS_PACKAGE_CONTRACT_VERSION,
  type AgentTaskProjectPriorityV1,
  type OntologyCrossPackageHandoffCandidatesData,
  type OntologyCrossPackageError,
  type OntologyCrossPackageRequest,
  type OntologyCrossPackageResponse,
  type OntologyCrossPackageTaskPriorityData,
  type OntologyCrossPackageWorkItemHandoffData,
  type OntologyApprovedProjectTaskData,
  type OntologyApprovedTaskTemplateCatalogData,
  type ProjectTaskSemanticInput,
  type ProjectTaskAction,
  type ProjectTaskBoardStatus,
  type ProjectTaskDetail,
  type ProjectTaskEvidenceGap,
  type ProjectTaskPage,
  type ProjectTaskSubscriptionEvent,
  type ProjectTaskSubscriptionTermination,
  type ProjectTaskSummary,
} from '@originos/core/lib/features/project/client';
import type { DesignGap } from '@originos/core/lib/features/solution/types';
import { isElectron } from '@originos/core/lib/integrations/electron';

const TASK_BOARD_ACTOR_ID = 'project-task-board';
const MAX_PAGE_SIZE = 50;

export type ProjectTaskBoardServiceErrorKind = 'unavailable' | 'conflict' | 'rejected';

export interface ProjectTaskBoardServiceError {
  readonly kind: ProjectTaskBoardServiceErrorKind;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly issues: readonly { readonly code: string; readonly message: string; readonly field?: string }[];
  readonly authoritative?: ProjectTaskSummary;
  readonly gaps: readonly ProjectTaskEvidenceGap[];
  readonly designGaps: readonly DesignGap[];
}

export type ProjectTaskBoardServiceResult<T> =
  | { readonly ok: true; readonly data: T; readonly revision?: number; readonly cursor?: string }
  | { readonly ok: false; readonly error: ProjectTaskBoardServiceError };

export interface ListProjectTaskBoardInput {
  readonly projectId: string;
  readonly requestId: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface GetProjectTaskBoardInput {
  readonly projectId: string;
  readonly taskId: string;
  readonly requestId: string;
}

export interface ControlProjectTaskBoardInput {
  readonly projectId: string;
  readonly taskId: string;
  readonly action: ProjectTaskAction;
  readonly requestId: string;
  readonly expectedRevision: number;
}

export interface TransitionProjectTaskBoardInput {
  readonly projectId: string;
  readonly taskId: string;
  readonly targetStatus: ProjectTaskBoardStatus;
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly expectedLeaseEpoch?: number;
  readonly reason?: string;
}

export interface UpdateProjectTaskPriorityInput {
  readonly projectId: string;
  readonly taskId: string;
  readonly requestId: string;
  readonly priority: AgentTaskProjectPriorityV1;
  readonly expectedRevision: number;
  readonly expectedCursor: string | null;
  readonly bridgeEpoch: number;
}

export interface ListWorkItemHandoffCandidatesInput {
  readonly projectId: string;
  readonly runId: string;
  readonly workItemId: string;
  readonly requestId: string;
}

export interface HandoffWorkItemInput extends ListWorkItemHandoffCandidatesInput {
  readonly targetAgentId: string;
  readonly expectedRunRevision: number;
  readonly expectedWorkItemRevision: number;
  readonly expectedLeaseEpoch: number;
}

export interface ListApprovedTaskTemplatesInput {
  readonly projectId: string;
  readonly requestId: string;
}

export interface CreateProjectTaskFromTemplateInput {
  readonly projectId: string;
  readonly requestId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly taskTemplateId: string;
  readonly objective: string;
  readonly semanticInputs: readonly ProjectTaskSemanticInput[];
}

interface OntologyCrossPackageBridge {
  readonly ontologyCrossPackage: {
    invoke(request: unknown): Promise<IpcResponse<OntologyCrossPackageResponse>>;
    subscribeProjectTasks?(
      projectId: string,
      listener: (
        event: ProjectTaskSubscriptionEvent | ProjectTaskSubscriptionTermination
      ) => void
    ): () => void;
  };
}

function unavailable(
  code: string,
  message: string,
  retryable = false
): ProjectTaskBoardServiceResult<never> {
  return {
    ok: false,
    error: { kind: 'unavailable', code, message, retryable, issues: [], gaps: [], designGaps: [] },
  };
}

function rejected(code: string, message: string): ProjectTaskBoardServiceResult<never> {
  return {
    ok: false,
    error: { kind: 'rejected', code, message, retryable: false, issues: [], gaps: [], designGaps: [] },
  };
}

function requiredIdentifier(value: string, field: string): ProjectTaskBoardServiceResult<never> | undefined {
  if (value.trim().length === 0) {
    return rejected('TASK_BOARD_INVALID_REQUEST', `${field} 不能为空`);
  }
  return undefined;
}

function validPageInput(input: ListProjectTaskBoardInput): ProjectTaskBoardServiceResult<never> | undefined {
  return requiredIdentifier(input.projectId, 'projectId')
    ?? requiredIdentifier(input.requestId, 'requestId')
    ?? (input.cursor !== undefined && input.cursor.trim().length === 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'cursor 不能为空')
      : undefined)
    ?? (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1)
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'limit 必须是正整数')
      : undefined);
}

function validTaskInput(input: GetProjectTaskBoardInput): ProjectTaskBoardServiceResult<never> | undefined {
  return requiredIdentifier(input.projectId, 'projectId')
    ?? requiredIdentifier(input.requestId, 'requestId')
    ?? requiredIdentifier(input.taskId, 'taskId');
}

function validControlInput(input: ControlProjectTaskBoardInput): ProjectTaskBoardServiceResult<never> | undefined {
  return validTaskInput(input)
    ?? (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'expectedRevision 必须是非负整数')
      : undefined);
}

function validTransitionInput(
  input: TransitionProjectTaskBoardInput
): ProjectTaskBoardServiceResult<never> | undefined {
  return validTaskInput(input)
    ?? (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'expectedRevision 必须是非负整数')
      : undefined)
    ?? (input.expectedLeaseEpoch !== undefined
      && (!Number.isSafeInteger(input.expectedLeaseEpoch) || input.expectedLeaseEpoch < 0)
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'expectedLeaseEpoch 必须是非负整数')
      : undefined)
    ?? (input.reason !== undefined && input.reason.trim().length === 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'reason 不能为空')
      : undefined);
}

function validPriorityInput(
  input: UpdateProjectTaskPriorityInput
): ProjectTaskBoardServiceResult<never> | undefined {
  return validTaskInput(input)
    ?? (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'expectedRevision 必须是非负整数')
      : undefined)
    ?? (input.expectedCursor !== null && input.expectedCursor.trim().length === 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'expectedCursor 不能为空字符串')
      : undefined)
    ?? (!Number.isSafeInteger(input.bridgeEpoch) || input.bridgeEpoch < 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'bridgeEpoch 必须是非负整数')
      : undefined);
}

function validHandoffBaseInput(
  input: ListWorkItemHandoffCandidatesInput
): ProjectTaskBoardServiceResult<never> | undefined {
  return requiredIdentifier(input.projectId, 'projectId')
    ?? requiredIdentifier(input.requestId, 'requestId')
    ?? requiredIdentifier(input.runId, 'runId')
    ?? requiredIdentifier(input.workItemId, 'workItemId');
}

function validHandoffInput(
  input: HandoffWorkItemInput
): ProjectTaskBoardServiceResult<never> | undefined {
  return validHandoffBaseInput(input)
    ?? requiredIdentifier(input.targetAgentId, 'targetAgentId')
    ?? (!Number.isSafeInteger(input.expectedRunRevision) || input.expectedRunRevision < 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'expectedRunRevision 必须是非负整数')
      : undefined)
    ?? (!Number.isSafeInteger(input.expectedWorkItemRevision) || input.expectedWorkItemRevision < 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'expectedWorkItemRevision 必须是非负整数')
      : undefined)
    ?? (!Number.isSafeInteger(input.expectedLeaseEpoch) || input.expectedLeaseEpoch < 0
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'expectedLeaseEpoch 必须是非负整数')
      : undefined);
}

function hasBridge(value: unknown): value is OntologyCrossPackageBridge {
  if (!value || typeof value !== 'object') return false;
  const bridge = value as { ontologyCrossPackage?: { invoke?: unknown } };
  return typeof bridge.ontologyCrossPackage?.invoke === 'function';
}

function getBridge(): OntologyCrossPackageBridge | undefined {
  if (typeof window === 'undefined' || !isElectron()) return undefined;
  const electron = (window as Window & { electron?: unknown }).electron;
  return hasBridge(electron) ? electron : undefined;
}

function errorFromCrossPackage(error: OntologyCrossPackageError): ProjectTaskBoardServiceError {
  const kind: ProjectTaskBoardServiceErrorKind = error.category === 'conflict'
    ? 'conflict'
    : error.category === 'unavailable' || error.category === 'internal'
      ? 'unavailable'
      : 'rejected';
  return {
    kind,
    code: error.code,
    message: error.remediation || error.issues[0]?.message || '任务请求被拒绝',
    retryable: error.retryable,
    issues: error.issues,
    ...(error.authoritative === undefined ? {} : { authoritative: error.authoritative }),
    gaps: error.gaps ?? [],
    designGaps: error.designGaps ?? [],
  };
}

function errorFromIpc(response: IpcResponse<OntologyCrossPackageResponse>): ProjectTaskBoardServiceError {
  const details = response.error?.details;
  if (details && typeof details === 'object' && 'ok' in details && details.ok === false
    && 'error' in details && details.error && typeof details.error === 'object') {
    return errorFromCrossPackage(details.error as OntologyCrossPackageError);
  }
  return {
    kind: response.error?.code === 'CAPABILITY_NOT_READY' ? 'unavailable' : 'rejected',
    code: response.error?.code ?? 'TASK_BOARD_REQUEST_REJECTED',
    message: response.error?.message ?? '任务请求被拒绝',
    retryable: response.error?.code === 'CAPABILITY_NOT_READY',
    issues: [],
    gaps: [],
    designGaps: [],
  };
}

function resultFromResponse<T>(
  response: IpcResponse<OntologyCrossPackageResponse>,
  isData: (data: unknown) => data is T
): ProjectTaskBoardServiceResult<T> {
  if (!response.success || !response.data) {
    return { ok: false, error: errorFromIpc(response) };
  }
  if (!response.data.ok) {
    return { ok: false, error: errorFromCrossPackage(response.data.error) };
  }
  if (!isData(response.data.data)) {
    return unavailable('TASK_BOARD_INVALID_RESPONSE', '桌面任务服务返回了无效数据', true);
  }
  return {
    ok: true,
    data: response.data.data,
    ...(response.data.revision === undefined ? {} : { revision: response.data.revision }),
    ...(response.data.cursor === undefined ? {} : { cursor: response.data.cursor }),
  };
}

function isTaskPage(value: unknown): value is ProjectTaskPage {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
    && typeof (value as { revision?: unknown }).revision === 'number';
}

function isTaskDetail(value: unknown): value is ProjectTaskDetail {
  return Boolean(value) && typeof value === 'object'
    && typeof (value as { taskId?: unknown }).taskId === 'string'
    && typeof (value as { revision?: unknown }).revision === 'number'
    && Array.isArray((value as { workItems?: unknown }).workItems);
}

function isTaskPriorityData(value: unknown): value is OntologyCrossPackageTaskPriorityData {
  return Boolean(value) && typeof value === 'object'
    && isTaskDetail((value as { task?: unknown }).task)
    && Boolean((value as { receipt?: unknown }).receipt);
}

function isHandoffCandidatesData(
  value: unknown
): value is OntologyCrossPackageHandoffCandidatesData {
  if (!value || typeof value !== 'object'
    || !Array.isArray((value as { candidates?: unknown }).candidates)) return false;
  const authority = (value as { authority?: unknown }).authority;
  if (!authority || typeof authority !== 'object'
    || typeof (authority as { runRevision?: unknown }).runRevision !== 'number'
    || typeof (authority as { workItemRevision?: unknown }).workItemRevision !== 'number'
    || typeof (authority as { leaseEpoch?: unknown }).leaseEpoch !== 'number'
    || typeof (authority as { assignedAgentId?: unknown }).assignedAgentId !== 'string') return false;
  return (value as { candidates: unknown[] }).candidates.every((candidate) =>
    Boolean(candidate) && typeof candidate === 'object'
    && typeof (candidate as { agentId?: unknown }).agentId === 'string'
    && typeof (candidate as { displayName?: unknown }).displayName === 'string'
    && Array.isArray((candidate as { permissions?: unknown }).permissions)
  );
}

function isWorkItemHandoffData(
  value: unknown
): value is OntologyCrossPackageWorkItemHandoffData {
  return Boolean(value) && typeof value === 'object'
    && isTaskDetail((value as { task?: unknown }).task)
    && Boolean((value as { receipt?: unknown }).receipt);
}

function isTemplateCatalog(value: unknown): value is OntologyApprovedTaskTemplateCatalogData {
  return Boolean(value) && typeof value === 'object'
    && Array.isArray((value as { contracts?: unknown }).contracts);
}

function isCreatedTask(value: unknown): value is OntologyApprovedProjectTaskData {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const data = value as {
    task?: { taskId?: unknown; revision?: unknown };
    run?: { runId?: unknown };
    binding?: { parentTaskId?: unknown; runId?: unknown };
    contractId?: unknown;
    contractHash?: unknown;
    taskTemplateId?: unknown;
  };
  return typeof data.task?.taskId === 'string'
    && typeof data.task.revision === 'number'
    && typeof data.run?.runId === 'string'
    && typeof data.binding?.parentTaskId === 'string'
    && typeof data.binding.runId === 'string'
    && typeof data.contractId === 'string'
    && typeof data.contractHash === 'string'
    && typeof data.taskTemplateId === 'string';
}

async function invoke<T>(
  request: OntologyCrossPackageRequest,
  isData: (data: unknown) => data is T
): Promise<ProjectTaskBoardServiceResult<T>> {
  const bridge = getBridge();
  if (!bridge) {
    return unavailable('DESKTOP_TASK_BOARD_UNAVAILABLE', '任务看板仅可在 OriginOS 桌面应用中使用');
  }
  try {
    return resultFromResponse(await bridge.ontologyCrossPackage.invoke(request), isData);
  } catch {
    return unavailable('DESKTOP_TASK_BOARD_UNAVAILABLE', '无法连接桌面任务服务', true);
  }
}

function baseRequest(projectId: string, requestId: string) {
  return {
    contractVersion: ONTOLOGY_CROSS_PACKAGE_CONTRACT_VERSION,
    projectId,
    requestId,
    actorId: TASK_BOARD_ACTOR_ID,
  } as const;
}

export function createProjectTaskBoardRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `project-task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function subscribeProjectTaskBoard(
  projectId: string,
  listener: (
    event: ProjectTaskSubscriptionEvent | ProjectTaskSubscriptionTermination
  ) => void
): () => void {
  const bridge = getBridge();
  if (!bridge || typeof bridge.ontologyCrossPackage.subscribeProjectTasks !== 'function'
    || projectId.trim().length === 0) return () => undefined;
  try {
    return bridge.ontologyCrossPackage.subscribeProjectTasks(projectId, listener);
  } catch {
    return () => undefined;
  }
}

export async function listProjectTasks(
  input: ListProjectTaskBoardInput
): Promise<ProjectTaskBoardServiceResult<ProjectTaskPage>> {
  const invalid = validPageInput(input);
  if (invalid) return invalid;
  const request: OntologyCrossPackageRequest = {
    ...baseRequest(input.projectId, input.requestId),
    type: 'list_project_tasks',
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(input.limit === undefined ? {} : { limit: Math.min(MAX_PAGE_SIZE, input.limit) }),
  };
  return invoke(request, isTaskPage);
}

export async function getProjectTask(
  input: GetProjectTaskBoardInput
): Promise<ProjectTaskBoardServiceResult<ProjectTaskDetail>> {
  const invalid = validTaskInput(input);
  if (invalid) return invalid;
  return invoke({
    ...baseRequest(input.projectId, input.requestId),
    type: 'inspect_bound_task',
    taskId: input.taskId,
  }, isTaskDetail);
}

export async function controlProjectTask(
  input: ControlProjectTaskBoardInput
): Promise<ProjectTaskBoardServiceResult<ProjectTaskDetail>> {
  const invalid = validControlInput(input);
  if (invalid) return invalid;
  return invoke({
    ...baseRequest(input.projectId, input.requestId),
    type: 'control_bound_task',
    taskId: input.taskId,
    action: input.action,
    expectedRevision: input.expectedRevision,
  }, isTaskDetail);
}


export async function requestProjectTaskTransition(
  input: TransitionProjectTaskBoardInput
): Promise<ProjectTaskBoardServiceResult<ProjectTaskDetail>> {
  const invalid = validTransitionInput(input);
  if (invalid) return invalid;
  return invoke({
    ...baseRequest(input.projectId, input.requestId),
    type: 'transition_project_task',
    taskId: input.taskId,
    targetStatus: input.targetStatus,
    expectedRevision: input.expectedRevision,
    ...(input.expectedLeaseEpoch === undefined
      ? {}
      : { expectedLeaseEpoch: input.expectedLeaseEpoch }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  }, isTaskDetail);
}

export async function updateProjectTaskPriority(
  input: UpdateProjectTaskPriorityInput
): Promise<ProjectTaskBoardServiceResult<OntologyCrossPackageTaskPriorityData>> {
  const invalid = validPriorityInput(input);
  if (invalid) return invalid;
  return invoke({
    ...baseRequest(input.projectId, input.requestId),
    type: 'update_project_task_priority',
    taskId: input.taskId,
    priority: input.priority,
    expectedRevision: input.expectedRevision,
    expectedCursor: input.expectedCursor,
    bridgeEpoch: input.bridgeEpoch,
  }, isTaskPriorityData);
}

export async function listWorkItemHandoffCandidates(
  input: ListWorkItemHandoffCandidatesInput
): Promise<ProjectTaskBoardServiceResult<OntologyCrossPackageHandoffCandidatesData>> {
  const invalid = validHandoffBaseInput(input);
  if (invalid) return invalid;
  return invoke({
    ...baseRequest(input.projectId, input.requestId),
    type: 'list_work_item_handoff_candidates',
    runId: input.runId,
    workItemId: input.workItemId,
  }, isHandoffCandidatesData);
}

export async function handoffWorkItem(
  input: HandoffWorkItemInput
): Promise<ProjectTaskBoardServiceResult<OntologyCrossPackageWorkItemHandoffData>> {
  const invalid = validHandoffInput(input);
  if (invalid) return invalid;
  return invoke({
    ...baseRequest(input.projectId, input.requestId),
    type: 'handoff_work_item',
    runId: input.runId,
    workItemId: input.workItemId,
    targetAgentId: input.targetAgentId,
    expectedRunRevision: input.expectedRunRevision,
    expectedWorkItemRevision: input.expectedWorkItemRevision,
    expectedLeaseEpoch: input.expectedLeaseEpoch,
  }, isWorkItemHandoffData);
}

export async function listApprovedTaskTemplates(
  input: ListApprovedTaskTemplatesInput
): Promise<ProjectTaskBoardServiceResult<OntologyApprovedTaskTemplateCatalogData>> {
  const invalid = requiredIdentifier(input.projectId, 'projectId')
    ?? requiredIdentifier(input.requestId, 'requestId');
  if (invalid) {
    return invalid;
  }
  return invoke({
    ...baseRequest(input.projectId, input.requestId),
    type: 'list_approved_task_templates',
  }, isTemplateCatalog);
}

export async function createProjectTaskFromTemplate(
  input: CreateProjectTaskFromTemplateInput
): Promise<ProjectTaskBoardServiceResult<OntologyApprovedProjectTaskData>> {
  const invalid = requiredIdentifier(input.projectId, 'projectId')
    ?? requiredIdentifier(input.requestId, 'requestId')
    ?? requiredIdentifier(input.solutionId, 'solutionId')
    ?? requiredIdentifier(input.solutionVersion, 'solutionVersion')
    ?? requiredIdentifier(input.contractId, 'contractId')
    ?? requiredIdentifier(input.taskTemplateId, 'taskTemplateId')
    ?? requiredIdentifier(input.objective, 'objective')
    ?? (!/^sha256:[a-f0-9]{64}$/i.test(input.contractHash)
      ? rejected('TASK_BOARD_INVALID_REQUEST', 'contractHash 必须是 sha256 摘要')
      : undefined);
  if (invalid) {
    return invalid;
  }
  return invoke({
    ...baseRequest(input.projectId, input.requestId),
    type: 'create_approved_project_task',
    solutionId: input.solutionId,
    solutionVersion: input.solutionVersion,
    contractId: input.contractId,
    contractHash: input.contractHash,
    taskTemplateId: input.taskTemplateId,
    objective: input.objective,
    semanticInputs: input.semanticInputs,
  }, isCreatedTask);
}
