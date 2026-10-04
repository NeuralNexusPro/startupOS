/**
 * contract-execution-shared — 协作执行账本的常量、领域错误与模块级纯 helper。
 */

import type {
  ContractIntegrityResult,
  SolutionExecutionContract,
} from '../../../lib/features/solution';
import type {
  AttemptStatus,
  CollaborationRunSnapshot,
  CollaborationWorkItem,
  SolutionTaskBinding,
} from './contract-execution-types';

export const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;
export const TERMINAL_ATTEMPT_STATUSES = new Set<AttemptStatus>([
  'completed',
  'revision',
  'blocked',
  'needs_review',
  'failed',
]);
export const DEFAULT_CLAIM_TTL_MS = 30_000;

export class CollaborationReconciliationError extends Error {
  constructor(
    readonly code:
      | 'WORK_ITEM_SCOPE_MISMATCH'
      | 'WORK_ITEM_REVISION_CONFLICT'
      | 'OLD_LEASE_EPOCH'
      | 'UNKNOWN_EXTERNAL_RECEIPT',
    message: string,
  ) {
    super(message);
  }
}

export class CollaborationMutationConflictError extends Error {
  readonly code = 'COLLABORATION_MUTATION_CONFLICT';

  constructor(message: string) {
    super(message);
  }
}

export class CollaborationWorkItemHandoffError extends Error {
  constructor(
    readonly code:
      | 'HANDOFF_SCOPE_MISMATCH'
      | 'HANDOFF_REQUEST_ID_CONFLICT'
      | 'HANDOFF_REVISION_CONFLICT'
      | 'HANDOFF_LEASE_CONFLICT'
      | 'HANDOFF_TARGET_UNAUTHORIZED'
      | 'HANDOFF_TARGET_UNCHANGED'
      | 'HANDOFF_TERMINAL'
      | 'STALE_LEASE_EPOCH',
    message: string,
  ) {
    super(message);
  }
}

export function identifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

export function nonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new TypeError(`${field} must not be empty`);
}

export function assertIntegrity(result: ContractIntegrityResult): void {
  if (result.valid !== true) throw new Error(result.message);
}

export function workItemId(runId: string, designNodeId: string): string {
  return `${runId}:${designNodeId}`;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function updateItem(
  snapshot: CollaborationRunSnapshot,
  item: CollaborationWorkItem,
  timestamp: string,
): CollaborationRunSnapshot {
  return aggregateRun({
    ...snapshot,
    workItems: snapshot.workItems.map((candidate) =>
      candidate.id === item.id ? item : candidate
    ),
    revision: snapshot.revision + 1,
    updatedAt: timestamp,
  });
}

export function aggregateRun(snapshot: CollaborationRunSnapshot): CollaborationRunSnapshot {
  if (snapshot.status === 'canceled' || snapshot.status === 'paused') {
    return snapshot;
  }
  if (
    snapshot.workItems.length > 0
    && snapshot.workItems.every((item) => item.status === 'completed')
  ) {
    return { ...snapshot, terminalStatus: 'completed' };
  }
  if (snapshot.workItems.some((item) => item.status === 'failed')) {
    return { ...snapshot, terminalStatus: 'failed' };
  }
  return { ...snapshot, status: 'running' };
}

export function createWorkItems(
  contract: SolutionExecutionContract,
  binding: SolutionTaskBinding,
  inputRefs: readonly string[],
): CollaborationWorkItem[] {
  const agentById = new Map(contract.agents.map((agent) => [agent.agentId, agent]));
  const skillById = new Map(contract.skills.map((skill) => [skill.skillId, skill]));
  return contract.topology.nodes.map((node) => {
    const incoming = contract.topology.edges
      .filter((edge) => edge.toNodeId === node.id)
      .map((edge) => edge.factType.factTypeId);
    const outputs = node.kind === 'agent'
      ? agentById.get(node.contractRef)?.outputs
      : skillById.get(node.contractRef)?.outputs;
    return {
      id: workItemId(binding.runId, node.id),
      binding,
      designNodeId: node.id,
      assignedAgentId: node.kind === 'agent' ? node.contractRef : '',
      skillRefs: node.kind === 'skill' ? [node.contractRef] : [],
      dependsOn: contract.topology.edges
        .filter((edge) => edge.toNodeId === node.id)
        .map((edge) => workItemId(binding.runId, edge.fromNodeId)),
      inputRefs: incoming.length ? incoming : inputRefs,
      outputRefs: (outputs ?? []).map(({ factType }) => factType.factTypeId),
      status: 'pending',
      revision: 0,
      leaseEpoch: 0,
      attempts: [],
    };
  });
}
