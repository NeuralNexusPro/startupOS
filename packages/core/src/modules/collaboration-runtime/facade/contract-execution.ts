import { randomUUID } from 'node:crypto';
import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';

import { getDataRoot } from '../../../lib/paths';
import type {
  ContractIntegrityResult,
  SolutionExecutionContract,
  SolutionExecutionContractPort,
  SolutionVersionRef,
} from '../../../lib/features/solution';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;

export interface SolutionTaskBinding {
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly runId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly executionContractId: string;
  readonly contractHash: string;
  readonly taskRevision: number;
}

export interface CollaborationWorkItem {
  readonly id: string;
  readonly binding: SolutionTaskBinding;
  readonly designNodeId: string;
  readonly assignedAgentId: string;
  readonly skillRefs: readonly string[];
  readonly dependsOn: readonly string[];
  readonly inputRefs: readonly string[];
  readonly outputRefs: readonly string[];
  status:
    | 'pending'
    | 'assigned'
    | 'running'
    | 'verifying'
    | 'revision'
    | 'completed'
    | 'failed'
    | 'blocked'
    | 'reported';
  revision: number;
}

export interface CollaborationRunSnapshot {
  readonly runId: string;
  readonly projectId: string;
  readonly binding: SolutionTaskBinding;
  readonly contract: SolutionExecutionContract;
  readonly workItems: readonly CollaborationWorkItem[];
  status: 'running' | 'paused' | 'canceled';
  revision: number;
  readonly createdAt: string;
  updatedAt: string;
}

export interface StartCollaborationRunInput extends SolutionVersionRef {
  readonly parentTaskId: string;
  readonly parentStepId: string;
  readonly taskRevision: number;
  readonly executionContractId: string;
  readonly contractHash: string;
  readonly inputRefs: readonly string[];
}

export interface CollaborationExecutionPort {
  start(input: StartCollaborationRunInput): Promise<CollaborationRunSnapshot>;
  inspect(runId: string): Promise<CollaborationRunSnapshot>;
  pause(runId: string): Promise<CollaborationRunSnapshot>;
  resume(runId: string): Promise<CollaborationRunSnapshot>;
  cancel(runId: string): Promise<CollaborationRunSnapshot>;
}

function identifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

function assertIntegrity(result: ContractIntegrityResult): void {
  if (result.valid !== true) throw new Error(result.message);
}

function workItemId(runId: string, designNodeId: string): string {
  return `${runId}:${designNodeId}`;
}

function createWorkItems(
  contract: SolutionExecutionContract,
  binding: SolutionTaskBinding,
  inputRefs: readonly string[]
): CollaborationWorkItem[] {
  const agentById = new Map(contract.agents.map((agent) => [agent.agentId, agent]));
  const skillById = new Map(contract.skills.map((skill) => [skill.skillId, skill]));
  return contract.topology.nodes.map((node) => {
    const incoming = contract.topology.edges
      .filter((edge) => edge.toNodeId === node.id)
      .map((edge) => edge.factType.factTypeId);
    const contractOutputs =
      node.kind === 'agent'
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
      outputRefs: (contractOutputs ?? []).map(({ factType }) => factType.factTypeId),
      status: 'pending',
      revision: 0,
    };
  });
}

export class CollaborationExecutionStore implements CollaborationExecutionPort {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly contractPort: SolutionExecutionContractPort,
    private readonly dataRoot = getDataRoot()
  ) {}

  async start(input: StartCollaborationRunInput): Promise<CollaborationRunSnapshot> {
    for (const [field, value] of Object.entries(input)) {
      if (typeof value === 'string') identifier(value, field);
    }
    if (!Number.isInteger(input.taskRevision) || input.taskRevision < 0) {
      throw new TypeError('taskRevision must be a non-negative integer');
    }
    const published = await this.contractPort.load(input);
    if (!published) throw new Error('Execution contract not found');
    if (published.revocation) throw new Error('Execution contract is revoked');
    const { contract } = published;
    if (
      contract.projectId !== input.projectId ||
      contract.solutionId !== input.solutionId ||
      contract.solutionVersion !== input.solutionVersion
    ) {
      throw new Error('Execution contract reference does not match the request');
    }
    if (contract.status !== 'approved') throw new Error('Execution contract is not approved');
    if (contract.contractId !== input.executionContractId) {
      throw new Error('Execution contract ID does not match the task binding');
    }
    if (contract.contractHash !== input.contractHash) {
      throw new Error('Execution contract hash does not match the task binding');
    }
    assertIntegrity(await this.contractPort.verifyIntegrity(contract));

    const now = new Date().toISOString();
    const runId = `run-${randomUUID()}`;
    const binding: SolutionTaskBinding = {
      parentTaskId: input.parentTaskId,
      parentStepId: input.parentStepId,
      runId,
      solutionId: contract.solutionId,
      solutionVersion: contract.solutionVersion,
      executionContractId: contract.contractId,
      contractHash: contract.contractHash,
      taskRevision: input.taskRevision,
    };
    const snapshot: CollaborationRunSnapshot = {
      runId,
      projectId: input.projectId,
      binding,
      contract,
      workItems: createWorkItems(contract, binding, input.inputRefs),
      status: 'running',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const filePath = this.runPath(input.projectId, runId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    try {
      await fs.link(temporary, filePath);
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
    return snapshot;
  }

  async inspect(runId: string): Promise<CollaborationRunSnapshot> {
    identifier(runId, 'runId');
    return this.readRun(runId);
  }

  async pause(runId: string): Promise<CollaborationRunSnapshot> {
    return this.transition(runId, 'paused', ['running']);
  }

  async resume(runId: string): Promise<CollaborationRunSnapshot> {
    return this.transition(runId, 'running', ['paused']);
  }

  async cancel(runId: string): Promise<CollaborationRunSnapshot> {
    return this.transition(runId, 'canceled', ['running', 'paused']);
  }

  private async transition(
    runId: string,
    status: CollaborationRunSnapshot['status'],
    allowed: readonly CollaborationRunSnapshot['status'][]
  ): Promise<CollaborationRunSnapshot> {
    identifier(runId, 'runId');
    return this.enqueue(runId, async () => {
      const snapshot = await this.readRun(runId);
      if (!allowed.includes(snapshot.status)) {
        throw new Error(`Cannot transition ${snapshot.status} run to ${status}`);
      }
      const updated: CollaborationRunSnapshot = {
        ...snapshot,
        status,
        revision: snapshot.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      await this.writeRun(updated);
      return updated;
    });
  }

  private async readRun(runId: string): Promise<CollaborationRunSnapshot> {
    let directories: Dirent[];
    try {
      directories = await fs.readdir(path.join(this.dataRoot, 'projects'), {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Collaboration run not found: ${runId}`);
      }
      throw error;
    }
    for (const directory of directories) {
      if (!directory.isDirectory()) continue;
      const filePath = this.runPath(directory.name, runId);
      try {
        const snapshot = JSON.parse(
          await fs.readFile(filePath, 'utf8')
        ) as CollaborationRunSnapshot;
        if (snapshot.runId !== runId) throw new Error('Run ID does not match its ledger');
        assertIntegrity(await this.contractPort.verifyIntegrity(snapshot.contract));
        return snapshot;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new Error(`Collaboration run not found: ${runId}`);
  }

  private async writeRun(snapshot: CollaborationRunSnapshot): Promise<void> {
    const filePath = this.runPath(snapshot.projectId, snapshot.runId);
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    try {
      await fs.rename(temporary, filePath);
    } finally {
      await fs.unlink(temporary).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    }
  }

  private runPath(projectId: string, runId: string): string {
    identifier(projectId, 'projectId');
    identifier(runId, 'runId');
    return path.join(
      this.dataRoot,
      'projects',
      projectId,
      'collaboration-runs',
      `${runId}.json`
    );
  }

  private async enqueue<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const queued = this.queues.get(key)?.then(operation, operation) ?? operation();
    this.queues.set(key, queued);
    try {
      return await queued;
    } finally {
      if (this.queues.get(key) === queued) this.queues.delete(key);
    }
  }
}
