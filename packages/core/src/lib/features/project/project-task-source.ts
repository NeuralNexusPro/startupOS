import type {
  AgentTaskRuntimePersistenceV1,
  AgentTaskRuntimeSnapshotV1,
  ControlAgentTaskRequestV1,
} from '../../integrations/pi-agent/task-runtime';
import { isAgentTaskRuntimePersistenceV1 } from '../../integrations/pi-agent/task-runtime';
import type {
  CollaborationExecutionPort,
  CollaborationRunSnapshot,
} from '../../../modules/collaboration-runtime/facade';
import type {
  ProjectTaskControlInput,
  ProjectTaskListInput,
  ProjectTaskRecord,
  ProjectTaskSource,
  ProjectTaskSourcePage,
} from './task-board';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

export class ProjectTaskSourceUnavailableError extends Error {
  readonly code = 'PROJECT_TASK_SOURCE_UNAVAILABLE';

  constructor(cause?: unknown) {
    super('PROJECT_TASK_SOURCE_UNAVAILABLE');
    this.cause = cause;
  }
}

export interface ProjectTaskRuntimeSessionRecord {
  readonly sessionId: string;
  readonly projectId: string;
  readonly updatedAt: number;
  readonly taskRuntime: AgentTaskRuntimePersistenceV1;
}

export interface ProjectTaskRuntimeSessionPort {
  listTaskRuntimeSessions(
    projectId: string,
  ): Promise<readonly ProjectTaskRuntimeSessionRecord[]>;
}

export interface ProjectTaskRuntimeControlPort {
  getTaskRuntimeSnapshot(sessionId: string): AgentTaskRuntimeSnapshotV1 | null;
  controlTaskRuntime(
    sessionId: string,
    request: ControlAgentTaskRequestV1,
  ): Promise<AgentTaskRuntimeSnapshotV1>;
}

type ProjectTaskRunPort = Pick<CollaborationExecutionPort, 'findByTask'>;

interface SourceRecord {
  readonly sessionId: string;
  readonly record: ProjectTaskRecord;
}

function cursorFor(record: SourceRecord): string {
  return encodeURIComponent(`${record.record.updatedAt}\u0000${record.sessionId}`);
}

function maxPageSize(limit?: number): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, limit ?? DEFAULT_PAGE_SIZE));
}

function runtimeProjection(
  session: ProjectTaskRuntimeSessionRecord,
  liveSnapshot: AgentTaskRuntimeSnapshotV1 | null,
): AgentTaskRuntimeSnapshotV1['projection'] {
  if (liveSnapshot?.projection) return liveSnapshot.projection;
  if (!isAgentTaskRuntimePersistenceV1(session.taskRuntime)) {
    throw new ProjectTaskSourceUnavailableError();
  }
  return session.taskRuntime.execution.projection;
}

function controlAction(action: ProjectTaskControlInput['action']): ControlAgentTaskRequestV1['action'] {
  return action === 'pause' ? 'stop' : action;
}

function updatedAtIso(updatedAt: number): string {
  if (!Number.isFinite(updatedAt)) throw new ProjectTaskSourceUnavailableError();
  return new Date(updatedAt).toISOString();
}

/**
 * Reads persisted Task Runtime projections directly. No separate task index is
 * stored, so every list also serves as the index-rebuild path after restart.
 */
export class RuntimeProjectTaskSource implements ProjectTaskSource {
  constructor(
    private readonly sessions: ProjectTaskRuntimeSessionPort,
    private readonly runtimes: ProjectTaskRuntimeControlPort,
    private readonly runs: ProjectTaskRunPort,
  ) {}

  async list(input: ProjectTaskListInput): Promise<ProjectTaskSourcePage> {
    const records = await this.records(input.projectId);
    const start = input.cursor
      ? records.findIndex((record) => cursorFor(record) === input.cursor) + 1
      : 0;
    if (start < 0) throw new TypeError('Invalid project task cursor');
    const items = records.slice(start, start + maxPageSize(input.limit));
    const last = items.at(-1);
    return {
      items: items.map(({ record }) => record),
      ...(last && start + items.length < records.length
        ? { cursor: cursorFor(last) }
        : {}),
    };
  }

  async get(projectId: string, taskId: string): Promise<ProjectTaskRecord | null> {
    const record = (await this.records(projectId)).find(
      (candidate) => candidate.record.taskId === taskId,
    );
    return record?.record ?? null;
  }

  async control(input: ProjectTaskControlInput): Promise<ProjectTaskRecord> {
    const record = (await this.records(input.projectId)).find(
      (candidate) => candidate.record.taskId === input.taskId,
    );
    if (!record) throw new Error(`Project task not found: ${input.taskId}`);
    const snapshot = this.runtimes.getTaskRuntimeSnapshot(record.sessionId);
    if (!snapshot?.projection || snapshot.projection.taskId !== input.taskId) {
      throw new ProjectTaskSourceUnavailableError();
    }
    const updated = await this.runtimes.controlTaskRuntime(record.sessionId, {
      version: 1,
      requestId: input.requestId,
      sessionId: record.sessionId,
      action: controlAction(input.action),
      expectedRevision: input.expectedRevision,
      expectedCursor: snapshot.execution.expectedCursor,
      bridgeEpoch: snapshot.execution.bridgeEpoch,
    });
    if (!updated.projection || updated.projection.taskId !== input.taskId) {
      throw new ProjectTaskSourceUnavailableError();
    }
    return this.record(
      input.projectId,
      Date.parse(record.record.updatedAt),
      updated.projection,
    );
  }

  private async records(projectId: string): Promise<readonly SourceRecord[]> {
    let sessions: readonly ProjectTaskRuntimeSessionRecord[];
    try {
      sessions = await this.sessions.listTaskRuntimeSessions(projectId);
    } catch (error) {
      throw new ProjectTaskSourceUnavailableError(error);
    }
    const records = await Promise.all(sessions.map(async (session) => {
      if (session.projectId !== projectId) {
        throw new ProjectTaskSourceUnavailableError();
      }
      const projection = runtimeProjection(
        session,
        this.runtimes.getTaskRuntimeSnapshot(session.sessionId),
      );
      if (!projection) return null;
      return {
        sessionId: session.sessionId,
        record: await this.record(
          projectId,
          session.updatedAt,
          projection,
        ),
      } satisfies SourceRecord;
    }));
    const unique = new Map<string, SourceRecord>();
    for (const record of records) {
      if (!record) continue;
      const current = unique.get(record.record.taskId);
      if (!current || current.record.updatedAt < record.record.updatedAt) {
        unique.set(record.record.taskId, record);
      }
    }
    return [...unique.values()].sort((left, right) =>
      right.record.updatedAt.localeCompare(left.record.updatedAt)
      || left.sessionId.localeCompare(right.sessionId),
    );
  }

  private async record(
    projectId: string,
    updatedAt: number,
    task: NonNullable<AgentTaskRuntimeSnapshotV1['projection']>,
  ): Promise<ProjectTaskRecord> {
    let run: CollaborationRunSnapshot | null;
    try {
      run = await this.runs.findByTask(projectId, task.taskId);
    } catch (error) {
      throw new ProjectTaskSourceUnavailableError(error);
    }
    if (
      run
      && (run.projectId !== projectId || run.binding.parentTaskId !== task.taskId)
    ) {
      throw new ProjectTaskSourceUnavailableError();
    }
    return {
      projectId,
      taskId: task.taskId,
      updatedAt: updatedAtIso(updatedAt),
      ...(run ? { runId: run.runId } : {}),
      task,
    };
  }
}
