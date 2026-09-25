import type {
  AgentTaskAction,
  AgentTaskExecutionStatus,
  AgentTaskProjectMetadataV1,
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

export type ProjectTaskTransitionCapability =
  | ProjectTaskAction
  | 'request_review'
  | 'approve_completion'
  | 'reject_review';

export interface ProjectTaskPublicTransition {
  readonly capability: ProjectTaskTransitionCapability;
  readonly targetStatus: ProjectTaskBoardStatus;
}

export type ProjectTaskRuntimeAvailability = 'controllable' | 'recovery_required';

export interface ProjectTaskRecord {
  readonly projectId: string;
  readonly taskId: string;
  readonly updatedAt: string;
  readonly runId?: string;
  readonly projectMetadata?: AgentTaskProjectMetadataV1;
  readonly runtimeStatus: AgentTaskExecutionStatus;
  readonly runtimeAvailability: ProjectTaskRuntimeAvailability;
  readonly runStatus?: CollaborationRunSnapshot['status'];
  readonly assignedAgentIds: readonly string[];
  readonly workItemCount: number;
  readonly artifactRefs: readonly string[];
  readonly leaseEpoch?: number;
  readonly reviewCapabilitiesAvailable?: boolean;
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

export interface ProjectTaskTransitionInput {
  readonly projectId: string;
  readonly taskId: string;
  readonly targetStatus: ProjectTaskBoardStatus;
  readonly requestId: string;
  readonly expectedRevision: number;
  readonly expectedLeaseEpoch?: number;
  readonly reason?: string;
}

export interface ProjectTaskCapabilityInput extends ProjectTaskTransitionInput {
  readonly capability: ProjectTaskTransitionCapability;
}

export interface ProjectTaskSource {
  list(input: ProjectTaskListInput): Promise<ProjectTaskSourcePage>;
  get(projectId: string, taskId: string): Promise<ProjectTaskRecord | null>;
  control(input: ProjectTaskControlInput): Promise<ProjectTaskRecord>;
  transition?(input: ProjectTaskCapabilityInput): Promise<ProjectTaskRecord>;
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
  readonly projectMetadata?: AgentTaskProjectMetadataV1;
  readonly runtimeStatus: AgentTaskExecutionStatus;
  readonly runtimeAvailability: ProjectTaskRuntimeAvailability;
  readonly runStatus?: CollaborationRunSnapshot['status'];
  readonly assignedAgentIds: readonly string[];
  readonly workItemCount: number;
  readonly artifactRefs: readonly string[];
  readonly leaseEpoch?: number;
  readonly transitions: readonly ProjectTaskPublicTransition[];
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

  constructor(
    message: string,
    readonly authoritative?: ProjectTaskSummary,
  ) {
    super(message);
  }
}

export class ProjectTaskRequestIdConflictError extends Error {
  readonly code = 'REQUEST_ID_CONFLICT';
}

export type ProjectTaskTransitionRejectionCode =
  | 'TRANSITION_NOT_AVAILABLE'
  | 'TRANSITION_AMBIGUOUS'
  | 'LEASE_CONFLICT'
  | 'EVIDENCE_GATE_FAILED';

export interface ProjectTaskEvidenceGap {
  readonly kind: 'step_status' | 'step_evidence' | 'criterion_status' | 'criterion_evidence' | 'blocker' | 'task_evidence';
  readonly id: string;
  readonly message: string;
}

export class ProjectTaskTransitionRejectedError extends Error {
  constructor(
    readonly code: ProjectTaskTransitionRejectionCode,
    message: string,
    readonly authoritative: ProjectTaskSummary,
    readonly gaps: readonly ProjectTaskEvidenceGap[] = [],
  ) {
    super(message);
  }
}

function identifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

function boardStatus(record: ProjectTaskRecord): ProjectTaskBoardStatus {
  if (record.task.status === 'done' || record.task.status === 'cancelled'
    || record.task.status === 'review' || record.task.status === 'blocked') {
    return record.task.status;
  }
  if (record.runtimeStatus === 'paused' || record.runtimeStatus === 'waiting_user'
    || record.runtimeStatus === 'failed') {
    return 'blocked';
  }
  return record.task.status;
}

export function summarizeProjectTaskRecord(record: ProjectTaskRecord): ProjectTaskSummary {
  return {
    projectId: record.projectId,
    taskId: record.taskId,
    title: record.task.title,
    status: boardStatus(record),
    revision: record.task.revision,
    progress: record.task.progress,
    ...(record.task.currentStep ? { currentStep: record.task.currentStep } : {}),
    blockerCount: record.task.blockers.filter((blocker) => !blocker.resolved).length,
    evidenceCount: record.task.evidenceCount,
    actions: record.task.actions,
    ...(record.runId ? { runId: record.runId } : {}),
    ...(record.projectMetadata ? { projectMetadata: record.projectMetadata } : {}),
    runtimeStatus: record.runtimeStatus,
    runtimeAvailability: record.runtimeAvailability,
    ...(record.runStatus ? { runStatus: record.runStatus } : {}),
    assignedAgentIds: record.assignedAgentIds,
    workItemCount: record.workItemCount,
    artifactRefs: record.artifactRefs,
    ...(record.leaseEpoch !== undefined ? { leaseEpoch: record.leaseEpoch } : {}),
    transitions: projectTaskPublicTransitions(record),
  };
}

export function projectTaskPublicTransitions(
  record: ProjectTaskRecord,
): readonly ProjectTaskPublicTransition[] {
  if (record.runtimeAvailability !== 'controllable') return [];
  const result: ProjectTaskPublicTransition[] = [];
  const terminal = record.task.status === 'done' || record.task.status === 'cancelled';
  if (!terminal && record.task.actions.includes('cancel')) {
    result.push({ capability: 'cancel', targetStatus: 'cancelled' });
  }
  if (record.runtimeStatus === 'running' || record.runtimeStatus === 'planning') {
    if (record.task.actions.includes('stop')) {
      result.push({ capability: 'pause', targetStatus: 'blocked' });
    }
  }
  if (record.runtimeStatus === 'paused' || record.runtimeStatus === 'waiting_user') {
    result.push({ capability: 'resume', targetStatus: 'active' });
  }
  if (record.runtimeStatus === 'failed') {
    result.push({ capability: 'retry', targetStatus: 'active' });
  }
  if (record.reviewCapabilitiesAvailable) {
    if (record.task.status === 'active' && (record.task.progress > 0 || record.task.evidenceCount > 0)) {
      result.push({ capability: 'request_review', targetStatus: 'review' });
    } else if (record.task.status === 'review') {
      result.push({ capability: 'approve_completion', targetStatus: 'done' });
      result.push({ capability: 'reject_review', targetStatus: 'active' });
    }
  }
  return result;
}

export function projectTaskCompletionGaps(
  task: AgentTaskProjectionV1,
): readonly ProjectTaskEvidenceGap[] {
  const gaps: ProjectTaskEvidenceGap[] = [];
  for (const blocker of task.blockers) {
    if (!blocker.resolved) {
      gaps.push({ kind: 'blocker', id: blocker.id, message: blocker.neededToUnblock || blocker.reason });
    }
  }
  for (const step of task.steps) {
    if (step.status !== 'done' && step.status !== 'skipped') {
      gaps.push({ kind: 'step_status', id: step.id, message: 'Step is not complete' });
    }
    if (step.evidenceRequired && step.status === 'done' && step.evidenceCount < 1) {
      gaps.push({ kind: 'step_evidence', id: step.id, message: 'Required Step Evidence is missing' });
    }
  }
  for (const criterion of task.criteria) {
    if (criterion.status !== 'satisfied' && criterion.status !== 'skipped') {
      gaps.push({ kind: 'criterion_status', id: criterion.id, message: 'Criterion is not satisfied' });
    }
    if (criterion.status === 'satisfied' && criterion.evidenceCount < 1) {
      gaps.push({ kind: 'criterion_evidence', id: criterion.id, message: 'Criterion Evidence is missing' });
    }
  }
  if (task.evidenceCount < 1) {
    gaps.push({ kind: 'task_evidence', id: task.taskId, message: 'Task has no Evidence' });
  }
  return gaps;
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
    const items = page.items.map(summarizeProjectTaskRecord);
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

  async requestProjectTaskTransition(
    input: ProjectTaskTransitionInput
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
    const result = this.transition(input);
    this.requests.set(key, { inputHash, result });
    return result;
  }

  private async transition(input: ProjectTaskTransitionInput): Promise<ProjectTaskDetail> {
    const current = await this.taskSource.get(input.projectId, input.taskId);
    if (!current) throw new Error(`Project task not found: ${input.taskId}`);
    assertRecordScope(current, input.projectId, input.taskId);
    const authoritative = summarizeProjectTaskRecord(current);
    if (current.task.revision !== input.expectedRevision) {
      throw new ProjectTaskRevisionConflictError(
        `Expected task revision ${input.expectedRevision}, got ${current.task.revision}`,
        authoritative,
      );
    }
    if (input.expectedLeaseEpoch !== undefined && current.leaseEpoch !== input.expectedLeaseEpoch) {
      throw new ProjectTaskTransitionRejectedError(
        'LEASE_CONFLICT',
        `Expected lease epoch ${input.expectedLeaseEpoch}, got ${current.leaseEpoch ?? 'none'}`,
        authoritative,
      );
    }
    const candidates = authoritative.transitions.filter(
      ({ targetStatus }) => targetStatus === input.targetStatus,
    );
    if (candidates.length !== 1) {
      throw new ProjectTaskTransitionRejectedError(
        candidates.length === 0 ? 'TRANSITION_NOT_AVAILABLE' : 'TRANSITION_AMBIGUOUS',
        candidates.length === 0
          ? `No public capability can move Task to ${input.targetStatus}`
          : `Multiple public capabilities can move Task to ${input.targetStatus}`,
        authoritative,
      );
    }
    const capability = candidates[0]!.capability;
    if (capability === 'approve_completion') {
      const gaps = projectTaskCompletionGaps(current.task);
      if (gaps.length > 0) {
        throw new ProjectTaskTransitionRejectedError(
          'EVIDENCE_GATE_FAILED',
          'Task completion Evidence Gate failed',
          authoritative,
          gaps,
        );
      }
    }
    const request: ProjectTaskCapabilityInput = { ...input, capability };
    let updated: ProjectTaskRecord;
    if (this.taskSource.transition) {
      updated = await this.taskSource.transition(request);
    } else if (capability === 'pause' || capability === 'resume'
      || capability === 'retry' || capability === 'cancel') {
      updated = await this.taskSource.control({
        projectId: input.projectId,
        taskId: input.taskId,
        action: capability,
        requestId: input.requestId,
        expectedRevision: input.expectedRevision,
      });
    } else {
      throw new ProjectTaskTransitionRejectedError(
        'TRANSITION_NOT_AVAILABLE',
        'The Task source does not expose the required public review capability',
        authoritative,
      );
    }
    assertRecordScope(updated, input.projectId, input.taskId);
    return this.detail(updated);
  }

  private async control(input: ProjectTaskControlInput): Promise<ProjectTaskDetail> {
    const current = await this.taskSource.get(input.projectId, input.taskId);
    if (!current) throw new Error(`Project task not found: ${input.taskId}`);
    assertRecordScope(current, input.projectId, input.taskId);
    if (current.task.revision !== input.expectedRevision) {
      throw new ProjectTaskRevisionConflictError(
        `Expected task revision ${input.expectedRevision}, got ${current.task.revision}`,
        summarizeProjectTaskRecord(current),
      );
    }
    const updated = await this.taskSource.control(input);
    assertRecordScope(updated, input.projectId, input.taskId);
    return this.detail(updated);
  }

  private async detail(record: ProjectTaskRecord): Promise<ProjectTaskDetail> {
    const base = summarizeProjectTaskRecord(record);
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
      assignedAgentIds: uniqueAssignedAgentIds(run),
      workItemCount: run.workItems.length,
      artifactRefs: uniqueArtifactRefs(run),
      task: record.task,
      workItems: run.workItems,
      binding: run.binding,
    };
  }
}


function uniqueAssignedAgentIds(run: CollaborationRunSnapshot): readonly string[] {
  return [...new Set(run.workItems
    .map((workItem) => workItem.assignedAgentId.trim())
    .filter((agentId) => agentId.length > 0))];
}

function uniqueArtifactRefs(run: CollaborationRunSnapshot): readonly string[] {
  const refs = new Set<string>();
  for (const workItem of run.workItems) {
    for (const ref of workItem.outputRefs) {
      if (ref.trim()) refs.add(ref);
    }
    for (const attempt of workItem.attempts) {
      for (const ref of attempt.workerReceipt?.outputRefs ?? []) {
        if (ref.trim()) refs.add(ref);
      }
      for (const ref of attempt.verifierResult?.artifactRefs ?? []) {
        if (ref.trim()) refs.add(ref);
      }
    }
  }
  return [...refs];
}

export function summarizeProjectTaskRun(run: CollaborationRunSnapshot | null): Pick<
  ProjectTaskRecord,
  'runId' | 'runStatus' | 'assignedAgentIds' | 'workItemCount' | 'artifactRefs'
> {
  if (!run) {
    return { assignedAgentIds: [], workItemCount: 0, artifactRefs: [] };
  }
  return {
    runId: run.runId,
    runStatus: run.status,
    assignedAgentIds: uniqueAssignedAgentIds(run),
    workItemCount: run.workItems.length,
    artifactRefs: uniqueArtifactRefs(run),
  };
}
