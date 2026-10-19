import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  compileSolutionExecutionContract,
  SolutionOutputAcceptanceError,
  SolutionOutputAcceptanceService,
  type SolutionExecutionContractBody,
} from '../index';
import { body, ontology } from './execution-contract-fixtures';

const ref = {
  projectId: 'project-1',
  solutionId: 'solution-1',
  solutionVersion: 'v1.0',
} as const;

function manifest(status: 'draft' | 'reviewing' | 'confirmed' = 'draft') {
  return {
    version: '1.0.0',
    status,
    solutionId: ref.solutionId,
    solutionVersion: ref.solutionVersion,
    modeling: { dimension: 'task' },
    topologyViews: {
      workflow: {
        nodes: [
          {
            id: 'research',
            type: 'agent',
            contractRef: 'researcher',
            requiresVerification: true,
            hitlPolicyId: 'legacy-offline-approval',
          },
          {
            id: 'publish',
            type: 'skill',
            contractRef: 'publisher',
            requiresVerification: true,
            hitlPolicyId: 'existing-publication-approval',
          },
        ],
        edges: [],
      },
    },
    executionContract: {
      semanticContext: {},
      externalInputs: [],
      verification: [],
      hitl: [
        {
          id: 'legacy-offline-approval',
          nodeId: 'research',
          trigger: 'after_offline_payment',
          approverRole: 'finance-owner',
          schedule: 'daily_after_auto_approval',
        },
        {
          id: 'existing-publication-approval',
          nodeId: 'publish',
          trigger: 'after_verification',
          approverRole: 'user',
        },
      ],
      permissions: { allowed: [] },
      budget: { maxAttempts: 1, maxDurationMs: 1, maxTokens: 1 },
    },
    createdAt: '2026-10-15T00:00:00.000Z',
  };
}

describe('SolutionOutputAcceptanceService', () => {
  let dataRoot: string;
  let versionDirectory: string;
  let service: SolutionOutputAcceptanceService;

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'solution-acceptance-'));
    versionDirectory = path.join(
      dataRoot,
      'projects',
      ref.projectId,
      'solutions',
      ref.solutionVersion
    );
    await fs.mkdir(versionDirectory, { recursive: true });
    await fs.writeFile(
      path.join(versionDirectory, 'agents.json'),
      JSON.stringify({
        agents: [
          { id: 'researcher', name: '调研员' },
          { id: 'reviewer', name: '审核负责人' },
        ],
      })
    );
    service = new SolutionOutputAcceptanceService(dataRoot);
  });

  afterEach(async () => {
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  async function writeManifest(
    status: 'draft' | 'reviewing' | 'confirmed' = 'draft'
  ): Promise<void> {
    await fs.writeFile(
      path.join(versionDirectory, 'manifest.json'),
      `${JSON.stringify(manifest(status), null, 2)}\n`
    );
  }

  it('reads legacy defaults and atomically saves automatic, user and role acceptance', async () => {
    await writeManifest();

    await expect(service.load(ref)).resolves.toEqual(
      expect.objectContaining({
        locked: false,
        published: false,
        roles: [
          { id: 'researcher', name: '调研员' },
          { id: 'reviewer', name: '审核负责人' },
        ],
        nodes: [
          expect.objectContaining({
            nodeId: 'research',
            name: '调研员',
            mode: 'automatic',
          }),
          expect.objectContaining({ nodeId: 'publish', mode: 'user' }),
        ],
      })
    );

    const userSaved = await service.save({
      ...ref,
      nodes: [
        { nodeId: 'research', mode: 'user' },
        { nodeId: 'publish', mode: 'automatic' },
      ],
    });
    expect(userSaved.nodes).toEqual([
      expect.objectContaining({ nodeId: 'research', mode: 'user' }),
      expect.objectContaining({ nodeId: 'publish', mode: 'automatic' }),
    ]);

    const saved = await service.save({
      ...ref,
      nodes: [
        { nodeId: 'research', mode: 'role', approverRole: 'reviewer' },
        { nodeId: 'publish', mode: 'automatic' },
      ],
    });

    expect(saved.nodes).toEqual([
      expect.objectContaining({
        nodeId: 'research',
        mode: 'role',
        approverRole: 'reviewer',
      }),
      expect.objectContaining({ nodeId: 'publish', mode: 'automatic' }),
    ]);
    const stored = JSON.parse(
      await fs.readFile(path.join(versionDirectory, 'manifest.json'), 'utf8')
    ) as ReturnType<typeof manifest>;
    expect(stored.topologyViews.workflow.nodes[0]).toEqual(
      expect.objectContaining({
        hitlPolicyId: 'output-acceptance-research',
      })
    );
    expect(stored.topologyViews.workflow.nodes[1]).not.toHaveProperty(
      'hitlPolicyId'
    );
    expect(stored.executionContract.hitl).toEqual([
      {
        id: 'legacy-offline-approval',
        nodeId: 'research',
        trigger: 'after_offline_payment',
        approverRole: 'finance-owner',
        schedule: 'daily_after_auto_approval',
      },
      {
        id: 'output-acceptance-research',
        nodeId: 'research',
        trigger: 'after_verification',
        approverRole: 'reviewer',
      },
    ]);
    expect(
      (await fs.readdir(versionDirectory)).filter((name) =>
        name.endsWith('.tmp')
      )
    ).toEqual([]);
  });

  it('rejects a designated role that is not part of the solution', async () => {
    await writeManifest();

    await expect(
      service.save({
        ...ref,
        nodes: [
          { nodeId: 'research', mode: 'role', approverRole: 'missing-role' },
          { nodeId: 'publish', mode: 'user' },
        ],
      })
    ).rejects.toMatchObject<SolutionOutputAcceptanceError>({
      code: 'INVALID_ROLE',
      message: expect.stringContaining('research'),
    });
  });

  it('locks confirmed and already published solution versions', async () => {
    await writeManifest('confirmed');
    await expect(
      service.save({
        ...ref,
        nodes: [
          { nodeId: 'research', mode: 'automatic' },
          { nodeId: 'publish', mode: 'user' },
        ],
      })
    ).rejects.toMatchObject({ code: 'SOLUTION_LOCKED' });

    await writeManifest('draft');
    const contracts = path.join(
      dataRoot,
      'projects',
      ref.projectId,
      'solutions',
      'contracts'
    );
    await fs.mkdir(contracts, { recursive: true });
    await fs.writeFile(
      path.join(
        contracts,
        `${ref.solutionId}-${ref.solutionVersion}-contract.json`
      ),
      '{}'
    );
    const snapshot = await service.load(ref);
    expect(snapshot).toEqual(
      expect.objectContaining({ locked: true, published: true })
    );
    await expect(
      service.save({
        ...ref,
        nodes: [
          { nodeId: 'research', mode: 'automatic' },
          { nodeId: 'publish', mode: 'user' },
        ],
      })
    ).rejects.toMatchObject({ code: 'SOLUTION_LOCKED' });
  });

  it('includes output acceptance policy changes in the published contract hash', () => {
    const automatic = body();
    const withUserAcceptance: SolutionExecutionContractBody = {
      ...automatic,
      topology: {
        ...automatic.topology,
        nodes: automatic.topology.nodes.map((node) =>
          node.id === 'prepare'
            ? { ...node, hitlPolicyId: 'approve-prepare-output' }
            : node
        ),
      },
      hitl: [
        ...automatic.hitl,
        {
          id: 'approve-prepare-output',
          nodeId: 'prepare',
          trigger: 'after_verification',
          approverRole: 'user',
        },
      ],
    };
    const first = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      automatic
    );
    const second = compileSolutionExecutionContract(
      ontology(),
      'confirmed',
      withUserAcceptance
    );
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.contract.contractHash).not.toBe(first.contract.contractHash);
  });
});
