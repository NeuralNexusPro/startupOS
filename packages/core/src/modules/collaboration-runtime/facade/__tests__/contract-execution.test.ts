import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  SolutionExecutionContractStore,
} from '../../../../lib/features/solution';
import {
  body,
  ontology,
} from '../../../../lib/features/solution/__tests__/execution-contract-fixtures';
import { CollaborationExecutionStore } from '../contract-execution';
import type { SolutionExecutionContract } from '../../../../lib/features/solution';

async function setup(): Promise<{
  contract: SolutionExecutionContract;
  contractStore: SolutionExecutionContractStore;
  execution: CollaborationExecutionStore;
}> {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'collaboration-run-'));
  const contractStore = new SolutionExecutionContractStore(dataRoot);
  const publication = await contractStore.publishCompiled(
    ontology(),
    'confirmed',
    body()
  );
  expect(publication.ok).toBe(true);
  if (!publication.ok) throw new Error('Fixture contract must publish');
  return {
    contract: publication.published.contract,
    contractStore,
    execution: new CollaborationExecutionStore(contractStore, dataRoot),
  };
}

function startInput(contract: SolutionExecutionContract) {
  return {
    projectId: contract.projectId,
    solutionId: contract.solutionId,
    solutionVersion: contract.solutionVersion,
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    taskRevision: 1,
    executionContractId: contract.contractId,
    contractHash: contract.contractHash,
    inputRefs: ['input-1'],
  };
}

describe('contract-bound collaboration execution', () => {
  it('starts a run from the exact approved contract and instantiates WorkItems', async () => {
    const { contract, execution } = await setup();
    const snapshot = await execution.start(startInput(contract));
    const prepare = snapshot.workItems.find(
      (workItem) => workItem.designNodeId === 'prepare'
    );
    const publish = snapshot.workItems.find(
      (workItem) => workItem.designNodeId === 'publish'
    );

    expect(snapshot.binding.executionContractId).toBe(contract.contractId);
    expect(snapshot.binding.contractHash).toBe(contract.contractHash);
    expect(snapshot.workItems).toHaveLength(2);
    expect(prepare?.assignedAgentId).toBe('preparer');
    expect(prepare?.dependsOn).toEqual([]);
    expect(publish?.skillRefs).toEqual(['publisher']);
    expect(publish?.dependsOn).toEqual([prepare?.id]);
    expect(publish?.inputRefs).toEqual(['order-ready']);
    await expect(execution.inspect(snapshot.runId)).resolves.toEqual(snapshot);
  });

  it('rejects revoked and hash-mismatched contracts before creating a run', async () => {
    const { contract, contractStore, execution } = await setup();
    await contractStore.revoke(
      {
        projectId: contract.projectId,
        solutionId: contract.solutionId,
        solutionVersion: contract.solutionVersion,
        contractId: contract.contractId,
      },
      'Retired'
    );
    await expect(execution.start(startInput(contract))).rejects.toThrow(
      /revoked/
    );

    const valid = await setup();
    const mismatch = {
      ...startInput(valid.contract),
      contractHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    };
    await expect(valid.execution.start(mismatch)).rejects.toThrow(
      /hash does not match/
    );
  });

  it('persists run transitions and resumes the frozen snapshot', async () => {
    const { contract, execution } = await setup();
    const snapshot = await execution.start(startInput(contract));

    const paused = await execution.pause(snapshot.runId);
    expect(paused.status).toBe('paused');
    expect(paused.revision).toBe(snapshot.revision + 1);
    const resumed = await execution.resume(snapshot.runId);
    expect(resumed.status).toBe('running');
    expect(resumed.contract).toEqual(snapshot.contract);
    const canceled = await execution.cancel(snapshot.runId);
    expect(canceled.status).toBe('canceled');
    await expect(execution.resume(snapshot.runId)).rejects.toThrow(
      /Cannot transition/
    );
  });
});
