// contract-bound 任务的会话端口适配器——approved task 端口、evidence sink、Task Runtime 恢复与优先级 mutation。

import { createHash } from 'node:crypto';

import { createAgentTaskEvidenceSink } from '../../../../modules/collaboration-runtime/facade';
import { isAgentTaskRuntimePersistenceV1 } from '../../../integrations/pi-agent/task-runtime';

import type {
  EvidenceReceipt,
  EvidenceSubmissionInput,
  WorkItemEvidenceSink,
} from '../../../../modules/collaboration-runtime/facade';
import type {
  AgentTaskProjectMetadataMutationReceiptV1,
  AgentTaskRuntimeSnapshotV1,
} from '../../../integrations/pi-agent/task-runtime';
import type {
  ProjectTaskPriorityMutationInput,
  ProjectTaskPriorityMutationPort,
} from '../ontology-cross-package-service';
import type {
  ApprovedProjectTaskCreateRequest,
  ApprovedProjectTaskPort,
  ApprovedProjectTaskReceipt,
} from '../project-task-creation';
import type {
  ProjectTaskRuntimeRecoveryInput,
  ProjectTaskRuntimeRecoveryPort,
  ProjectTaskRuntimeRecoveryResult,
} from '../project-task-source';
import type { ProjectTaskBoardService } from '../task-board';
import type { ProjectContractRuntimeHostCapabilities } from './contract-runtime-types';

export function taskCreationSessionId(projectId: string, requestId: string): string {
  return `approved-task-${createHash('sha256')
    .update(`${projectId}:${requestId}`)
    .digest('hex')
    .slice(0, 32)}`;
}

export class RuntimeApprovedProjectTaskPort implements ApprovedProjectTaskPort {
  constructor(
    private readonly host: ProjectContractRuntimeHostCapabilities,
    private readonly taskBoard: ProjectTaskBoardService,
  ) {}

  async findByRequest(
    projectId: string,
    requestId: string,
  ): Promise<ApprovedProjectTaskReceipt | null> {
    const sessionId = taskCreationSessionId(projectId, requestId);
    const session = await this.host.sessions.getSession(sessionId, projectId);
    if (!session?.taskRuntime
      || session.taskRuntime.execution.requestId !== requestId
      || !session.taskRuntime.execution.projection) {
      return null;
    }
    const projection = session.taskRuntime.execution.projection;
    const parentStepId = projection.currentStep ?? projection.steps[0]?.id;
    if (!parentStepId) {throw new Error('APPROVED_TASK_STEP_MISSING');}
    return {
      task: await this.taskBoard.getProjectTask(projectId, projection.taskId),
      parentStepId,
      parentSessionId: sessionId,
    };
  }

  async create(input: ApprovedProjectTaskCreateRequest): Promise<ApprovedProjectTaskReceipt> {
    const recovered = await this.findByRequest(input.projectId, input.requestId);
    if (recovered) {return recovered;}
    const sessionId = taskCreationSessionId(input.projectId, input.requestId);
    const session = await this.host.sessions.getSession(sessionId, input.projectId)
      ?? await this.host.sessions.createSession({
        sessionId,
        projectId: input.projectId,
        projectName: input.projectId,
        agentType: 'project-agent',
        systemPrompt: [
          'Execute only the approved project Task. The collaboration topology is frozen by its published contract.',
          `Contract: ${input.source.contractId} (${input.source.contractHash})`,
          `Template: ${input.source.taskTemplateId}`,
        ].join('\n'),
      });
    const runtime = await this.host.agents.getOrCreateTaskRuntime(session, {
      persist: async (state) => {
        const updated = await this.host.sessions.updateSession(
          sessionId,
          { taskRuntime: state },
          input.projectId,
        );
        if (!updated) {throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');}
      },
    });
    const snapshot = await runtime.createTask({
      version: 1,
      requestId: input.requestId,
      sessionId,
      title: input.title,
      objective: input.objective,
      acceptanceCriteria: [...input.acceptanceCriteria],
      context: JSON.stringify({ source: input.source }),
    });
    if (!snapshot.projection || snapshot.execution.status === 'failed') {
      throw new Error(snapshot.execution.lastError?.message ?? 'APPROVED_TASK_CREATION_FAILED');
    }
    const parentStepId = snapshot.projection.currentStep ?? snapshot.projection.steps[0]?.id;
    if (!parentStepId) {throw new Error('APPROVED_TASK_STEP_MISSING');}
    return {
      task: await this.taskBoard.getProjectTask(input.projectId, snapshot.projection.taskId),
      parentStepId,
      parentSessionId: sessionId,
    };
  }
}

export function createProjectEvidenceSink(
  host: ProjectContractRuntimeHostCapabilities,
): WorkItemEvidenceSink {
  return {
    async record(input: EvidenceSubmissionInput): Promise<EvidenceReceipt> {
      const taskId = input.workItem.binding.parentTaskId;
      const records = await host.sessions.listTaskRuntimeSessions(input.run.projectId);
      const record = records.find(({ taskRuntime }) =>
        taskRuntime.execution.projection?.taskId === taskId
      );
      if (!record) {throw new Error('PROJECT_TASK_RUNTIME_UNAVAILABLE');}
      const session = await host.sessions.getSession(record.sessionId, input.run.projectId);
      if (!session) {throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');}
      const runtime = await host.agents.getOrCreateTaskRuntime(session, {
        persist: async (state) => {
          const updated = await host.sessions.updateSession(
            session.sessionId,
            { taskRuntime: state },
            input.run.projectId,
          );
          if (!updated) {throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');}
        },
      });
      return createAgentTaskEvidenceSink(runtime).record(input);
    },
  };
}

function recoveryUnavailable(
  code: Extract<ProjectTaskRuntimeRecoveryResult, { status: 'unavailable' }>['code'],
): ProjectTaskRuntimeRecoveryResult {
  return { status: 'unavailable', code };
}

function isExactRecoveredTask(
  snapshot: AgentTaskRuntimeSnapshotV1,
  input: ProjectTaskRuntimeRecoveryInput,
): boolean {
  return snapshot.sessionId === input.sessionId
    && snapshot.projection?.taskId === input.taskId
    && snapshot.execution.taskId === input.taskId
    && snapshot.execution.expectedRevision === snapshot.projection.revision
    && snapshot.execution.expectedCursor === snapshot.projection.cursor;
}

/**
 * Core-owned session recovery. It hydrates the original persisted Session into
 * the supplied AgentManager and deliberately does not call resumeAfterRestore.
 */
export class ProjectContractTaskRuntimeRecovery implements ProjectTaskRuntimeRecoveryPort {
  private readonly pending = new Map<string, Promise<ProjectTaskRuntimeRecoveryResult>>();

  constructor(private readonly host: ProjectContractRuntimeHostCapabilities) {}

  recover(input: ProjectTaskRuntimeRecoveryInput): Promise<ProjectTaskRuntimeRecoveryResult> {
    const key = `${input.projectId}:${input.sessionId}:${input.taskId}`;
    const current = this.pending.get(key);
    if (current) {return current;}
    const recovery = this.restore(input).finally(() => {
      if (this.pending.get(key) === recovery) {this.pending.delete(key);}
    });
    this.pending.set(key, recovery);
    return recovery;
  }

  private async restore(
    input: ProjectTaskRuntimeRecoveryInput,
  ): Promise<ProjectTaskRuntimeRecoveryResult> {
    try {
      const session = await this.host.sessions.getSession(input.sessionId, input.projectId);
      if (!session) {return recoveryUnavailable('SESSION_NOT_FOUND');}
      if (
        session.sessionId !== input.sessionId
        || session.projectContext.projectId !== input.projectId
      ) {
        return recoveryUnavailable('PROJECT_SCOPE_MISMATCH');
      }
      if (
        !isAgentTaskRuntimePersistenceV1(session.taskRuntime)
        || session.taskRuntime.execution.taskId !== input.taskId
        || session.taskRuntime.execution.projection?.taskId !== input.taskId
      ) {
        return recoveryUnavailable('TASK_BINDING_MISMATCH');
      }
      const runtime = await this.host.agents.getOrCreateTaskRuntime(session, {
        persist: async (state) => {
          const authority = await this.host.sessions.getSession(input.sessionId, input.projectId);
          if (
            !authority
            || authority.sessionId !== input.sessionId
            || authority.projectContext.projectId !== input.projectId
            || authority.taskRuntime?.execution.taskId !== input.taskId
          ) {
            throw new Error('PROJECT_TASK_RECOVERY_AUTHORITY_CHANGED');
          }
          const updated = await this.host.sessions.updateSession(
            input.sessionId,
            { taskRuntime: state },
            input.projectId,
          );
          if (!updated) {throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');}
        },
      });
      const snapshot = runtime.getSnapshot();
      if (!isExactRecoveredTask(snapshot, input)) {
        return recoveryUnavailable('TASK_BINDING_MISMATCH');
      }
      const authority = await this.host.sessions.getSession(input.sessionId, input.projectId);
      if (
        !authority
        || authority.projectContext.projectId !== input.projectId
        || authority.taskRuntime?.execution.taskId !== input.taskId
      ) {
        return recoveryUnavailable('TASK_BINDING_MISMATCH');
      }
      const persisted = await this.host.sessions.updateSession(
        input.sessionId,
        { taskRuntime: runtime.getPersistenceState() },
        input.projectId,
      );
      if (!persisted) {return recoveryUnavailable('RUNTIME_RECOVERY_FAILED');}
      return { status: 'recovered', snapshot };
    } catch {
      return recoveryUnavailable('RUNTIME_RECOVERY_FAILED');
    }
  }
}

/** Resolves a project Task to its original Session before entering Task Runtime CAS. */
export class ProjectContractTaskPriorityMutation implements ProjectTaskPriorityMutationPort {
  constructor(private readonly host: ProjectContractRuntimeHostCapabilities) {}

  async updateProjectTaskPriority(
    input: ProjectTaskPriorityMutationInput,
  ): Promise<AgentTaskProjectMetadataMutationReceiptV1> {
    const records = await this.host.sessions.listTaskRuntimeSessions(input.projectId);
    const matches = records.filter(({ taskRuntime }) =>
      taskRuntime.execution.taskId === input.taskId
      && taskRuntime.execution.projection?.taskId === input.taskId
    );
    if (matches.length !== 1) {
      throw new Error('PROJECT_TASK_RUNTIME_UNAVAILABLE');
    }
    const record = matches[0]!;
    const session = await this.host.sessions.getSession(record.sessionId, input.projectId);
    if (!session || session.projectContext.projectId !== input.projectId) {
      throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');
    }
    const runtime = await this.host.agents.getOrCreateTaskRuntime(session, {
      persist: async (state) => {
        const updated = await this.host.sessions.updateSession(
          record.sessionId,
          { taskRuntime: state },
          input.projectId,
        );
        if (!updated) {throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');}
      },
    });
    return runtime.updateProjectTaskMetadata({
      version: 1,
      projectId: input.projectId,
      sessionId: record.sessionId,
      taskId: input.taskId,
      requestId: input.requestId,
      priority: input.priority,
      expectedRevision: input.expectedRevision,
      expectedCursor: input.expectedCursor,
      bridgeEpoch: input.bridgeEpoch,
    });
  }
}
