import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const specifications: Record<string, Record<string, unknown>> = {
    'agent:invoice-agent': {
      id: 'invoice-agent',
      name: '发票 Agent',
      type: 'agent',
      description: '核对发票事实。',
      skills: ['invoice-review'],
      contract: { agentId: 'invoice-agent' },
    },
    'skill:invoice-review': {
      id: 'invoice-review',
      code: 'invoice-review',
      name: '发票核对',
      agentId: 'invoice-agent',
      contract: {
        skillId: 'invoice-review',
        ontology: { ontologyId: 'ontology-project-1', ontologyVersion: '1.0.0' },
        inputs: [],
        outputs: [],
        actions: [],
        permissions: [],
      },
      skillFileOutline: { steps: ['核对发票'] },
    },
  };
  const initialSteps = [
    { id: 'agent:invoice-agent', kind: 'agent', subjectId: 'invoice-agent', status: 'pending', dependsOn: [], attempts: 0, artifacts: [] },
    { id: 'skill:invoice-review', kind: 'skill', subjectId: 'invoice-review', ownerAgentId: 'invoice-agent', status: 'pending', dependsOn: ['agent:invoice-agent'], attempts: 0, artifacts: [] },
    { id: 'validation:final', kind: 'validation', subjectId: 'final', status: 'pending', dependsOn: ['agent:invoice-agent', 'skill:invoice-review'], attempts: 0, artifacts: [] },
  ];
  return {
    specifications,
    bundledSkillDir: null as string | null,
    reset(): void {
      this.bundledSkillDir = null;
      this.task = {
        projectId: 'project-1',
        solutionId: 'solution-1',
        solutionVersion: 'v1.0',
        revision: 1,
        status: 'pending',
        steps: structuredClone(initialSteps),
      };
    },
    task: {} as Record<string, unknown>,
  };
});

vi.mock('@originos/core/lib/integrations/pi-agent/core/skills', () => ({
  findBundledSkillDir: () => fake.bundledSkillDir,
}));

vi.mock('@originos/core/lib/features/project', () => {
  class FakeError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  }
  class FakeTaskService {
    async startTask(): Promise<{ task: Record<string, unknown>; recovered: boolean }> {
      return { task: fake.task, recovered: false };
    }

    async recoverTask(): Promise<Record<string, unknown>> {
      return fake.task;
    }

    async getTask(): Promise<Record<string, unknown>> {
      return fake.task;
    }

    async getStepSpecification(_reference: unknown, stepId: string): Promise<Record<string, unknown> | null> {
      return fake.specifications[stepId] ?? null;
    }

    async claimNextStep(): Promise<{ task: Record<string, unknown>; step: Record<string, unknown> }> {
      const task = fake.task as { revision: number; status: string; steps: Array<Record<string, unknown>> };
      const completed = new Set(task.steps.filter((step) => step['status'] === 'completed').map((step) => step['id']));
      const step = task.steps.find((candidate) => candidate['status'] === 'pending' && (candidate['dependsOn'] as string[]).every((id) => completed.has(id)));
      if (!step) {
        throw new FakeError('NO_READY_STEP', 'none');
      }
      step['status'] = 'running';
      step['claim'] = { token: `token-${String(step['id'])}` };
      task.revision += 1;
      task.status = 'running';
      return { task, step };
    }

    async completeStep(input: { stepId: string }): Promise<Record<string, unknown>> {
      const task = fake.task as { revision: number; status: string; steps: Array<Record<string, unknown>> };
      const step = task.steps.find((candidate) => candidate['id'] === input.stepId);
      if (!step) {
        throw new Error('missing step');
      }
      step['status'] = 'completed';
      delete step['claim'];
      task.revision += 1;
      task.status = task.steps.every((candidate) => candidate['status'] === 'completed') ? 'completed' : 'running';
      return task;
    }

    async failStep(input: { stepId: string; error: string }): Promise<Record<string, unknown>> {
      const task = fake.task as { revision: number; status: string; steps: Array<Record<string, unknown>> };
      const step = task.steps.find((candidate) => candidate['id'] === input.stepId);
      if (step) {
        step['status'] = 'failed';
        step['error'] = input.error;
      }
      task.status = 'failed';
      return task;
    }
  }
  return {
    SolutionMaterializationError: FakeError,
    SolutionMaterializationTaskService: FakeTaskService,
  };
});

import { SolutionMaterializationBackgroundRunner } from '../solution-materialization-server';

describe('SolutionMaterializationBackgroundRunner', () => {
  beforeEach(() => {
    fake.reset();
  });

  it('materializes Agent and Skill files in background without creating board records', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'solution-materializer-web-'));
    const projectRoot = path.join(root, 'projects', 'project-1');
    const referenceContent = '# Ontology tools\n';
    await mkdir(path.join(projectRoot, 'solutions', 'v1.0'), { recursive: true });
    await mkdir(path.join(projectRoot, 'skills', 'project-skill-creator', 'references'), { recursive: true });
    await writeFile(path.join(projectRoot, 'solutions', 'v1.0', 'skills.json'), JSON.stringify({
      skills: [fake.specifications['skill:invoice-review']],
    }), 'utf8');
    await writeFile(
      path.join(projectRoot, 'skills', 'project-skill-creator', 'references', 'ontology-tools.md'),
      referenceContent,
      'utf8'
    );

    const runner = new SolutionMaterializationBackgroundRunner(root);
    await runner.start({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1.0',
    });

    await vi.waitFor(async () => {
      await expect(runner.get({
        projectId: 'project-1',
        solutionId: 'solution-1',
        solutionVersion: 'v1.0',
      })).resolves.toMatchObject({ status: 'completed' });
    });

    await expect(readFile(path.join(projectRoot, 'agents', 'invoice-agent', 'Agent.md'), 'utf8')).resolves.toContain('核对发票事实');
    await expect(readFile(path.join(projectRoot, 'agents', 'invoice-agent', 'Tool.md'), 'utf8')).resolves.toContain('skills/invoice-review/SKILL.md');
    await expect(readFile(path.join(projectRoot, 'agents', 'invoice-agent', 'skills', 'invoice-review', 'SKILL.md'), 'utf8')).resolves.toContain('contract: {"skillId":"invoice-review"');
    await expect(readFile(path.join(projectRoot, 'agents', 'invoice-agent', 'skills', 'invoice-review', 'references', 'ontology-tools.md'), 'utf8')).resolves.toBe(referenceContent);
    expect(JSON.stringify(fake.task)).not.toMatch(/projectTaskId|runId|workItemId/);
  });

  it('uses the bundled project Skill creator when the project has no installed copy', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'solution-materializer-bundled-'));
    const projectRoot = path.join(root, 'projects', 'project-1');
    const bundledCreator = path.join(root, 'templates', 'skills', 'project-skill-creator');
    const referenceContent = '# Bundled ontology tools\n';
    fake.bundledSkillDir = bundledCreator;
    await mkdir(path.join(projectRoot, 'solutions', 'v1.0'), { recursive: true });
    await mkdir(path.join(bundledCreator, 'references'), { recursive: true });
    await writeFile(path.join(projectRoot, 'solutions', 'v1.0', 'skills.json'), JSON.stringify({
      skills: [fake.specifications['skill:invoice-review']],
    }), 'utf8');
    await writeFile(path.join(bundledCreator, 'references', 'ontology-tools.md'), referenceContent, 'utf8');

    const runner = new SolutionMaterializationBackgroundRunner(root);
    await runner.start({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1.0',
    });

    await vi.waitFor(async () => {
      await expect(runner.get({
        projectId: 'project-1',
        solutionId: 'solution-1',
        solutionVersion: 'v1.0',
      })).resolves.toMatchObject({ status: 'completed' });
    });

    await expect(readFile(
      path.join(projectRoot, 'agents', 'invoice-agent', 'skills', 'invoice-review', 'references', 'ontology-tools.md'),
      'utf8'
    )).resolves.toBe(referenceContent);
  });
});
