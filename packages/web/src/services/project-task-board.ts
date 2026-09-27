import type { IpcResponse } from '@originos/core/lib/integrations/electron/ipc-protocol';
import {
  ONTOLOGY_CROSS_PACKAGE_CONTRACT_VERSION,
  type OntologyCrossPackageError,
  type OntologyCrossPackageRequest,
  type OntologyCrossPackageResponse,
  type ProjectTaskAction,
  type ProjectTaskDetail,
  type ProjectTaskPage,
} from '@originos/core/lib/features/project/client';
import { isElectron } from '@originos/core/lib/integrations/electron/env';

const TASK_BOARD_ACTOR_ID = 'project-task-board';
const MAX_PAGE_SIZE = 50;

export type ProjectTaskBoardServiceErrorKind = 'unavailable' | 'conflict' | 'rejected';

export interface ProjectTaskBoardServiceError {
  readonly kind: ProjectTaskBoardServiceErrorKind;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly issues: readonly { readonly code: string; readonly message: string; readonly field?: string }[];
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

interface OntologyCrossPackageBridge {
  readonly ontologyCrossPackage: {
    invoke(request: unknown): Promise<IpcResponse<OntologyCrossPackageResponse>>;
  };
}

function unavailable(
  code: string,
  message: string,
  retryable = false
): ProjectTaskBoardServiceResult<never> {
  return {
    ok: false,
    error: { kind: 'unavailable', code, message, retryable, issues: [] },
  };
}

function rejected(code: string, message: string): ProjectTaskBoardServiceResult<never> {
  return {
    ok: false,
    error: { kind: 'rejected', code, message, retryable: false, issues: [] },
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
