import type {
  CollaborationWorkItem,
  WorkItemAttempt,
  WorkItemWorkerPort,
  WorkerExecutionInput,
  WorkerReceipt,
  WorkItemUsage,
} from '../../../../modules/collaboration-runtime/facade';
import type {
  CanonicalAgentContract,
  CanonicalSkillContract,
} from '../../ontology';
import type {
  SemanticContextContract,
  SolutionContractNode,
  SolutionTaskTemplate,
} from '../../solution';

const SHA256 = /^sha256:[a-f0-9]{64}$/;

export type ContractBoundWorkerTarget =
  | {
      readonly kind: 'agent';
      readonly targetId: string;
      readonly contract: CanonicalAgentContract;
    }
  | {
      readonly kind: 'skill';
      readonly targetId: string;
      readonly contract: CanonicalSkillContract;
    };

export interface ContractBoundWorkerInputRefs {
  readonly all: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly factRefs: readonly string[];
  readonly unresolvedRefs: readonly string[];
}

export interface ContractBoundRuntimeRequest {
  readonly executionKey: string;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly payloadHash: string;
  readonly runId: string;
  readonly workItemId: string;
  readonly attemptId: string;
  readonly leaseEpoch: number;
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly parentSessionId?: string;
  readonly projectId: string;
  readonly contractId: string;
  readonly contractHash: string;
  readonly designNodeId: string;
  readonly target: ContractBoundWorkerTarget;
  readonly objective?: string;
  readonly taskTemplate?: SolutionTaskTemplate;
  readonly semanticContext: SemanticContextContract;
  readonly requiredPermissions: readonly string[];
  readonly inputRefs: ContractBoundWorkerInputRefs;
  readonly expectedOutputRefs: readonly string[];
  readonly checkpointRef?: string;
}

export interface ContractBoundRuntimeResult {
  readonly receiptId: string;
  readonly outputRefs: readonly string[];
  readonly outputHash: string;
  readonly usage: WorkItemUsage;
  readonly checkpointRef?: string;
}

/**
 * Host-facing execution boundary. Implementations create a fresh Agent/Skill
 * runtime for each request.executionKey and must not select a global session.
 */
export interface ContractBoundAgentSkillRuntimePort {
  execute(
    request: ContractBoundRuntimeRequest,
    signal: AbortSignal,
  ): Promise<ContractBoundRuntimeResult>;
}

export class ContractBoundWorkerError extends Error {
  constructor(
    readonly code:
      | 'WORKER_TARGET_INVALID'
      | 'WORKER_TARGET_MISMATCH'
      | 'WORKER_EXECUTION_CONFLICT'
      | 'WORKER_ABORTED'
      | 'WORKER_RESULT_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'ContractBoundWorkerError';
  }
}

interface ActiveExecution {
  readonly idempotencyKey: string;
  readonly controller: AbortController;
  readonly result: Promise<WorkerReceipt>;
}

function classifyInputRefs(refs: readonly string[]): ContractBoundWorkerInputRefs {
  const all = [...refs];
  const artifactRefs = all.filter((ref) => ref.startsWith('artifact://'));
  const factRefs = all.filter((ref) => ref.startsWith('ontology-fact:'));
  const typed = new Set([...artifactRefs, ...factRefs]);
  return {
    all,
    artifactRefs,
    factRefs,
    unresolvedRefs: all.filter((ref) => !typed.has(ref)),
  };
}

function previousCheckpoint(
  workItem: CollaborationWorkItem,
  attempt: WorkItemAttempt,
): string | undefined {
  const current = workItem.attempts.findIndex(
    (candidate) => candidate.attemptId === attempt.attemptId,
  );
  if (current <= 0) {return undefined;}
  for (let index = current - 1; index >= 0; index -= 1) {
    const checkpoint = workItem.attempts[index]?.workerReceipt?.checkpointRef;
    if (checkpoint) {return checkpoint;}
  }
  return undefined;
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new ContractBoundWorkerError(
      'WORKER_RESULT_INVALID',
      `${field} must not be empty`,
    );
  }
}

function resolveTarget(input: WorkerExecutionInput): {
  readonly node: SolutionContractNode;
  readonly target: ContractBoundWorkerTarget;
  readonly taskTemplate?: SolutionTaskTemplate;
} {
  const { contract } = input.run;
  const node = contract.topology.nodes.find(
    (candidate) => candidate.id === input.workItem.designNodeId,
  );
  if (!node) {
    throw new ContractBoundWorkerError(
      'WORKER_TARGET_INVALID',
      `Frozen contract node not found: ${input.workItem.designNodeId}`,
    );
  }

  if (node.kind === 'agent') {
    const target = contract.agents.find(
      (candidate) => candidate.agentId === node.contractRef,
    );
    if (!target) {
      throw new ContractBoundWorkerError(
        'WORKER_TARGET_INVALID',
        `Frozen agent contract not found: ${node.contractRef}`,
      );
    }
    if (
      input.workItem.assignedAgentId !== node.contractRef
      || input.workItem.skillRefs.length !== 0
    ) {
      throw new ContractBoundWorkerError(
        'WORKER_TARGET_MISMATCH',
        'WorkItem target does not match the frozen agent node',
      );
    }
    return {
      node,
      target: { kind: 'agent', targetId: node.contractRef, contract: target },
      taskTemplate: contract.semanticContext.taskTemplates.find(
        (template) => template.designNodeId === node.id,
      ),
    };
  }

  const target = contract.skills.find(
    (candidate) => candidate.skillId === node.contractRef,
  );
  if (!target) {
    throw new ContractBoundWorkerError(
      'WORKER_TARGET_INVALID',
      `Frozen skill contract not found: ${node.contractRef}`,
    );
  }
  if (
    input.workItem.assignedAgentId !== ''
    || input.workItem.skillRefs.length !== 1
    || input.workItem.skillRefs[0] !== node.contractRef
  ) {
    throw new ContractBoundWorkerError(
      'WORKER_TARGET_MISMATCH',
      'WorkItem target does not match the frozen skill node',
    );
  }
  return {
    node,
    target: { kind: 'skill', targetId: node.contractRef, contract: target },
    taskTemplate: contract.semanticContext.taskTemplates.find(
      (template) => template.designNodeId === node.id,
    ),
  };
}

function validateRuntimeResult(
  result: ContractBoundRuntimeResult,
): WorkerReceipt {
  assertNonEmpty(result.receiptId, 'receiptId');
  if (!result.outputRefs.length || result.outputRefs.some((ref) => !ref.trim())) {
    throw new ContractBoundWorkerError(
      'WORKER_RESULT_INVALID',
      'Worker outputRefs must contain non-empty references',
    );
  }
  if (!SHA256.test(result.outputHash)) {
    throw new ContractBoundWorkerError(
      'WORKER_RESULT_INVALID',
      'Worker outputHash must be a sha256 digest',
    );
  }
  if (
    !Number.isFinite(result.usage.durationMs)
    || result.usage.durationMs < 0
    || !Number.isFinite(result.usage.tokens)
    || result.usage.tokens < 0
  ) {
    throw new ContractBoundWorkerError(
      'WORKER_RESULT_INVALID',
      'Worker usage must contain non-negative durationMs and tokens',
    );
  }
  return {
    receiptId: result.receiptId,
    outputRefs: [...result.outputRefs],
    outputHash: result.outputHash,
    usage: { ...result.usage },
    ...(result.checkpointRef
      ? { checkpointRef: result.checkpointRef }
      : {}),
  };
}

/**
 * Converts a frozen collaboration WorkItem into an isolated Agent/Skill
 * runtime request. The adapter owns only execution-local state.
 */
export class ContractBoundAgentSkillWorker implements WorkItemWorkerPort {
  private readonly active = new Map<string, ActiveExecution>();

  constructor(
    private readonly runtime: ContractBoundAgentSkillRuntimePort,
  ) {}

  execute(input: WorkerExecutionInput): Promise<WorkerReceipt> {
    const exactKey = [
      input.run.runId,
      input.workItem.id,
      input.attempt.attemptId,
    ].join(':');
    if (input.executionKey !== exactKey) {
      return Promise.reject(new ContractBoundWorkerError(
        'WORKER_EXECUTION_CONFLICT',
        'Execution key does not identify the frozen run/workItem/attempt',
      ));
    }

    const existing = this.active.get(input.executionKey);
    if (existing) {
      if (existing.idempotencyKey !== input.idempotencyKey) {
        return Promise.reject(new ContractBoundWorkerError(
          'WORKER_EXECUTION_CONFLICT',
          'Execution key is already active with another idempotency key',
        ));
      }
      return existing.result;
    }

    const controller = new AbortController();
    const result = this.executeOnce(input, controller.signal)
      .finally(() => {
        const current = this.active.get(input.executionKey);
        if (current?.result === result) {this.active.delete(input.executionKey);}
      });
    this.active.set(input.executionKey, {
      idempotencyKey: input.idempotencyKey,
      controller,
      result,
    });
    return result;
  }

  abort(executionKey: string): boolean {
    const active = this.active.get(executionKey);
    if (!active) {return false;}
    active.controller.abort();
    return true;
  }

  activeExecutionKeys(): readonly string[] {
    return [...this.active.keys()];
  }

  private async executeOnce(
    input: WorkerExecutionInput,
    signal: AbortSignal,
  ): Promise<WorkerReceipt> {
    const resolved = resolveTarget(input);
    const checkpointRef = previousCheckpoint(input.workItem, input.attempt);
    const request: ContractBoundRuntimeRequest = {
      executionKey: input.executionKey,
      idempotencyKey: input.idempotencyKey,
      requestId: input.attempt.requestId,
      payloadHash: input.attempt.payloadHash,
      runId: input.run.runId,
      workItemId: input.workItem.id,
      attemptId: input.attempt.attemptId,
      leaseEpoch: input.attempt.leaseEpoch,
      parentTaskId: input.run.binding.parentTaskId,
      parentStepId: input.run.binding.parentStepId,
      ...(input.run.binding.parentSessionId
        ? { parentSessionId: input.run.binding.parentSessionId }
        : {}),
      projectId: input.run.projectId,
      contractId: input.run.contract.contractId,
      contractHash: input.run.contract.contractHash,
      designNodeId: resolved.node.id,
      target: structuredClone(resolved.target),
      ...(resolved.taskTemplate
        ? {
            objective: resolved.taskTemplate.objective,
            taskTemplate: structuredClone(resolved.taskTemplate),
          }
        : {}),
      semanticContext: structuredClone(input.run.contract.semanticContext),
      requiredPermissions: [...resolved.target.contract.permissions],
      inputRefs: classifyInputRefs(input.workItem.inputRefs),
      expectedOutputRefs: [...input.workItem.outputRefs],
      ...(checkpointRef ? { checkpointRef } : {}),
    };

    if (signal.aborted) {
      throw new ContractBoundWorkerError('WORKER_ABORTED', 'Worker was aborted');
    }
    const result = await this.runtime.execute(request, signal);
    if (signal.aborted) {
      throw new ContractBoundWorkerError(
        'WORKER_ABORTED',
        'Worker result arrived after abort',
      );
    }
    return validateRuntimeResult(result);
  }
}
