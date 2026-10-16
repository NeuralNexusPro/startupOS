import { createHash } from 'node:crypto';

import type {
  AdvanceSupervisorWorkItemsInput,
  BindSupervisorWorkItemInput,
  BindSupervisorWorkItemResult,
  CollaborationExecutionPort,
  CollaborationRunSnapshot,
  SupervisorWorkItemBindingReceipt,
  SupervisorWorkItemDesignGap,
  SupervisorWorkItemRuntimePort,
} from '../../../modules/collaboration-runtime/facade';
import type {
  PublishedSolutionExecutionContract,
  SolutionExecutionContractCatalogPort,
  SolutionExecutionContractPort,
  SolutionTaskTemplate,
} from '../solution';
import type { ApprovedProjectTaskCreationService } from './project-task-creation';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;
const MAX_SCHEDULER_PASSES = 256;

interface Candidate {
  readonly published: PublishedSolutionExecutionContract;
  readonly template: SolutionTaskTemplate;
}

export interface ProjectSupervisorWorkItemRuntimeDependencies {
  readonly contractCatalog: SolutionExecutionContractCatalogPort;
  readonly contractPort: Pick<SolutionExecutionContractPort, 'verifyIntegrity'>;
  readonly taskCreation: Pick<ApprovedProjectTaskCreationService, 'create'>;
  readonly executionPort: Pick<
    CollaborationExecutionPort,
    'executeWorkItem' | 'inspect' | 'recover'
  >;
}

function assertIdentifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

function gap(
  code: string,
  message: string,
  remediation: string,
  path?: string,
  refId?: string,
): SupervisorWorkItemDesignGap {
  return {
    code,
    message,
    remediation,
    ...(path ? { path } : {}),
    ...(refId ? { refId } : {}),
  };
}

function normalizeObjective(value: string): string {
  return value.trim().replace(/\s+/g, '').toLocaleLowerCase('zh-CN');
}

function attemptPayloadHash(
  binding: SupervisorWorkItemBindingReceipt,
  workItemId: string,
): string {
  return `sha256:${createHash('sha256').update(JSON.stringify({
    projectId: binding.projectId,
    requestId: binding.requestId,
    runId: binding.runId,
    workItemId,
    contractHash: binding.contractHash,
  })).digest('hex')}`;
}

function attemptRequestId(
  baseRequestId: string,
  designNodeId: string,
  attemptNumber: number,
): string {
  return `${baseRequestId}:work-item:${designNodeId}:attempt:${attemptNumber}`;
}

function runnableItems(snapshot: CollaborationRunSnapshot) {
  const completed = new Set(snapshot.workItems
    .filter(({ status }) => status === 'completed')
    .map(({ id }) => id));
  return snapshot.workItems.filter((item) =>
    (item.status === 'pending' || item.status === 'assigned')
    && item.dependsOn.every((dependency) => completed.has(dependency)));
}

/**
 * Project-owned implementation of the lower collaboration runtime port.
 * It never mutates Blackboard tasks and never invents execution topology.
 */
export class ProjectSupervisorWorkItemRuntime implements SupervisorWorkItemRuntimePort {
  constructor(private readonly dependencies: ProjectSupervisorWorkItemRuntimeDependencies) {}

  async bind(input: BindSupervisorWorkItemInput): Promise<BindSupervisorWorkItemResult> {
    assertIdentifier(input.projectId, 'projectId');
    assertIdentifier(input.collaborationSessionId, 'collaborationSessionId');
    assertIdentifier(input.requestId, 'requestId');
    const objective = input.objective.trim();
    if (!objective) {
      return { ok: false, gaps: [gap(
        'SUPERVISOR_OBJECTIVE_REQUIRED',
        '协作目标不能为空。',
        '请用自然语言说明希望多 Agent 完成的目标。',
        'objective',
      )] };
    }

    const candidates = await this.candidates(input.projectId);
    const selected = this.selectCandidate(candidates, objective);
    if (selected.ok === false) return selected;
    const { contract } = selected.candidate.published;
    const requiredSlots = contract.semanticContext.objectSlots.filter(({ required }) => required);
    if (requiredSlots.length > 0 || contract.topology.externalInputs.length > 0) {
      return { ok: false, gaps: [gap(
        'SUPERVISOR_SEMANTIC_INPUT_REQUIRED',
        '这个任务模板需要绑定结构化业务事实，不能只凭对话文本安全执行。',
        '先在项目任务入口绑定必填业务对象和 Fact，再使用同一 requestId 恢复执行。',
        'semanticInputs',
        selected.candidate.template.id,
      )] };
    }

    const created = await this.dependencies.taskCreation.create({
      projectId: input.projectId,
      solutionId: contract.solutionId,
      solutionVersion: contract.solutionVersion,
      contractId: contract.contractId,
      contractHash: contract.contractHash,
      taskTemplateId: selected.candidate.template.id,
      objective,
      semanticInputs: [],
      requestId: input.requestId,
    });
    if (created.ok === false) {
      return { ok: false, gaps: created.gaps.map((item) => ({
        code: item.code,
        message: item.message,
        remediation: item.remediation,
        ...(item.path ? { path: item.path } : {}),
        ...(item.refId ? { refId: item.refId } : {}),
      })) };
    }
    const { receipt } = created;
    return {
      ok: true,
      receipt: {
        projectId: input.projectId,
        collaborationSessionId: input.collaborationSessionId,
        requestId: input.requestId,
        parentTaskId: receipt.task.task.taskId,
        parentStepId: receipt.run.binding.parentStepId,
        ...(receipt.run.binding.parentSessionId
          ? { parentSessionId: receipt.run.binding.parentSessionId }
          : {}),
        runId: receipt.run.runId,
        solutionId: receipt.run.binding.solutionId,
        solutionVersion: receipt.run.binding.solutionVersion,
        contractId: receipt.contractId,
        contractHash: receipt.contractHash,
        taskTemplateId: receipt.taskTemplateId,
        snapshot: receipt.run,
      },
    };
  }

  async advance(input: AdvanceSupervisorWorkItemsInput): Promise<CollaborationRunSnapshot> {
    assertIdentifier(input.requestId, 'requestId');
    let snapshot = await this.dependencies.executionPort.recover(input.binding.runId);
    for (let pass = 0; pass < MAX_SCHEDULER_PASSES; pass += 1) {
      if (snapshot.terminalStatus || snapshot.status !== 'running') return snapshot;
      const runnable = runnableItems(snapshot);
      if (runnable.length === 0) return snapshot;
      await Promise.all(runnable.map(async (item) => {
        const attemptNumber = item.attempts.length + 1;
        await this.dependencies.executionPort.executeWorkItem({
          runId: snapshot.runId,
          workItemId: item.id,
          requestId: attemptRequestId(input.requestId, item.designNodeId, attemptNumber),
          payloadHash: attemptPayloadHash(input.binding, item.id),
        });
      }));
      // 每个 executeWorkItem 返回的快照只代表该次 mutation 完成时的视图。
      // 一轮并行节点全部 settle 后重新读取权威账本，避免用最后返回者的旧视图
      // 覆盖其他并行 WorkItem 的进展。
      snapshot = await this.dependencies.executionPort.inspect(snapshot.runId);
      if (snapshot.terminalStatus || snapshot.status !== 'running') return snapshot;
      const settled = runnable.every(({ id }) =>
        snapshot.workItems.find((candidate) => candidate.id === id)?.status === 'completed');
      if (!settled) return snapshot;
    }
    throw new Error('SUPERVISOR_WORKITEM_SCHEDULER_GUARD_EXHAUSTED');
  }

  private async candidates(projectId: string): Promise<readonly Candidate[]> {
    const published = await this.dependencies.contractCatalog.listProject(projectId);
    const candidates: Candidate[] = [];
    for (const item of published) {
      if (item.revocation || item.contract.status !== 'approved') continue;
      const integrity = await this.dependencies.contractPort.verifyIntegrity(item.contract);
      if (!integrity.valid) continue;
      for (const template of item.contract.semanticContext.taskTemplates) {
        candidates.push({ published: item, template });
      }
    }
    return candidates;
  }

  private selectCandidate(
    candidates: readonly Candidate[],
    objective: string,
  ):
    | { readonly ok: true; readonly candidate: Candidate }
    | { readonly ok: false; readonly gaps: readonly SupervisorWorkItemDesignGap[] } {
    if (candidates.length === 0) {
      return { ok: false, gaps: [gap(
        'SUPERVISOR_TASK_TEMPLATE_NOT_AVAILABLE',
        '当前项目没有可执行的已批准任务模板。',
        '返回解决方案设计，发布包含 Agent、Skill、验证策略和任务模板的执行契约。',
        'taskTemplateId',
      )] };
    }
    if (candidates.length === 1) return { ok: true, candidate: candidates[0]! };
    const normalized = normalizeObjective(objective);
    const exact = candidates.filter(({ template }) =>
      normalizeObjective(template.objective) === normalized);
    if (exact.length === 1) return { ok: true, candidate: exact[0]! };
    return { ok: false, gaps: [gap(
      'SUPERVISOR_TASK_TEMPLATE_AMBIGUOUS',
      '当前目标可以对应多个已批准任务模板，系统不会猜测执行拓扑。',
      '明确选择任务模板，或让方案设计收敛为唯一匹配模板后重试。',
      'taskTemplateId',
      candidates.map(({ template }) => template.id).sort().join(','),
    )] };
  }
}
