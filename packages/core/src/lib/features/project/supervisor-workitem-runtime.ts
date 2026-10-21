import { createHash } from 'node:crypto';

import type {
  AdvanceSupervisorWorkItemsInput,
  BindSupervisorWorkItemInput,
  BindSupervisorWorkItemResult,
  CollaborationExecutionPort,
  CollaborationRunSnapshot,
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
import type {
  ProjectTaskCreationFactPort,
  ProjectTaskSemanticInput,
} from './project-task-creation';

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
  readonly factPort?: ProjectTaskCreationFactPort;
  readonly executionPort: Pick<
    CollaborationExecutionPort,
    'executeWorkItem' | 'inspect' | 'recover'
  > & Partial<Pick<CollaborationExecutionPort, 'materializeReadyWorkItems'>>;
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

function objectiveTerms(value: string): ReadonlySet<string> {
  const normalized = value
    .toLocaleLowerCase('zh-CN')
    .replace(/[，。！？、；：,.!?;:()[\]{}<>“”'"`~@#$%^&*_+=|\\/-]+/g, ' ');
  const terms = new Set<string>();
  for (const token of normalized.match(/[a-z0-9]+|\p{Script=Han}+/gu) ?? []) {
    if (/^[a-z0-9]+$/.test(token)) {
      if (token.length >= 2) terms.add(token);
      continue;
    }
    for (let size = 2; size <= Math.min(6, token.length); size += 1) {
      for (let index = 0; index + size <= token.length; index += 1) {
        terms.add(token.slice(index, index + size));
      }
    }
  }
  return terms;
}

function longestCommonRun(left: string, right: string): number {
  if (!left || !right) return 0;
  let previous = new Array<number>(right.length + 1).fill(0);
  let longest = 0;
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Array<number>(right.length + 1).fill(0);
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      if (left[leftIndex - 1] !== right[rightIndex - 1]) continue;
      current[rightIndex] = previous[rightIndex - 1]! + 1;
      longest = Math.max(longest, current[rightIndex]!);
    }
    previous = current;
  }
  return longest;
}

function candidateScore(candidate: Candidate, objective: string): number {
  const normalizedObjective = normalizeObjective(objective);
  const template = candidate.template;
  const explicitIds = [template.id, template.designNodeId]
    .map(normalizeObjective)
    .filter(Boolean);
  if (explicitIds.some((id) => normalizedObjective === id
    || normalizedObjective.includes(`模板${id}`)
    || normalizedObjective.includes(`template${id}`))) return 100_000;

  const templateText = `${template.objective} ${template.id} ${template.designNodeId}`;
  const templateTerms = objectiveTerms(templateText);
  let overlap = 0;
  for (const term of objectiveTerms(objective)) {
    if (templateTerms.has(term)) overlap += term.length * term.length;
  }
  const commonRun = longestCommonRun(
    normalizeObjective(template.objective),
    normalizedObjective,
  );
  return overlap + commonRun * commonRun * 2;
}

function attemptPayloadHash(
  snapshot: CollaborationRunSnapshot,
  requestId: string,
  workItemId: string,
): string {
  return `sha256:${createHash('sha256').update(JSON.stringify({
    projectId: snapshot.projectId,
    requestId,
    runId: snapshot.runId,
    workItemId,
    contractHash: snapshot.binding.contractHash,
  })).digest('hex')}`;
}

function attemptRequestId(
  baseRequestId: string,
  designNodeId: string,
  attemptNumber: number,
): string {
  return `${baseRequestId}:work-item:${designNodeId}:attempt:${attemptNumber}`;
}

function runnableItems(
  snapshot: CollaborationRunSnapshot,
  retryNeedsReview = false,
) {
  const completed = new Set(snapshot.workItems
    .filter(({ status }) => status === 'completed')
    .map(({ id }) => id));
  return snapshot.workItems.filter((item) =>
    (
      item.status === 'pending'
      || item.status === 'assigned'
      || (item.status === 'blocked'
        && item.attempts.filter(({ workerReceipt }) => Boolean(workerReceipt)).length
          < snapshot.contract.budget.maxAttempts)
      || (retryNeedsReview
        && item.status === 'needs_review'
        && item.attempts.filter(({ workerReceipt }) => Boolean(workerReceipt)).length
          < snapshot.contract.budget.maxAttempts)
    )
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
    const semanticInputs = await this.resolveSemanticInputs(
      input.projectId,
      selected.candidate,
    );

    const created = await this.dependencies.taskCreation.create({
      projectId: input.projectId,
      solutionId: contract.solutionId,
      solutionVersion: contract.solutionVersion,
      contractId: contract.contractId,
      contractHash: contract.contractHash,
      taskTemplateId: selected.candidate.template.id,
      objective,
      semanticInputs,
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

  private async resolveSemanticInputs(
    projectId: string,
    candidate: Candidate,
  ): Promise<readonly ProjectTaskSemanticInput[]> {
    if (!this.dependencies.factPort) return [];
    const { contract } = candidate.published;
    const agentInputs = candidate.template.candidateAgentIds.flatMap((agentId) =>
      contract.agents.find((agent) => agent.agentId === agentId)?.inputs ?? []);
    const skillInputs = candidate.template.candidateSkillIds.flatMap((skillId) =>
      contract.skills.find((skill) => skill.skillId === skillId)?.inputs ?? []);
    const required = new Map<string, (typeof agentInputs)[number]['factType']>();
    for (const input of [...agentInputs, ...skillInputs]) {
      if (!input.required) continue;
      const { factType } = input;
      required.set([
        factType.ontologyId,
        factType.ontologyVersion,
        factType.conceptId,
        factType.factTypeId,
      ].join('/'), factType);
    }

    const resolved: ProjectTaskSemanticInput[] = [];
    const usedSlots = new Set<string>();
    for (const factType of required.values()) {
      const slot = contract.semanticContext.objectSlots.find(({ concept }) =>
        concept.ontologyId === factType.ontologyId
        && concept.ontologyVersion === factType.ontologyVersion
        && concept.conceptId === factType.conceptId);
      if (!slot || usedSlots.has(slot.id)) continue;
      const result = await this.dependencies.factPort.queryFacts({
        projectId,
        ontologyId: factType.ontologyId,
        ontologyVersion: factType.ontologyVersion,
        conceptId: factType.conceptId,
        factTypeId: factType.factTypeId,
        latestOnly: true,
      });
      if (!result.ok || result.facts.length < 1) continue;
      const latest = result.facts.reduce((left, right) =>
        right.acceptedAt.getTime() >= left.acceptedAt.getTime() ? right : left);
      resolved.push({ slotId: slot.id, factRef: latest.ref });
      usedSlots.add(slot.id);
    }
    return resolved;
  }

  async advance(input: AdvanceSupervisorWorkItemsInput): Promise<CollaborationRunSnapshot> {
    assertIdentifier(input.requestId, 'requestId');
    return this.advanceRun(input.binding.runId, input.requestId);
  }

  async advanceRun(runId: string, requestId: string): Promise<CollaborationRunSnapshot> {
    return this.runScheduler(runId, requestId, false);
  }

  async retryRun(runId: string, requestId: string): Promise<CollaborationRunSnapshot> {
    return this.runScheduler(runId, requestId, true);
  }

  private async runScheduler(
    runId: string,
    requestId: string,
    retryNeedsReview: boolean,
  ): Promise<CollaborationRunSnapshot> {
    assertIdentifier(runId, 'runId');
    assertIdentifier(requestId, 'requestId');
    let snapshot = await this.dependencies.executionPort.recover(runId);
    for (let pass = 0; pass < MAX_SCHEDULER_PASSES; pass += 1) {
      if (this.dependencies.executionPort.materializeReadyWorkItems
        && snapshot.status !== 'canceled'
        && snapshot.status !== 'paused'
        && snapshot.terminalStatus !== 'failed') {
        snapshot = await this.dependencies.executionPort.materializeReadyWorkItems(
          snapshot.runId,
        );
      }
      if (snapshot.terminalStatus || snapshot.status !== 'running') return snapshot;
      const runnable = runnableItems(snapshot, retryNeedsReview);
      if (runnable.length === 0) return snapshot;
      await Promise.all(runnable.map(async (item) => {
        const attemptNumber = item.attempts.length + 1;
        await this.dependencies.executionPort.executeWorkItem({
          runId: snapshot.runId,
          workItemId: item.id,
          requestId: attemptRequestId(requestId, item.designNodeId, attemptNumber),
          payloadHash: attemptPayloadHash(snapshot, requestId, item.id),
        });
      }));
      // 每个 executeWorkItem 返回的快照只代表该次 mutation 完成时的视图。
      // 一轮并行节点全部 settle 后重新读取权威账本，避免用最后返回者的旧视图
      // 覆盖其他并行 WorkItem 的进展。
      snapshot = await this.dependencies.executionPort.inspect(snapshot.runId);
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
    const ranked = candidates
      .map((candidate) => ({ candidate, score: candidateScore(candidate, objective) }))
      .sort((left, right) => right.score - left.score
        || left.candidate.template.id.localeCompare(right.candidate.template.id));
    const best = ranked[0]!;
    const second = ranked[1];
    if (best.score >= 12
      && (!second || best.score >= Math.max(second.score + 8, second.score * 1.25))) {
      return { ok: true, candidate: best.candidate };
    }
    const choices = candidates
      .map(({ template }, index) => `${index + 1}. ${template.objective}`)
      .join('；');
    return { ok: false, gaps: [gap(
      'SUPERVISOR_TASK_TEMPLATE_AMBIGUOUS',
      '我还不能确定你希望从哪项工作开始。',
      `请直接补充更具体的目标，或回复候选工作内容：${choices}`,
      'taskTemplateId',
      candidates.map(({ template }) => template.id).sort().join(','),
    )] };
  }
}
