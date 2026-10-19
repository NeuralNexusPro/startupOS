import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CanonicalOntologyStore } from '../../ontology';
import {
  body,
  ontology,
} from '../../solution/__tests__/execution-contract-fixtures';
import {
  SolutionMaterializationError,
  SolutionMaterializationTaskService,
} from '../solution-materialization-service';

import type { SolutionVersionRef } from '../../solution';

const reference: SolutionVersionRef = {
  projectId: 'project-1',
  solutionId: 'orders-solution',
  solutionVersion: '1.0',
};

interface BundleFixture {
  readonly manifest: Record<string, unknown>;
  readonly agents: Record<string, unknown>;
  readonly skills: Record<string, unknown>;
}

async function fixtureRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'solution-materialization-'));
}

function bundle(
  status: 'draft' | 'confirmed' = 'confirmed'
): BundleFixture {
  const contract = body();
  return {
    manifest: {
      version: '1.0.0',
      status,
      solutionVersion: reference.solutionVersion,
      modeling: { dimension: 'task' },
      topologyViews: {
        workflow: {
          nodes: contract.topology.nodes.map((node) => ({
            id: node.id,
            type: node.kind,
            contractRef: node.contractRef,
            requiresVerification: node.requiresVerification,
            ...(node.hitlPolicyId ? { hitlPolicyId: node.hitlPolicyId } : {}),
          })),
          edges: contract.topology.edges.map((edge) => ({
            source: edge.fromNodeId,
            target: edge.toNodeId,
            factType: edge.factType,
          })),
        },
      },
      executionContract: {
        semanticContext: contract.semanticContext,
        externalInputs: contract.topology.externalInputs,
        verification: contract.verification,
        hitl: contract.hitl,
        permissions: contract.permissions,
        budget: contract.budget,
      },
      createdAt: contract.createdAt,
    },
    agents: {
      version: '1.0.0',
      status,
      solutionVersion: reference.solutionVersion,
      agents: contract.agents.map((agent) => ({
        id: agent.agentId,
        name: agent.agentId,
        type: 'agent',
        skills: ['publisher'],
        contract: agent,
      })),
    },
    skills: {
      version: '1.0.0',
      status,
      solutionVersion: reference.solutionVersion,
      skills: contract.skills.map((skill) => ({
        id: skill.skillId,
        name: skill.skillId,
        code: skill.skillId,
        agentId: contract.agents[0].agentId,
        contract: skill,
      })),
    },
  };
}

async function writeBundle(root: string, status: 'draft' | 'confirmed' = 'confirmed'): Promise<void> {
  const directory = path.join(root, 'projects', reference.projectId, 'solutions', reference.solutionVersion);
  const value = bundle(status);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, 'manifest.json'), JSON.stringify(value.manifest), 'utf8'),
    writeFile(path.join(directory, 'agents.json'), JSON.stringify(value.agents), 'utf8'),
    writeFile(path.join(directory, 'skills.json'), JSON.stringify(value.skills), 'utf8'),
    new CanonicalOntologyStore(root).writeOntology(reference.projectId, ontology()),
  ]);
}

async function writeAgentArtifacts(root: string): Promise<void> {
  const directory = path.join(root, 'projects', reference.projectId, 'agents', 'preparer');
  await mkdir(directory, { recursive: true });
  await Promise.all(
    ['Agent.md', 'Data.md', 'Process.md', 'Memory.md', 'Taste.md'].map((name) =>
      writeFile(path.join(directory, name), `# ${name}\n`, 'utf8')
    )
  );
  await writeFile(
    path.join(directory, 'Tool.md'),
    '# Skills\n- skills/publisher/SKILL.md\n',
    'utf8'
  );
}

async function writeSkillArtifacts(root: string, includeReference = true): Promise<void> {
  const directory = path.join(
    root,
    'projects',
    reference.projectId,
    'agents',
    'preparer',
    'skills',
    'publisher'
  );
  await mkdir(path.join(directory, 'references'), { recursive: true });
  const contract = body().skills[0];
  await writeFile(
    path.join(directory, 'SKILL.md'),
    `---\nname: publisher\ncontract: ${JSON.stringify(contract)}\n---\n\nSee references/ontology-tools.md\n`,
    'utf8'
  );
  if (includeReference) {
    await writeFile(
      path.join(directory, 'references', 'ontology-tools.md'),
      '# Ontology tools\n',
      'utf8'
    );
  }
}

async function claim(
  service: SolutionMaterializationTaskService,
  revision: number,
  now?: string
): Promise<Awaited<ReturnType<SolutionMaterializationTaskService['claimNextStep']>>> {
  return service.claimNextStep({
    ...reference,
    workerId: 'worker-1',
    expectedRevision: revision,
    ...(now ? { now } : {}),
  });
}

describe('SolutionMaterializationTaskService', () => {
  it('freezes the confirmed bundle and plans internal Agent, Skill and validation steps idempotently', async () => {
    const root = await fixtureRoot();
    await writeBundle(root);
    const service = new SolutionMaterializationTaskService(root);

    const first = await service.startTask(reference);
    const second = await service.startTask(reference);

    expect(first.recovered).toBe(false);
    expect(second).toEqual({ task: first.task, recovered: true });
    expect(first.task.steps.map(({ id }) => id)).toEqual([
      'agent:preparer',
      'skill:publisher',
      'validation:final',
    ]);
    expect(first.task.input.files.map(({ file }) => file)).toEqual([
      'manifest.json',
      'agents.json',
      'skills.json',
    ]);
    expect(first.task).not.toHaveProperty('projectTaskId');
    expect(first.task).not.toHaveProperty('runId');
    expect(first.task).not.toHaveProperty('workItemId');
    await expect(
      readFile(
        path.join(root, 'projects', reference.projectId, 'solutions', '1.0', 'materialization-task.json'),
        'utf8'
      )
    ).resolves.toContain('solution-materialization:project-1:orders-solution:1.0');
  });

  it('rejects unconfirmed inputs without creating a ledger', async () => {
    const root = await fixtureRoot();
    await writeBundle(root, 'draft');
    const service = new SolutionMaterializationTaskService(root);

    await expect(service.startTask(reference)).rejects.toMatchObject({
      code: 'SOLUTION_NOT_CONFIRMED',
    });
    await expect(service.getTask(reference)).resolves.toBeNull();
  });

  it('uses revision and claim tokens and detects changes to frozen input', async () => {
    const root = await fixtureRoot();
    await writeBundle(root);
    const service = new SolutionMaterializationTaskService(root);
    const { task } = await service.startTask(reference);
    const claimed = await claim(service, task.revision);

    await expect(claim(service, task.revision)).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    await expect(
      service.completeStep({
        ...reference,
        stepId: claimed.step.id,
        claimToken: 'wrong-token',
        expectedRevision: claimed.task.revision,
      })
    ).rejects.toMatchObject({ code: 'CLAIM_TOKEN_MISMATCH' });

    const manifestPath = path.join(root, 'projects', reference.projectId, 'solutions', '1.0', 'manifest.json');
    await writeFile(manifestPath, `${await readFile(manifestPath, 'utf8')}\n`, 'utf8');
    await expect(
      service.failStep({
        ...reference,
        stepId: claimed.step.id,
        claimToken: claimed.step.claim?.token ?? '',
        expectedRevision: claimed.task.revision,
        error: 'generation failed',
      })
    ).rejects.toMatchObject({ code: 'INPUT_CHANGED' });
  });

  it('recovers expired claims and retries only a failed step', async () => {
    const root = await fixtureRoot();
    await writeBundle(root);
    await writeAgentArtifacts(root);
    const service = new SolutionMaterializationTaskService(root);
    const started = await service.startTask(reference);
    const firstClaim = await service.claimNextStep({
      ...reference,
      workerId: 'worker-1',
      expectedRevision: started.task.revision,
      now: '2026-10-15T00:00:00.000Z',
      claimTtlMs: 1000,
    });
    const recovered = await service.recoverTask({
      ...reference,
      expectedRevision: firstClaim.task.revision,
      now: '2026-10-15T00:00:02.000Z',
    });
    expect(recovered.steps[0]).toMatchObject({ status: 'pending', attempts: 1 });

    const agentClaim = await claim(service, recovered.revision);
    const agentComplete = await service.completeStep({
      ...reference,
      stepId: agentClaim.step.id,
      claimToken: agentClaim.step.claim?.token ?? '',
      expectedRevision: agentClaim.task.revision,
    });
    const skillClaim = await claim(service, agentComplete.revision);
    const failed = await service.failStep({
      ...reference,
      stepId: skillClaim.step.id,
      claimToken: skillClaim.step.claim?.token ?? '',
      expectedRevision: skillClaim.task.revision,
      error: 'creator returned an empty response',
    });
    expect(failed.status).toBe('failed');

    const retried = await service.recoverTask({
      ...reference,
      expectedRevision: failed.revision,
      retryFailed: true,
    });
    const next = await claim(service, retried.revision);
    expect(next.step).toMatchObject({ id: 'skill:publisher', attempts: 2 });
    expect(next.task.steps[0]).toMatchObject({ status: 'completed', attempts: 2 });
  });

  it('marks complete only after deterministic artifact, contract, reference and Agent Skill checks pass', async () => {
    const root = await fixtureRoot();
    await writeBundle(root);
    await writeAgentArtifacts(root);
    await writeSkillArtifacts(root);
    const service = new SolutionMaterializationTaskService(root);
    let task = (await service.startTask(reference)).task;

    const agent = await claim(service, task.revision);
    task = await service.completeStep({
      ...reference,
      stepId: agent.step.id,
      claimToken: agent.step.claim?.token ?? '',
      expectedRevision: agent.task.revision,
    });
    const skill = await claim(service, task.revision);
    task = await service.completeStep({
      ...reference,
      stepId: skill.step.id,
      claimToken: skill.step.claim?.token ?? '',
      expectedRevision: skill.task.revision,
    });
    const validation = await claim(service, task.revision);
    task = await service.completeStep({
      ...reference,
      stepId: validation.step.id,
      claimToken: validation.step.claim?.token ?? '',
      expectedRevision: validation.task.revision,
    });

    expect(task.status).toBe('completed');
    expect(task.steps.at(-1)?.status).toBe('completed');
    expect(task.artifacts.map(({ path: artifactPath }) => artifactPath)).toContain(
      'agents/preparer/skills/publisher/references/ontology-tools.md'
    );
  });

  it('keeps validation recoverable with a precise failure when a referenced file is absent', async () => {
    const root = await fixtureRoot();
    await writeBundle(root);
    await writeAgentArtifacts(root);
    await writeSkillArtifacts(root, false);
    const service = new SolutionMaterializationTaskService(root);
    let task = (await service.startTask(reference)).task;
    for (let count = 0; count < 2; count += 1) {
      const claimed = await claim(service, task.revision);
      task = await service.completeStep({
        ...reference,
        stepId: claimed.step.id,
        claimToken: claimed.step.claim?.token ?? '',
        expectedRevision: claimed.task.revision,
      });
    }
    const validation = await claim(service, task.revision);

    await expect(
      service.completeStep({
        ...reference,
        stepId: validation.step.id,
        claimToken: validation.step.claim?.token ?? '',
        expectedRevision: validation.task.revision,
      })
    ).rejects.toMatchObject<SolutionMaterializationError>({
      code: 'ARTIFACT_INVALID',
    });
    const persisted = await service.getTask(reference);
    expect(persisted?.steps.at(-1)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('ontology-tools.md'),
    });
  });
});
