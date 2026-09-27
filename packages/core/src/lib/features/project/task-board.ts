import type {
  AgentTaskAction,
  AgentTaskProjectionV1,
} from '../../integrations/pi-agent/task-runtime';
import type {
  CollaborationExecutionPort,
  CollaborationRunSnapshot,
  CollaborationWorkItem,
  SolutionTaskBinding,
} from '../../../modules/collaboration-runtime/facade';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

export type ProjectTaskBoardStatus =
  | 'pending'
  | 'active'
  | 'blocked'
  | 'review'
  | 'done'
  | 'cancelled';

export type ProjectTaskAction = 'pause' | 'resume' | 'retry' | 'cancel';

export interface ProjectTaskRecord {
  readonly projectId: string;
  readonly taskId: string;
  readonly updatedAt: string;
  readonly runId?: string;
  readonly task: AgentTaskProjectionV1;
}

export interface ProjectTaskSourcePage {
  readonly items: readonly ProjectTaskRecord[];
  readonly cursor?: string;
}

export interface ProjectTaskListInput {
  readonly projectId: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ProjectTaskControlInput {
  readonly projectId: string;
  readonly taskId: string;
  readonly action: ProjectTaskAction;
  readonly requestId: string;
  readonly expectedRevision: number;
}

export interface ProjectTaskSource {
  list(input: ProjectTaskListInput): Promise<ProjectTaskSourcePage>;
  get(projectId: string, taskId: string): Promise<ProjectTaskRecord | null>;
  control(input: ProjectTaskControlInput): Promise<ProjectTaskRecord>;
}

export interface ProjectTaskSummary {
  readonly projectId: string;
  readonly taskId: string;
  readonly title: string;
  readonly status: ProjectTaskBoardStatus;
  readonly revision: number;
  readonly progress: number;
  readonly currentStep?: string;
  readonly blockerCount: number;
  readonly evidenceCount: number;
  readonly actions: readonly AgentTaskAction[];
  readonly runId?: string;
  readonly runStatus?: CollaborationRunSnapshot['status'];
  readonly workItemCount: number;
}

export interface ProjectTaskDetail extends ProjectTaskSummary {
  readonly task: AgentTaskProjectionV1;
  readonly workItems: readonly CollaborationWorkItem[];
  readonly binding?: SolutionTaskBinding;
}

export interface ProjectTaskPage {
  readonly items: readonly ProjectTaskSummary[];
  readonly cursor?: string;
  readonly revision: number;
}

export class ProjectTaskRevisionConflictError extends Error {
  readonly code = 'REVISION_CONFLICT';
}

export class ProjectTaskRequestIdConflictError extends Error {
  readonly code = 'REQUEST_ID_CONFLICT';
}

function identifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

function summary(record: ProjectTaskRecord): ProjectTaskSummary {
  return {
    projectId: record.projectId,
    taskId: record.taskId,
    title: record.task.title,
    status: record.task.status,
    revision: record.task.revision,
    progress: record.task.progress,
    ...(record.task.currentStep ? { currentStep: record.task.currentStep } : {}),
    blockerCount: record.task.blockers.filter((blocker) => !blocker.resolved).length,
    evidenceCount: record.task.evidenceCount,
    actions: record.task.actions,
    ...(record.runId ? { runId: record.runId } : {}),
    workItemCount: 0,
  };
}

function assertRecordScope(
  record: ProjectTaskRecord,
  projectId: string,
  taskId?: string
): void {
  if (record.projectId !== projectId) {
    throw new Error('Project task crossed project scope');
  }
  if (taskId && record.taskId !== taskId) {
    throw new Error('Project task ID does not match the request');
  }
}

export class ProjectTaskBoardService {
  private readonly requests = new Map<string, {
    inputHash: string;
    result: Promise<ProjectTaskDetail>;
  }>();

  constructor(
    private readonly taskSource: ProjectTaskSource,
    private readonly executionPort: Pick<CollaborationExecutionPort, 'inspect'>
  ) {}

  async listProjectTasks(input: ProjectTaskListInput): Promise<ProjectTaskPage> {
    identifier(input.projectId, 'projectId');
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, input.limit ?? DEFAULT_PAGE_SIZE)
    );
    const page = await this.taskSource.list({ ...input, limit });
    page.items.forEach((record) => assertRecordScope(record, input.projectId));
    const items = page.items.map(summary);
    return {
      items,
      ...(page.cursor ? { cursor: page.cursor } : {}),
      revision: items.reduce((revision, item) => Math.max(revision, item.revision), 0),
    };
  }

  async getProjectTask(
    projectId: string,
    taskId: string
  ): Promise<ProjectTaskDetail> {
    identifier(projectId, 'projectId');
    identifier(taskId, 'taskId');
    const record = await this.taskSource.get(projectId, taskId);
    if (!record) throw new Error(`Project task not found: ${taskId}`);
    assertRecordScope(record, projectId, taskId);
    return this.detail(record);
  }

  async requestProjectTaskAction(
    input: ProjectTaskControlInput
  ): Promise<ProjectTaskDetail> {
    identifier(input.projectId, 'projectId');
    identifier(input.taskId, 'taskId');
    identifier(input.requestId, 'requestId');
    const key = `${input.projectId}:${input.taskId}:${input.requestId}`;
    const inputHash = JSON.stringify(input);
    const existing = this.requests.get(key);
    if (existing) {
      if (existing.inputHash !== inputHash) {
        throw new ProjectTaskRequestIdConflictError(
          `Request ID ${input.requestId} was already used with different input`
        );
      }
      return existing.result;
    }
    const result = this.control(input);
    this.requests.set(key, { inputHash, result });
    return result;
  }

  private async control(input: ProjectTaskControlInput): Promise<ProjectTaskDetail> {
    const current = await this.taskSource.get(input.projectId, input.taskId);
    if (!current) throw new Error(`Project task not found: ${input.taskId}`);
    assertRecordScope(current, input.projectId, input.taskId);
    if (current.task.revision !== input.expectedRevision) {
      throw new ProjectTaskRevisionConflictError(
        `Expected task revision ${input.expectedRevision}, got ${current.task.revision}`
      );
    }
    const updated = await this.taskSource.control(input);
    assertRecordScope(updated, input.projectId, input.taskId);
    return this.detail(updated);
  }

  private async detail(record: ProjectTaskRecord): Promise<ProjectTaskDetail> {
    const base = summary(record);
    if (!record.runId) {
      return { ...base, task: record.task, workItems: [] };
    }
    const run = await this.executionPort.inspect(record.runId);
    if (run.projectId !== record.projectId) {
      throw new Error('Collaboration run crossed project scope');
    }
    if (run.binding.parentTaskId !== record.taskId) {
      throw new Error('Collaboration run does not belong to the project task');
    }
    return {
      ...base,
      runStatus: run.status,
      workItemCount: run.workItems.length,
      task: record.task,
      workItems: run.workItems,
      binding: run.binding,
    };
  }
}
