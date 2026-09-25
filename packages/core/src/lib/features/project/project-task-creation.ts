import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { CanonicalFactQueryResult, CanonicalFactReference } from '../ontology';
import type {
  DesignGap,
  PublishedSolutionExecutionContract,
  SolutionExecutionContract,
  SolutionExecutionContractPort,
  SolutionTaskTemplate,
} from '../solution';
import type {
  CollaborationExecutionPort,
  CollaborationRunSnapshot,
  SolutionTaskBinding,
} from '../../../modules/collaboration-runtime/facade';
import {
  FileCollaborationMutationLock,
  type CollaborationMutationLockPort,
} from '../../../modules/collaboration-runtime/facade';
import type { ProjectTaskDetail } from './task-board';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;
const LEDGER_SCHEMA_VERSION = 1 as const;

export interface ProjectTaskSemanticInput {
  readonly slotId: string;
  readonly factRef: CanonicalFactReference;
}

export interface CreateApprovedProjectTaskInput {
  readonly projectId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly taskTemplateId: string;
  readonly objective: string;
  readonly semanticInputs: readonly ProjectTaskSemanticInput[];
  readonly requestId: string;
}

export interface ApprovedProjectTaskCreateRequest {
  readonly projectId: string;
  readonly requestId: string;
  readonly title: string;
  readonly objective: string;
  readonly acceptanceCriteria: readonly string[];
  readonly source: {
    readonly solutionId: string;
    readonly solutionVersion: string;
    readonly contractId: string;
    readonly contractHash: string;
    readonly taskTemplateId: string;
  };
}

export interface ApprovedProjectTaskReceipt {
  readonly task: ProjectTaskDetail;
  readonly parentStepId: string;
  readonly parentSessionId?: string;
}

/**
 * Task creation is a separate fact source. Implementations MUST make create()
 * idempotent by projectId+requestId and expose the same receipt through
 * findByRequest() so the coordinator can recover a crash before ledger append.
 */
export interface ApprovedProjectTaskPort {
  findByRequest(
    projectId: string,
    requestId: string,
  ): Promise<ApprovedProjectTaskReceipt | null>;
  create(input: ApprovedProjectTaskCreateRequest): Promise<ApprovedProjectTaskReceipt>;
}

export interface ProjectTaskCreationFactPort {
  queryFacts(query: {
    readonly projectId: string;
    readonly ontologyId: string;
    readonly ontologyVersion: string;
    readonly conceptId?: string;
    readonly factTypeId?: string;
    readonly latestOnly?: boolean;
  }): Promise<CanonicalFactQueryResult>;
}

export interface ApprovedProjectTaskCreationReceipt {
  readonly requestId: string;
  readonly inputHash: string;
  readonly task: ProjectTaskDetail;
  readonly run: CollaborationRunSnapshot;
  readonly binding: SolutionTaskBinding;
  readonly contractId: string;
  readonly contractHash: string;
  readonly taskTemplateId: string;
}

export type CreateApprovedProjectTaskResult =
  | { readonly ok: true; readonly receipt: ApprovedProjectTaskCreationReceipt }
  | { readonly ok: false; readonly gaps: readonly DesignGap[] };

export type ProjectTaskCreationErrorCode =
  | 'INVALID_REQUEST'
  | 'REQUEST_ID_CONFLICT'
  | 'TASK_RECEIPT_INVALID'
  | 'RUN_BINDING_CONFLICT'
  | 'LEDGER_CORRUPTED';

export class ProjectTaskCreationError extends Error {
  constructor(
    readonly code: ProjectTaskCreationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectTaskCreationError';
  }
}

type ProjectTaskCreationStage = 'intent' | 'task_created' | 'run_created' | 'completed';

export interface ProjectTaskCreationOperationRecord {
  readonly schemaVersion: typeof LEDGER_SCHEMA_VERSION;
  readonly projectId: string;
  readonly requestId: string;
  readonly inputHash: string;
  readonly input: CreateApprovedProjectTaskInput;
  readonly stage: ProjectTaskCreationStage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly taskReceipt?: ApprovedProjectTaskReceipt;
  readonly runReceipt?: CollaborationRunSnapshot;
  readonly completedReceipt?: ApprovedProjectTaskCreationReceipt;
}

export class ProjectTaskCreationOperationStore {
  constructor(private readonly dataRoot: string) {}

  async append(record: ProjectTaskCreationOperationRecord): Promise<void> {
    const filePath = this.ledgerPath(record.projectId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  async read(
    projectId: string,
    requestId: string,
  ): Promise<ProjectTaskCreationOperationRecord | null> {
    let raw: string;
    try {
      raw = await fs.readFile(this.ledgerPath(projectId), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    let found: ProjectTaskCreationOperationRecord | null = null;
    for (const line of raw.split('\n').filter(Boolean)) {
      let record: ProjectTaskCreationOperationRecord;
      try {
        record = JSON.parse(line) as ProjectTaskCreationOperationRecord;
      } catch {
        throw new ProjectTaskCreationError(
          'LEDGER_CORRUPTED',
          'Task creation ledger contains invalid JSON',
        );
      }
      if (record.schemaVersion !== LEDGER_SCHEMA_VERSION
        || record.projectId !== projectId) {
        throw new ProjectTaskCreationError(
          'LEDGER_CORRUPTED',
          'Task creation ledger scope or schema is invalid',
        );
      }
      if (record.requestId === requestId) found = record;
    }
    return found;
  }

  private ledgerPath(projectId: string): string {
    assertIdentifier(projectId, 'projectId');
    return path.join(
      this.dataRoot,
      'projects',
      projectId,
      'task-creation',
      'operations.jsonl',
    );
  }
}

interface ContractGateSuccess {
  readonly published: PublishedSolutionExecutionContract;
  readonly contract: SolutionExecutionContract;
  readonly template: SolutionTaskTemplate;
  readonly inputRefs: readonly string[];
}

type ContractGateResult =
  | { readonly ok: true; readonly value: ContractGateSuccess }
  | { readonly ok: false; readonly gaps: readonly DesignGap[] };

export interface ProjectTaskCreationServiceDependencies {
  readonly contractPort: SolutionExecutionContractPort;
  readonly factPort: ProjectTaskCreationFactPort;
  readonly taskPort: ApprovedProjectTaskPort;
  readonly executionPort: Pick<CollaborationExecutionPort, 'start' | 'findByTask'>;
  readonly mutationLock?: CollaborationMutationLockPort;
  readonly clock?: () => Date;
  readonly operationStore?: ProjectTaskCreationOperationStore;
}

function assertIdentifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new ProjectTaskCreationError('INVALID_REQUEST', `Invalid ${field}: ${value}`);
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

function inputHash(input: CreateApprovedProjectTaskInput): string {
  const canonical = {
    ...input,
    semanticInputs: [...input.semanticInputs]
      .sort((left, right) => left.slotId.localeCompare(right.slotId)
        || factRefString(left.factRef).localeCompare(factRefString(right.factRef))),
  };
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableValue(canonical)))
    .digest('hex')}`;
}

function factRefString(ref: CanonicalFactReference): string {
  return [
    'ontology-fact',
    ref.ontologyId,
    ref.ontologyVersion,
    ref.conceptId,
    ref.factTypeId,
    ref.factId,
    ref.factVersion,
  ].join(':');
}

function gap(
  code: string,
  message: string,
  remediation: string,
  pathValue?: string,
  refId?: string,
): DesignGap {
  return {
    code,
    severity: 'error',
    scope: 'contract',
    ...(pathValue ? { path: pathValue } : {}),
    ...(refId ? { refId } : {}),
    message,
    remediation,
  };
}

function sameFactRef(left: CanonicalFactReference, right: CanonicalFactReference): boolean {
  return left.ontologyId === right.ontologyId
    && left.ontologyVersion === right.ontologyVersion
    && left.conceptId === right.conceptId
    && left.factTypeId === right.factTypeId
    && left.factId === right.factId
    && left.factVersion === right.factVersion;
}

function validateInput(input: CreateApprovedProjectTaskInput): void {
  for (const [field, value] of Object.entries({
    projectId: input.projectId,
    solutionId: input.solutionId,
    solutionVersion: input.solutionVersion,
    contractId: input.contractId,
    taskTemplateId: input.taskTemplateId,
    requestId: input.requestId,
  })) assertIdentifier(value, field);
  if (!/^sha256:[a-f0-9]{64}$/i.test(input.contractHash)) {
    throw new ProjectTaskCreationError('INVALID_REQUEST', 'contractHash must be a sha256 digest');
  }
  if (!input.objective.trim()) {
    throw new ProjectTaskCreationError('INVALID_REQUEST', 'objective must not be empty');
  }
  const slots = new Set<string>();
  input.semanticInputs.forEach(({ slotId, factRef }, index) => {
    assertIdentifier(slotId, `semanticInputs[${index}].slotId`);
    if (slots.has(slotId)) {
      throw new ProjectTaskCreationError('INVALID_REQUEST', `Duplicate semantic input slot: ${slotId}`);
    }
    slots.add(slotId);
    for (const [field, value] of Object.entries(factRef)) {
      assertIdentifier(value, `semanticInputs[${index}].factRef.${field}`);
    }
  });
}

function targetsForTemplate(
  contract: SolutionExecutionContract,
  template: SolutionTaskTemplate,
): readonly { readonly permissions: readonly string[]; readonly actionIds: readonly string[] }[] {
  const node = contract.topology.nodes.find(({ id }) => id === template.designNodeId);
  if (!node) return [];
  const agents = template.candidateAgentIds.map((agentId) =>
    contract.agents.find((candidate) => candidate.agentId === agentId));
  const skills = template.candidateSkillIds.map((skillId) =>
    contract.skills.find((candidate) => candidate.skillId === skillId));
  if ([...agents, ...skills].some((target) => !target)) return [];
  const designTargetIncluded = node.kind === 'agent'
    ? template.candidateAgentIds.includes(node.contractRef)
    : template.candidateSkillIds.includes(node.contractRef);
  if (!designTargetIncluded) return [];
  return [...agents, ...skills].flatMap((target) => target ? [{
    permissions: target.permissions,
    actionIds: target.actions.map(({ actionId }) => actionId),
  }] : []);
}

function factState(value: Readonly<Record<string, unknown>>): string | undefined {
  const stateId = value['stateId'];
  return typeof stateId === 'string' ? stateId : undefined;
}

export class ApprovedProjectTaskCreationService {
  private readonly mutationLock: CollaborationMutationLockPort;
  private readonly clock: () => Date;
  private readonly operationStore: ProjectTaskCreationOperationStore;

  constructor(
    dataRoot: string,
    private readonly dependencies: ProjectTaskCreationServiceDependencies,
  ) {
    this.mutationLock = dependencies.mutationLock
      ?? new FileCollaborationMutationLock(dataRoot);
    this.clock = dependencies.clock ?? (() => new Date());
    this.operationStore = dependencies.operationStore
      ?? new ProjectTaskCreationOperationStore(dataRoot);
  }

  async create(
    input: CreateApprovedProjectTaskInput,
  ): Promise<CreateApprovedProjectTaskResult> {
    validateInput(input);
    const hash = inputHash(input);
    const existing = await this.operationStore.read(input.projectId, input.requestId);
    if (existing && existing.inputHash !== hash) {
      throw new ProjectTaskCreationError(
        'REQUEST_ID_CONFLICT',
        `Request ID ${input.requestId} was already used with different input`,
      );
    }
    if (existing?.completedReceipt) {
      return { ok: true, receipt: existing.completedReceipt };
    }
    // Preflight happens before lock acquisition so a DesignGap performs no
    // filesystem mutation (including creation of the lock directory).
    const preflight = await this.validateContractAndInputs(input);
    if (preflight.ok === false) return { ok: false, gaps: preflight.gaps };
    return this.mutationLock.withLock(
      `project-task-creation:${input.projectId}`,
      async () => this.createLocked(input),
    );
  }

  private async createLocked(
    input: CreateApprovedProjectTaskInput,
  ): Promise<CreateApprovedProjectTaskResult> {
    const hash = inputHash(input);
    let operation = await this.operationStore.read(input.projectId, input.requestId);
    if (operation && operation.inputHash !== hash) {
      throw new ProjectTaskCreationError(
        'REQUEST_ID_CONFLICT',
        `Request ID ${input.requestId} was already used with different input`,
      );
    }
    if (operation?.completedReceipt) {
      return { ok: true, receipt: operation.completedReceipt };
    }

    // Every unfinished recovery revalidates the immutable source before another write.
    const gated = await this.validateContractAndInputs(input);
    if (gated.ok === false) return { ok: false, gaps: gated.gaps };

    if (!operation) {
      const timestamp = this.clock().toISOString();
      operation = {
        schemaVersion: LEDGER_SCHEMA_VERSION,
        projectId: input.projectId,
        requestId: input.requestId,
        inputHash: hash,
        input,
        stage: 'intent',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.operationStore.append(operation);
    }

    let taskReceipt = operation.taskReceipt;
    if (!taskReceipt) {
      taskReceipt = await this.dependencies.taskPort.findByRequest(
        input.projectId,
        input.requestId,
      ) ?? await this.dependencies.taskPort.create({
        projectId: input.projectId,
        requestId: input.requestId,
        title: gated.value.template.objective,
        objective: input.objective.trim(),
        acceptanceCriteria: gated.value.contract.verification
          .filter(({ nodeId }) => nodeId === gated.value.template.designNodeId)
          .map(({ id }) => `满足已发布验证策略 ${id}`),
        source: {
          solutionId: input.solutionId,
          solutionVersion: input.solutionVersion,
          contractId: input.contractId,
          contractHash: input.contractHash,
          taskTemplateId: input.taskTemplateId,
        },
      });
      this.assertTaskReceipt(input, taskReceipt);
      operation = await this.advance(operation, {
        stage: 'task_created',
        taskReceipt,
      });
    } else {
      this.assertTaskReceipt(input, taskReceipt);
    }

    // The contract may be revoked between Task creation and Run creation.
    const beforeRun = await this.validateContractAndInputs(input);
    if (beforeRun.ok === false) return { ok: false, gaps: beforeRun.gaps };

    let run = operation.runReceipt;
    if (!run) {
      const existing = await this.dependencies.executionPort.findByTask(
        input.projectId,
        taskReceipt.task.taskId,
      );
      run = existing ?? await this.dependencies.executionPort.start({
        projectId: input.projectId,
        solutionId: input.solutionId,
        solutionVersion: input.solutionVersion,
        parentTaskId: taskReceipt.task.taskId,
        parentStepId: taskReceipt.parentStepId,
        taskRevision: taskReceipt.task.revision,
        executionContractId: input.contractId,
        contractHash: input.contractHash,
        inputRefs: beforeRun.value.inputRefs,
        ...(taskReceipt.parentSessionId
          ? { parentSessionId: taskReceipt.parentSessionId }
          : {}),
      });
      this.assertRun(input, taskReceipt, run);
      operation = await this.advance(operation, {
        stage: 'run_created',
        runReceipt: run,
      });
    } else {
      this.assertRun(input, taskReceipt, run);
    }

    const receipt: ApprovedProjectTaskCreationReceipt = {
      requestId: input.requestId,
      inputHash: hash,
      task: taskReceipt.task,
      run,
      binding: run.binding,
      contractId: input.contractId,
      contractHash: input.contractHash,
      taskTemplateId: input.taskTemplateId,
    };
    await this.advance(operation, {
      stage: 'completed',
      completedReceipt: receipt,
    });
    return { ok: true, receipt };
  }

  private async validateContractAndInputs(
    input: CreateApprovedProjectTaskInput,
  ): Promise<ContractGateResult> {
    const published = await this.dependencies.contractPort.load({
      projectId: input.projectId,
      solutionId: input.solutionId,
      solutionVersion: input.solutionVersion,
    });
    if (!published) {
      return { ok: false, gaps: [gap(
        'EXECUTION_CONTRACT_NOT_PUBLISHED',
        '没有找到精确匹配的已发布执行契约。',
        '返回方案设计并发布该版本的执行契约。',
        'contractId',
        input.contractId,
      )] };
    }
    const { contract } = published;
    const gaps: DesignGap[] = [];
    if (published.revocation) gaps.push(gap(
      'EXECUTION_CONTRACT_REVOKED',
      '执行契约已撤销。',
      '选择仍有效的已发布方案版本。',
      'contractId',
      contract.contractId,
    ));
    if (contract.projectId !== input.projectId
      || contract.solutionId !== input.solutionId
      || contract.solutionVersion !== input.solutionVersion
      || contract.contractId !== input.contractId) {
      gaps.push(gap(
        'EXECUTION_CONTRACT_REFERENCE_MISMATCH',
        '执行契约与请求的项目、方案、版本或 contractId 不完全匹配。',
        '重新选择该项目下的精确已发布契约。',
        'contractId',
        input.contractId,
      ));
    }
    if (contract.status !== 'approved') gaps.push(gap(
      'EXECUTION_CONTRACT_NOT_APPROVED',
      '执行契约尚未批准。',
      '完成方案确认后重新发布。',
      'status',
    ));
    if (contract.contractHash !== input.contractHash) gaps.push(gap(
      'EXECUTION_CONTRACT_HASH_MISMATCH',
      '执行契约 hash 与请求不一致。',
      '刷新已发布契约后重试。',
      'contractHash',
    ));
    const integrity = await this.dependencies.contractPort.verifyIntegrity(contract);
    if (integrity.valid === false) gaps.push(gap(
      `EXECUTION_CONTRACT_${integrity.code}`,
      integrity.message,
      '返回方案设计并重新发布完整契约。',
      'contractHash',
    ));
    const template = contract.semanticContext.taskTemplates.find(
      ({ id }) => id === input.taskTemplateId,
    );
    if (!template) gaps.push(gap(
      'TASK_TEMPLATE_NOT_FOUND',
      '请求未匹配已发布的任务模板。',
      '选择一个已发布 taskTemplate，不允许临时生成拓扑。',
      'taskTemplateId',
      input.taskTemplateId,
    ));
    if (gaps.length || !template) return { ok: false, gaps };

    const targets = targetsForTemplate(contract, template);
    if (targets.length !== template.candidateAgentIds.length
      + template.candidateSkillIds.length
      || targets.length < 1) gaps.push(gap(
      'TASK_TEMPLATE_TARGET_INVALID',
      '任务模板未精确绑定 frozen topology 中的候选 Agent/Skill。',
      '修复模板候选目标并重新发布契约。',
      'taskTemplateId',
      template.id,
    ));
    for (const target of targets) {
      const deniedPermission = target.permissions.find(
        (permission) => !contract.permissions.allowed.includes(permission),
      );
      if (deniedPermission) gaps.push(gap(
        'TASK_TEMPLATE_PERMISSION_DENIED',
        `目标所需权限 ${deniedPermission} 未包含在契约允许集合中。`,
        '在方案设计中显式批准精确权限后重新发布。',
        'permissions.allowed',
        deniedPermission,
      ));
      const disallowedAction = target.actionIds.find(
        (actionId) => !contract.semanticContext.allowedActionIds.includes(actionId),
      );
      if (target.actionIds.length < 1 || disallowedAction) gaps.push(gap(
        'TASK_TEMPLATE_ACTION_DENIED',
        disallowedAction
          ? `目标 Action ${disallowedAction} 未被语义上下文允许。`
          : '目标没有已发布 Action。',
        '在方案设计中补齐并批准 Action。',
        'semanticContext.allowedActionIds',
        disallowedAction,
      ));
    }
    const node = contract.topology.nodes.find(({ id }) => id === template.designNodeId);
    if (node?.requiresVerification) {
      const policies = contract.verification.filter(({ nodeId }) => node.id === nodeId);
      if (policies.length !== 1
        || !policies[0]!.verifierRef.trim()
        || !policies[0]!.evidenceSchemaRef.trim()) {
        gaps.push(gap(
          'TASK_TEMPLATE_VERIFICATION_POLICY_INVALID',
          '任务模板缺少唯一、完整的 verifier/evidence policy。',
          '补齐验证器和证据 schema 后重新发布契约。',
          'verification',
          node.id,
        ));
      }
    }

    const bySlot = new Map(input.semanticInputs.map((semanticInput) => [
      semanticInput.slotId,
      semanticInput.factRef,
    ]));
    for (const slot of contract.semanticContext.objectSlots) {
      const ref = bySlot.get(slot.id);
      if (slot.required && !ref) gaps.push(gap(
        'REQUIRED_SEMANTIC_OBJECT_MISSING',
        `缺少必填语义对象 ${slot.id}。`,
        '绑定与该 slot 概念完全匹配的 canonical fact。',
        `semanticInputs.${slot.id}`,
        slot.id,
      ));
      if (ref && (ref.ontologyId !== slot.concept.ontologyId
        || ref.ontologyVersion !== slot.concept.ontologyVersion
        || ref.conceptId !== slot.concept.conceptId)) {
        gaps.push(gap(
          'SEMANTIC_OBJECT_BINDING_MISMATCH',
          `语义对象 ${slot.id} 与契约概念不匹配。`,
          '选择相同 ontology/version/concept 的事实。',
          `semanticInputs.${slot.id}`,
          slot.id,
        ));
      }
    }
    for (const semanticInput of input.semanticInputs) {
      if (!contract.semanticContext.objectSlots.some(({ id }) => id === semanticInput.slotId)) {
        gaps.push(gap(
          'SEMANTIC_OBJECT_SLOT_UNKNOWN',
          `未知语义对象 slot ${semanticInput.slotId}。`,
          '仅提交已发布契约声明的 slot。',
          `semanticInputs.${semanticInput.slotId}`,
          semanticInput.slotId,
        ));
      }
    }
    for (const expected of contract.topology.externalInputs) {
      if (!input.semanticInputs.some(({ factRef }) =>
        factRef.ontologyId === expected.ontologyId
        && factRef.ontologyVersion === expected.ontologyVersion
        && factRef.conceptId === expected.conceptId
        && factRef.factTypeId === expected.factTypeId)) {
        gaps.push(gap(
          'EXTERNAL_FACT_INPUT_MISSING',
          `缺少外部 FactType ${expected.factTypeId} 的精确输入。`,
          '绑定该 ontology/version/concept/factType 的 canonical fact。',
          'semanticInputs',
          expected.factTypeId,
        ));
      }
    }
    if (gaps.length) return { ok: false, gaps };

    for (const [index, semanticInput] of input.semanticInputs.entries()) {
      const result = await this.dependencies.factPort.queryFacts({
        projectId: input.projectId,
        ontologyId: semanticInput.factRef.ontologyId,
        ontologyVersion: semanticInput.factRef.ontologyVersion,
        conceptId: semanticInput.factRef.conceptId,
        factTypeId: semanticInput.factRef.factTypeId,
      });
      if (!result.ok) {
        gaps.push(gap(
          'SEMANTIC_FACT_QUERY_REJECTED',
          `语义输入 ${semanticInput.slotId} 无法通过 canonical ontology 校验。`,
          '修复 ontology/version/fact binding 后重试。',
          `semanticInputs[${index}]`,
          semanticInput.factRef.factId,
        ));
        continue;
      }
      const fact = result.facts.find(({ ref }) => sameFactRef(ref, semanticInput.factRef));
      if (!fact) {
        gaps.push(gap(
          'SEMANTIC_FACT_NOT_FOUND',
          `语义输入 ${semanticInput.slotId} 引用的事实不存在。`,
          '选择已接纳且版本精确匹配的 canonical fact。',
          `semanticInputs[${index}].factRef`,
          semanticInput.factRef.factId,
        ));
        continue;
      }
      const policy = contract.semanticContext.factPolicies.find(({ factType }) =>
        factType.ontologyId === fact.ref.ontologyId
        && factType.ontologyVersion === fact.ref.ontologyVersion
        && factType.conceptId === fact.ref.conceptId
        && factType.factTypeId === fact.ref.factTypeId);
      if (!policy) {
        gaps.push(gap(
          'SEMANTIC_FACT_POLICY_MISSING',
          `FactType ${fact.ref.factTypeId} 缺少状态/新鲜度策略。`,
          '在语义契约中声明 factPolicy 后重新发布。',
          'semanticContext.factPolicies',
          fact.ref.factTypeId,
        ));
        continue;
      }
      if (policy.state.mode === 'required'
        && !policy.state.stateIds.includes(factState(fact.value) ?? '')) {
        gaps.push(gap(
          'SEMANTIC_FACT_STATE_REJECTED',
          `事实 ${fact.ref.factId} 不满足允许状态。`,
          '选择满足契约状态门的事实。',
          `semanticInputs[${index}].factRef`,
          fact.ref.factId,
        ));
      }
      if (policy.freshness.mode === 'max_age'
        && this.clock().getTime() - fact.acceptedAt.getTime() > policy.freshness.maxAgeMs) {
        gaps.push(gap(
          'SEMANTIC_FACT_STALE',
          `事实 ${fact.ref.factId} 已超过契约允许的新鲜度。`,
          '刷新事实后重试。',
          `semanticInputs[${index}].factRef`,
          fact.ref.factId,
        ));
      }
    }
    return gaps.length
      ? { ok: false, gaps }
      : {
          ok: true,
          value: {
            published,
            contract,
            template,
            inputRefs: input.semanticInputs.map(({ factRef }) => factRefString(factRef)),
          },
        };
  }

  private assertTaskReceipt(
    input: CreateApprovedProjectTaskInput,
    receipt: ApprovedProjectTaskReceipt,
  ): void {
    if (receipt.task.projectId !== input.projectId
      || !receipt.task.taskId
      || receipt.task.revision < 0
      || !receipt.parentStepId) {
      throw new ProjectTaskCreationError(
        'TASK_RECEIPT_INVALID',
        'Task creation receipt does not match the project scope',
      );
    }
  }

  private assertRun(
    input: CreateApprovedProjectTaskInput,
    task: ApprovedProjectTaskReceipt,
    run: CollaborationRunSnapshot,
  ): void {
    if (run.projectId !== input.projectId
      || run.binding.parentTaskId !== task.task.taskId
      || run.binding.parentStepId !== task.parentStepId
      || run.binding.executionContractId !== input.contractId
      || run.binding.contractHash !== input.contractHash
      || run.binding.solutionId !== input.solutionId
      || run.binding.solutionVersion !== input.solutionVersion) {
      throw new ProjectTaskCreationError(
        'RUN_BINDING_CONFLICT',
        'Existing Run binding does not match the approved Task creation request',
      );
    }
  }

  private async advance(
    operation: ProjectTaskCreationOperationRecord,
    update: Pick<ProjectTaskCreationOperationRecord, 'stage'>
      & Partial<Pick<ProjectTaskCreationOperationRecord,
        'taskReceipt' | 'runReceipt' | 'completedReceipt'>>,
  ): Promise<ProjectTaskCreationOperationRecord> {
    const next: ProjectTaskCreationOperationRecord = {
      ...operation,
      ...update,
      updatedAt: this.clock().toISOString(),
    };
    await this.operationStore.append(next);
    return next;
  }

}
