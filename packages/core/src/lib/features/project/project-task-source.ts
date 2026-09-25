import type {
  AgentTaskExecutionStateV1,
  AgentTaskReviewPort,
  AgentTaskRuntimePersistenceV1,
  AgentTaskRuntimeSnapshotV1,
  ControlAgentTaskRequestV1,
} from '../../integrations/pi-agent/task-runtime';
import { isAgentTaskRuntimePersistenceV1 } from '../../integrations/pi-agent/task-runtime';
import type {
  CollaborationExecutionPort,
  CollaborationRunSnapshot,
  SolutionTaskBinding,
} from '../../../modules/collaboration-runtime/facade';
import type {
  ProjectTaskControlInput,
  ProjectTaskCapabilityInput,
  ProjectTaskListInput,
  ProjectTaskRecord,
  ProjectTaskSource,
  ProjectTaskSourcePage,
} from './task-board';
import {
  ProjectTaskRevisionConflictError,
  ProjectTaskTransitionRejectedError,
  summarizeProjectTaskRecord,
  summarizeProjectTaskRun,
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

export interface ProjectTaskRuntimeRecoveryInput {
  readonly sessionId: string;
  readonly projectId: string;
  readonly taskId: string;
}

export type ProjectTaskRuntimeRecoveryUnavailableCode =
  | 'SESSION_NOT_FOUND'
  | 'PROJECT_SCOPE_MISMATCH'
  | 'TASK_BINDING_MISMATCH'
  | 'RUNTIME_RECOVERY_FAILED';

export type ProjectTaskRuntimeRecoveryResult =
  | {
      readonly status: 'recovered';
      readonly snapshot: AgentTaskRuntimeSnapshotV1;
    }
  | {
      readonly status: 'unavailable';
      readonly code: ProjectTaskRuntimeRecoveryUnavailableCode;
    };

/**
 * Public recovery boundary owned by the Agent Session lifecycle. Implementors
 * must restore this exact Session and must never create a replacement Task.
 */
export interface ProjectTaskRuntimeRecoveryPort {
  recover(
    input: ProjectTaskRuntimeRecoveryInput,
  ): Promise<ProjectTaskRuntimeRecoveryResult>;
}

export class ProjectTaskRuntimeRecoveryConflictError extends Error {
  readonly code = 'PROJECT_TASK_RUNTIME_STALE';

  constructor(message: string) {
    super(message);
  }
}

export type ProjectTaskRuntimeReviewPort = AgentTaskReviewPort;

type ProjectTaskRunPort = Pick<CollaborationExecutionPort, 'findByTask'>
  & Partial<Pick<CollaborationExecutionPort, 'inspect' | 'recover'>>;

interface SourceRecord {
  readonly sessionId: string;
  readonly session: ProjectTaskRuntimeSessionRecord;
  readonly record: ProjectTaskRecord;
}

interface RecoveryAuthority {
  readonly execution: AgentTaskExecutionStateV1;
  readonly projection: NonNullable<AgentTaskRuntimeSnapshotV1['projection']>;
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

function runtimeExecution(
  session: ProjectTaskRuntimeSessionRecord,
  liveSnapshot: AgentTaskRuntimeSnapshotV1 | null,
): AgentTaskExecutionStateV1 {
  if (liveSnapshot?.projection) return liveSnapshot.execution;
  if (!isAgentTaskRuntimePersistenceV1(session.taskRuntime)) {
    throw new ProjectTaskSourceUnavailableError();
  }
  return session.taskRuntime.execution;
}

function controlAction(action: ProjectTaskControlInput['action']): ControlAgentTaskRequestV1['action'] {
  return action === 'pause' ? 'stop' : action;
}

function updatedAtIso(updatedAt: number): string {
  if (!Number.isFinite(updatedAt)) throw new ProjectTaskSourceUnavailableError();
  return new Date(updatedAt).toISOString();
}

function sameTaskBinding(left: SolutionTaskBinding, right: SolutionTaskBinding): boolean {
  return left.parentTaskId === right.parentTaskId
    && left.parentStepId === right.parentStepId
    && left.runId === right.runId
    && left.solutionId === right.solutionId
    && left.solutionVersion === right.solutionVersion
    && left.executionContractId === right.executionContractId
    && left.contractHash === right.contractHash
    && left.taskRevision === right.taskRevision
    && left.parentSessionId === right.parentSessionId;
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
    private readonly reviews?: ProjectTaskRuntimeReviewPort,
    private readonly recovery?: ProjectTaskRuntimeRecoveryPort,
  ) {}

  async list(input: ProjectTaskListInput): Promise<ProjectTaskSourcePage> {
    const records = await this.records(input.projectId);
    const cursorIndex = input.cursor
      ? records.findIndex((record) => cursorFor(record) === input.cursor)
      : -1;
    if (input.cursor && cursorIndex < 0) throw new TypeError('Invalid project task cursor');
    const start = cursorIndex + 1;
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
    const snapshot = await this.snapshotForControl(record, input.expectedRevision, input.action);
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
      updated.execution,
      true,
    );
  }

  async transition(input: ProjectTaskCapabilityInput): Promise<ProjectTaskRecord> {
    const record = (await this.records(input.projectId)).find(
      (candidate) => candidate.record.taskId === input.taskId,
    );
    if (!record) throw new Error(`Project task not found: ${input.taskId}`);
    const snapshot = await this.snapshotForControl(
      record,
      input.expectedRevision,
      input.capability,
    );
    if (snapshot.projection.revision !== input.expectedRevision) {
      throw new ProjectTaskRevisionConflictError(
        `Expected task revision ${input.expectedRevision}, got ${snapshot.projection.revision}`,
        summarizeProjectTaskRecord(record.record),
      );
    }
    if (input.expectedLeaseEpoch !== undefined
      && snapshot.execution.bridgeEpoch !== input.expectedLeaseEpoch) {
      throw new ProjectTaskTransitionRejectedError(
        'LEASE_CONFLICT',
        `Expected lease epoch ${input.expectedLeaseEpoch}, got ${snapshot.execution.bridgeEpoch}`,
        summarizeProjectTaskRecord(record.record),
      );
    }
    let updated: AgentTaskRuntimeSnapshotV1;
    if (input.capability === 'pause' || input.capability === 'resume'
      || input.capability === 'retry' || input.capability === 'cancel') {
      updated = await this.runtimes.controlTaskRuntime(record.sessionId, {
        version: 1,
        requestId: input.requestId,
        sessionId: record.sessionId,
        action: controlAction(input.capability),
        expectedRevision: input.expectedRevision,
        expectedCursor: snapshot.execution.expectedCursor,
        bridgeEpoch: snapshot.execution.bridgeEpoch,
      });
    } else {
      if (!this.reviews) throw new ProjectTaskSourceUnavailableError();
      const request = {
        version: 1 as const,
        requestId: input.requestId,
        sessionId: record.sessionId,
        taskId: input.taskId,
        expectedRevision: input.expectedRevision,
        expectedCursor: snapshot.execution.expectedCursor,
        leaseEpoch: input.expectedLeaseEpoch ?? snapshot.execution.bridgeEpoch,
        ...(input.reason ? { reason: input.reason } : {}),
      };
      updated = input.capability === 'request_review'
        ? await this.reviews.requestReview(request)
        : input.capability === 'approve_completion'
          ? await this.reviews.approveCompletion(request)
          : await this.reviews.rejectReview(request);
    }
    if (!updated.projection || updated.projection.taskId !== input.taskId) {
      throw new ProjectTaskSourceUnavailableError();
    }
    return this.record(
      input.projectId,
      Date.parse(updated.execution.updatedAt),
      updated.projection,
      updated.execution,
      true,
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
      const liveSnapshot = this.runtimes.getTaskRuntimeSnapshot(session.sessionId);
      const projection = runtimeProjection(session, liveSnapshot);
      if (!projection) return null;
      return {
        sessionId: session.sessionId,
        session,
        record: await this.record(
          projectId,
          session.updatedAt,
          projection,
          runtimeExecution(session, liveSnapshot),
          Boolean(liveSnapshot?.projection),
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

  private async snapshotForControl(
    record: SourceRecord,
    expectedRevision: number,
    capability: ProjectTaskCapabilityInput['capability'],
  ): Promise<AgentTaskRuntimeSnapshotV1 & {
    readonly projection: NonNullable<AgentTaskRuntimeSnapshotV1['projection']>;
  }> {
    const persisted = this.persistedAuthority(record.session);
    let snapshot = this.runtimes.getTaskRuntimeSnapshot(record.sessionId);
    if (!snapshot?.projection) {
      if (!this.recovery) throw new ProjectTaskSourceUnavailableError();
      const before = await this.runBinding(
        record.record.runId,
        record.record.projectId,
        record.record.taskId,
      );
      const result = await this.recovery.recover({
        sessionId: record.sessionId,
        projectId: record.record.projectId,
        taskId: record.record.taskId,
      });
      if (result.status === 'unavailable') {
        throw new ProjectTaskSourceUnavailableError(new Error(result.code));
      }
      snapshot = result.snapshot;
      this.assertRecoveredAuthority(record, persisted, snapshot, expectedRevision);
      const after = await this.runBinding(
        record.record.runId,
        record.record.projectId,
        record.record.taskId,
      );
      this.assertSameBinding(before, after, record.record.taskId);

      if ((capability === 'resume' || capability === 'retry') && after) {
        if (!this.runs.recover) throw new ProjectTaskSourceUnavailableError();
        const recoveredRun = await this.runs.recover(after.runId);
        if (
          recoveredRun.projectId !== record.record.projectId
          || recoveredRun.runId !== after.runId
        ) {
          throw new ProjectTaskRuntimeRecoveryConflictError(
            'Recovered collaboration Run crossed project scope',
          );
        }
        this.assertSameBinding(after, recoveredRun.binding, record.record.taskId);
      }
      return snapshot as AgentTaskRuntimeSnapshotV1 & {
        readonly projection: NonNullable<AgentTaskRuntimeSnapshotV1['projection']>;
      };
    }
    this.assertRecoveredAuthority(record, persisted, snapshot, expectedRevision);
    return snapshot as AgentTaskRuntimeSnapshotV1 & {
      readonly projection: NonNullable<AgentTaskRuntimeSnapshotV1['projection']>;
    };
  }

  private persistedAuthority(session: ProjectTaskRuntimeSessionRecord): RecoveryAuthority {
    if (!isAgentTaskRuntimePersistenceV1(session.taskRuntime)) {
      throw new ProjectTaskSourceUnavailableError();
    }
    const execution = session.taskRuntime.execution;
    const projection = execution.projection;
    if (!projection || execution.taskId !== projection.taskId) {
      throw new ProjectTaskSourceUnavailableError();
    }
    return { execution, projection };
  }

  private assertRecoveredAuthority(
    record: SourceRecord,
    persisted: RecoveryAuthority,
    snapshot: AgentTaskRuntimeSnapshotV1,
    expectedRevision: number,
  ): asserts snapshot is AgentTaskRuntimeSnapshotV1 & {
    readonly projection: NonNullable<AgentTaskRuntimeSnapshotV1['projection']>;
  } {
    const projection = snapshot.projection;
    const execution = snapshot.execution;
    const stale = !projection
      || record.session.projectId !== record.record.projectId
      || snapshot.sessionId !== record.sessionId
      || projection.taskId !== record.record.taskId
      || execution.taskId !== record.record.taskId
      || projection.revision !== expectedRevision
      || execution.expectedRevision !== projection.revision
      || execution.expectedCursor !== projection.cursor
      || projection.revision !== persisted.projection.revision
      || projection.cursor !== persisted.projection.cursor
      || execution.expectedRevision !== persisted.execution.expectedRevision
      || execution.expectedCursor !== persisted.execution.expectedCursor
      || execution.bridgeEpoch < persisted.execution.bridgeEpoch;
    if (stale) {
      throw new ProjectTaskRuntimeRecoveryConflictError(
        'Recovered Task Runtime no longer matches the persisted control authority',
      );
    }
  }

  private async runBinding(
    runId: string | undefined,
    projectId: string,
    taskId: string,
  ): Promise<SolutionTaskBinding | null> {
    if (!runId) {
      const unexpected = await this.runs.findByTask(projectId, taskId);
      return unexpected?.binding ?? null;
    }
    if (!this.runs.inspect) throw new ProjectTaskSourceUnavailableError();
    const run = await this.runs.inspect(runId);
    if (run.projectId !== projectId || run.runId !== runId) {
      throw new ProjectTaskRuntimeRecoveryConflictError('Recovered Run crossed project scope');
    }
    return run.binding;
  }

  private assertSameBinding(
    expected: SolutionTaskBinding | null,
    actual: SolutionTaskBinding | null,
    taskId: string,
  ): void {
    if (!expected && !actual) return;
    if (
      !expected
      || !actual
      || expected.parentTaskId !== taskId
      || actual.parentTaskId !== taskId
      || !sameTaskBinding(expected, actual)
    ) {
      throw new ProjectTaskRuntimeRecoveryConflictError(
        'Recovered collaboration Run binding is stale',
      );
    }
  }

  private async record(
    projectId: string,
    updatedAt: number,
    task: NonNullable<AgentTaskRuntimeSnapshotV1['projection']>,
    execution: AgentTaskExecutionStateV1,
    isLive: boolean,
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
      ...(execution.projectMetadata
        ? { projectMetadata: execution.projectMetadata }
        : {}),
      runtimeStatus: execution.status,
      runtimeAvailability: isLive ? 'controllable' : 'recovery_required',
      leaseEpoch: execution.bridgeEpoch,
      reviewCapabilitiesAvailable: isLive && Boolean(this.reviews),
      ...summarizeProjectTaskRun(run),
      task,
    };
  }
}
