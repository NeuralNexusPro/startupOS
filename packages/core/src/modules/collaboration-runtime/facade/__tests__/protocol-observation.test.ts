import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SolutionExecutionContractStore } from '../../../../lib/features/solution';
import { body, ontology } from '../../../../lib/features/solution/__tests__/execution-contract-fixtures';
import { CollaborationExecutionStore, type WorkerReceipt } from '../contract-execution';

it('shares run timers across concurrent WorkItems and cancel disposes them without accepting output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 's936-contract-'));
  const contracts = new SolutionExecutionContractStore(root);
  const original = body();
  const publication = await contracts.publishCompiled(ontology(), 'confirmed', {
    ...original,
    topology: { ...original.topology, nodes: [{ ...original.topology.nodes[0]!, id: 'prepare' }, { ...original.topology.nodes[0]!, id: 'prepare2' }, original.topology.nodes[1]!], edges: [...original.topology.edges, { ...original.topology.edges[0]!, fromNodeId: 'prepare2' }] },
    verification: [...original.verification, { ...original.verification[0]!, id: 'verify-second', nodeId: 'prepare2' }],
    semanticContext: { ...original.semanticContext, taskTemplates: [original.semanticContext.taskTemplates[0]!, { ...original.semanticContext.taskTemplates[0]!, id: 'second', designNodeId: 'prepare2' }] },
  });
  if (!publication.ok) throw new Error(JSON.stringify(publication));
  const contract = publication.published.contract;
  const releases: Array<(value: WorkerReceipt) => void> = [];
  const execution = new CollaborationExecutionStore(contracts, root, {
    hostId: 'test-host',
    readiness: { check: async ({ run, workItem }) => ({ status: 'ready', receiptId: 'ready', inputRefs: workItem.inputRefs, grantedPermissions: run.contract.permissions.allowed, targetAvailable: true }) },
    worker: { execute: () => new Promise(resolve => releases.push(resolve)) },
  });
  const run = await execution.start({ projectId: contract.projectId, solutionId: contract.solutionId, solutionVersion: contract.solutionVersion, parentTaskId: 'task', parentStepId: 'step', parentSessionId: 's', taskRevision: 1, executionContractId: contract.contractId, contractHash: contract.contractHash, inputRefs: ['input'] });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const pending = run.workItems.filter(item => item.designNodeId !== 'publish').map(item => execution.executeWorkItem({ runId: run.runId, workItemId: item.id, requestId: item.id, payloadHash: item.id }));
  try {
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    expect(vi.getTimerCount()).toBe(3);
    await execution.cancel(run.runId);
    expect(vi.getTimerCount()).toBe(0);
    for (const release of releases) release({ receiptId: 'worker', outputRefs: ['output'], outputHash: 'hash' });
    await Promise.allSettled(pending);
    const final = await execution.inspect(run.runId);
    expect(final.status).toBe('canceled');
    expect(final.workItems.every(item => item.status !== 'completed')).toBe(true);
    const hostDirs = await readdir(path.join(root, 'projects', contract.projectId, 'collaboration-observations', run.runId));
    const observed = JSON.parse(await readFile(path.join(root, 'projects', contract.projectId, 'collaboration-observations', run.runId, hostDirs[0]!, 'settled.json'), 'utf8'));
    expect(observed.runRevision).toBe(final.revision);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    for (const release of releases) release({ receiptId: 'worker', outputRefs: ['output'], outputHash: 'hash' });
    await Promise.allSettled(pending);
    vi.useRealTimers();
  }
});
