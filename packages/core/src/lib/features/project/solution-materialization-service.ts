import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ProjectSolutionDesignSource } from './solution-design-source';
import {
  SOLUTION_MATERIALIZATION_TASK_SCHEMA_VERSION,
  type ClaimSolutionMaterializationStepInput,
  type CompleteSolutionMaterializationStepInput,
  type FailSolutionMaterializationStepInput,
  type RecoverSolutionMaterializationTaskInput,
  type SolutionMaterializationArtifact,
  type SolutionMaterializationErrorCode,
  type SolutionMaterializationStep,
  type SolutionMaterializationTask,
} from './solution-materialization-types';
import { getDataRoot } from '../../paths';

import type { SolutionVersionRef } from '../solution';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const DEFAULT_CLAIM_TTL_MS = 5 * 60 * 1000;
const FILE_NAMES = ['manifest.json', 'agents.json', 'skills.json'] as const;

interface ParsedEntry {
  readonly id: string;
  readonly value: Record<string, unknown>;
  readonly index: number;
}

interface ParsedBundle {
  readonly manifest: Record<string, unknown>;
  readonly agents: readonly ParsedEntry[];
  readonly skills: readonly ParsedEntry[];
  readonly raw: Readonly<Record<(typeof FILE_NAMES)[number], Buffer>>;
}

export class SolutionMaterializationError extends Error {
  constructor(
    readonly code: SolutionMaterializationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SolutionMaterializationError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  const object = record(value);
  if (!object) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, stable(object[key])])
  );
}

function digest(value: string | Buffer | unknown): string {
  const content =
    typeof value === 'string' || Buffer.isBuffer(value)
      ? value
      : JSON.stringify(stable(value));
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function iso(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid time: ${value}`);
  }
  return date.toISOString();
}

function assertReference(input: SolutionVersionRef): void {
  for (const [field, value] of [
    ['projectId', input.projectId],
    ['solutionId', input.solutionId],
    ['solutionVersion', input.solutionVersion],
  ] as const) {
    if (!IDENTIFIER.test(value) || value.includes('..') || path.isAbsolute(value)) {
      throw new SolutionMaterializationError(
        'INVALID_REFERENCE',
        `Invalid ${field}: ${value}`
      );
    }
  }
}

function safeSegment(value: string, field: string): string {
  if (!IDENTIFIER.test(value) || value.includes('..') || path.isAbsolute(value)) {
    throw new SolutionMaterializationError(
      'INVALID_SOLUTION_BUNDLE',
      `Invalid ${field}: ${value}`
    );
  }
  return value;
}

function entries(value: unknown, collection: 'agents' | 'skills'): ParsedEntry[] {
  const items = record(value)?.[collection];
  if (!Array.isArray(items)) {
    throw new SolutionMaterializationError(
      'INVALID_SOLUTION_BUNDLE',
      `${collection}.json must contain ${collection}`
    );
  }
  const seen = new Set<string>();
  return items.map((item, index) => {
    const valueRecord = record(item);
    const id = valueRecord?.['id'];
    if (!valueRecord || typeof id !== 'string') {
      throw new SolutionMaterializationError(
        'INVALID_SOLUTION_BUNDLE',
        `${collection}[${index}] has no id`
      );
    }
    safeSegment(id, `${collection}[${index}].id`);
    if (seen.has(id)) {
      throw new SolutionMaterializationError(
        'INVALID_SOLUTION_BUNDLE',
        `Duplicate ${collection} id: ${id}`
      );
    }
    seen.add(id);
    return { id, value: valueRecord, index };
  });
}

function taskStatus(steps: readonly SolutionMaterializationStep[]): SolutionMaterializationTask['status'] {
  if (steps.at(-1)?.status === 'completed') {
    return 'completed';
  }
  if (steps.some((step) => step.status === 'failed')) {
    return 'failed';
  }
  if (steps.some((step) => step.status === 'running' || step.status === 'completed')) {
    return 'running';
  }
  return 'pending';
}

function expectedAgentArtifacts(agent: ParsedEntry): string[] {
  const base = `agents/${agent.id}`;
  const type = agent.value['type'];
  return type === 'role-agent'
    ? ['Agent.md', 'Role.md', 'Taste.md', 'Memory.md', 'Tool.md'].map(
        (name) => `${base}/${name}`
      )
    : ['Agent.md', 'Data.md', 'Process.md', 'Memory.md', 'Taste.md', 'Tool.md'].map(
        (name) => `${base}/${name}`
      );
}

function ownerAgentId(skill: ParsedEntry, agents: readonly ParsedEntry[]): string {
  const direct = skill.value['agentId'] ?? skill.value['ownerAgentId'];
  if (typeof direct === 'string') {
    return safeSegment(direct, `skills[${skill.index}].agentId`);
  }
  const owners = agents.filter(({ value }) =>
    Array.isArray(value['skills']) && value['skills'].includes(skill.id)
  );
  const owner = owners[0];
  if (owners.length !== 1 || !owner) {
    throw new SolutionMaterializationError(
      'INVALID_SOLUTION_BUNDLE',
      `Skill ${skill.id} must resolve to exactly one Agent`
    );
  }
  return owner.id;
}

function skillCode(skill: ParsedEntry): string {
  const code = skill.value['code'];
  return safeSegment(
    typeof code === 'string' ? code : skill.id,
    `skills[${skill.index}].code`
  );
}

function cloneStep(
  step: SolutionMaterializationStep,
  patch: Partial<SolutionMaterializationStep>
): SolutionMaterializationStep {
  return { ...step, ...patch };
}

function uniqueArtifacts(steps: readonly SolutionMaterializationStep[]): SolutionMaterializationArtifact[] {
  const byPath = new Map<string, SolutionMaterializationArtifact>();
  steps.forEach((step) => step.artifacts.forEach((artifact) => byPath.set(artifact.path, artifact)));
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export class SolutionMaterializationTaskService {
  private readonly designSource: ProjectSolutionDesignSource;

  constructor(private readonly dataRoot = getDataRoot()) {
    this.designSource = new ProjectSolutionDesignSource(dataRoot);
  }

  async startTask(input: SolutionVersionRef): Promise<{ task: SolutionMaterializationTask; recovered: boolean }> {
    assertReference(input);
    return this.withLock(input, async () => {
      const bundle = await this.readConfirmedBundle(input);
      const snapshot = this.snapshot(bundle);
      const existing = await this.readTask(input);
      if (existing) {
        if (
          existing.solutionId !== input.solutionId ||
          existing.input.digest !== snapshot.digest
        ) {
          throw new SolutionMaterializationError(
            'INPUT_CHANGED',
            'Confirmed solution content changed; create a new solution version.'
          );
        }
        return { task: existing, recovered: true };
      }
      const now = iso();
      const steps = this.planSteps(bundle);
      const task: SolutionMaterializationTask = {
        schemaVersion: SOLUTION_MATERIALIZATION_TASK_SCHEMA_VERSION,
        id: `solution-materialization:${input.projectId}:${input.solutionId}:${input.solutionVersion}`,
        ...input,
        revision: 1,
        status: 'pending',
        input: { ...snapshot, frozenAt: now },
        steps,
        artifacts: [],
        createdAt: now,
        updatedAt: now,
      };
      await this.writeTask(input, task);
      return { task, recovered: false };
    });
  }

  async getTask(input: SolutionVersionRef): Promise<SolutionMaterializationTask | null> {
    assertReference(input);
    return this.readTask(input);
  }

  async getStepSpecification(
    input: SolutionVersionRef,
    stepId: string
  ): Promise<Record<string, unknown> | null> {
    assertReference(input);
    const task = await this.requireTask(input);
    await this.assertInputUnchanged(input, task);
    const step = task.steps.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new SolutionMaterializationError('STEP_NOT_FOUND', `Unknown step: ${stepId}`);
    }
    if (step.kind === 'validation' || step.sourceIndex === undefined) {
      return null;
    }
    const bundle = await this.readBundleFiles(input);
    const collection = step.kind === 'agent' ? bundle.agents : bundle.skills;
    const entry = collection[step.sourceIndex];
    if (!entry || entry.id !== step.subjectId || digest(entry.value) !== step.inputDigest) {
      throw new SolutionMaterializationError('INPUT_CHANGED', `Input changed for ${step.id}`);
    }
    return structuredClone(entry.value);
  }

  async claimNextStep(input: ClaimSolutionMaterializationStepInput): Promise<{ task: SolutionMaterializationTask; step: SolutionMaterializationStep }> {
    assertReference(input);
    safeSegment(input.workerId, 'workerId');
    return this.withLock(input, async () => {
      const task = await this.requireTask(input);
      this.assertRevision(task, input.expectedRevision);
      await this.assertInputUnchanged(input, task);
      const now = iso(input.now);
      const steps = this.releaseExpiredClaims(task.steps, now);
      const completed = new Set(
        steps.filter((step) => step.status === 'completed').map((step) => step.id)
      );
      const index = steps.findIndex(
        (step) =>
          step.status === 'pending' &&
          step.dependsOn.every((dependency) => completed.has(dependency))
      );
      if (index < 0) {
        throw new SolutionMaterializationError('NO_READY_STEP', 'No materialization step is ready.');
      }
      const step = steps[index];
      if (!step) {
        throw new SolutionMaterializationError('NO_READY_STEP', 'No materialization step is ready.');
      }
      const ttl = input.claimTtlMs ?? DEFAULT_CLAIM_TTL_MS;
      if (!Number.isSafeInteger(ttl) || ttl <= 0) {
        throw new TypeError('claimTtlMs must be a positive integer');
      }
      const claimed = cloneStep(step, {
        status: 'running',
        attempts: step.attempts + 1,
        error: undefined,
        claim: {
          token: randomUUID(),
          workerId: input.workerId,
          claimedAt: now,
          expiresAt: new Date(Date.parse(now) + ttl).toISOString(),
        },
      });
      const nextSteps = steps.map((step, candidate) => candidate === index ? claimed : step);
      const next = this.updateTask(task, nextSteps, now);
      await this.writeTask(input, next);
      return { task: next, step: claimed };
    });
  }

  async completeStep(input: CompleteSolutionMaterializationStepInput): Promise<SolutionMaterializationTask> {
    assertReference(input);
    return this.withLock(input, async () => {
      const task = await this.requireTask(input);
      this.assertRevision(task, input.expectedRevision);
      await this.assertInputUnchanged(input, task);
      const index = task.steps.findIndex((step) => step.id === input.stepId);
      if (index < 0) {
        throw new SolutionMaterializationError('STEP_NOT_FOUND', `Unknown step: ${input.stepId}`);
      }
      const step = task.steps[index];
      if (!step) {
        throw new SolutionMaterializationError('STEP_NOT_FOUND', `Unknown step: ${input.stepId}`);
      }
      this.assertClaim(step, input.claimToken);
      const now = iso(input.now);
      let artifacts: SolutionMaterializationArtifact[];
      try {
        artifacts = step.kind === 'validation'
          ? await this.validateCompletedSteps(input, task)
          : await this.readExpectedArtifacts(input, step);
      } catch (error) {
        if (!(error instanceof SolutionMaterializationError)) {
          throw error;
        }
        const failed = cloneStep(step, {
          status: 'failed',
          claim: undefined,
          error: `${error.code}: ${error.message}`,
        });
        const failedSteps = task.steps.map((step, candidate) =>
          candidate === index ? failed : step
        );
        await this.writeTask(input, this.updateTask(task, failedSteps, now));
        throw error;
      }
      const completed = cloneStep(step, {
        status: 'completed',
        claim: undefined,
        error: undefined,
        artifacts,
        completedAt: now,
      });
      const steps = task.steps.map((step, candidate) => candidate === index ? completed : step);
      const next = this.updateTask(task, steps, now);
      await this.writeTask(input, next);
      return next;
    });
  }

  async failStep(input: FailSolutionMaterializationStepInput): Promise<SolutionMaterializationTask> {
    assertReference(input);
    const failure = input.error.trim();
    if (!failure) {
      throw new TypeError('error must not be empty');
    }
    return this.withLock(input, async () => {
      const task = await this.requireTask(input);
      this.assertRevision(task, input.expectedRevision);
      await this.assertInputUnchanged(input, task);
      const index = task.steps.findIndex((step) => step.id === input.stepId);
      if (index < 0) {
        throw new SolutionMaterializationError('STEP_NOT_FOUND', `Unknown step: ${input.stepId}`);
      }
      const step = task.steps[index];
      if (!step) {
        throw new SolutionMaterializationError('STEP_NOT_FOUND', `Unknown step: ${input.stepId}`);
      }
      this.assertClaim(step, input.claimToken);
      const now = iso(input.now);
      const failed = cloneStep(step, {
        status: 'failed',
        claim: undefined,
        error: failure,
      });
      const steps = task.steps.map((step, candidate) => candidate === index ? failed : step);
      const next = this.updateTask(task, steps, now);
      await this.writeTask(input, next);
      return next;
    });
  }

  async recoverTask(input: RecoverSolutionMaterializationTaskInput): Promise<SolutionMaterializationTask> {
    assertReference(input);
    return this.withLock(input, async () => {
      const task = await this.requireTask(input);
      this.assertRevision(task, input.expectedRevision);
      await this.assertInputUnchanged(input, task);
      const now = iso(input.now);
      let changed = false;
      const steps = task.steps.map((step) => {
        const expired = step.status === 'running' && step.claim && Date.parse(step.claim.expiresAt) <= Date.parse(now);
        const retry = input.retryFailed === true && step.status === 'failed';
        if (!expired && !retry) {
          return step;
        }
        changed = true;
        return cloneStep(step, {
          status: 'pending',
          claim: undefined,
          error: expired ? 'Recovered expired claim.' : undefined,
        });
      });
      if (!changed) {
        return task;
      }
      const next = this.updateTask(task, steps, now);
      await this.writeTask(input, next);
      return next;
    });
  }

  private async readConfirmedBundle(input: SolutionVersionRef): Promise<ParsedBundle> {
    const checked = await this.designSource.load(input, { sourceFormat: 'versioned_bundle' });
    if (!checked) {
      throw new SolutionMaterializationError('SOLUTION_NOT_FOUND', 'Confirmed solution bundle not found.');
    }
    if ('gaps' in checked) {
      const unconfirmed = checked.gaps.some((gap) => gap.code === 'SOLUTION_STATUS_MISMATCH');
      throw new SolutionMaterializationError(
        unconfirmed ? 'SOLUTION_NOT_CONFIRMED' : 'INVALID_SOLUTION_BUNDLE',
        checked.gaps.map((gap) => `${gap.code}: ${gap.message}`).join('\n')
      );
    }
    if (checked.design.status !== 'confirmed') {
      throw new SolutionMaterializationError('SOLUTION_NOT_CONFIRMED', 'Solution files must all be confirmed.');
    }
    return this.readBundleFiles(input);
  }

  private async readBundleFiles(input: SolutionVersionRef): Promise<ParsedBundle> {
    const directory = this.solutionDirectory(input);
    let rawValues: readonly Buffer[];
    try {
      rawValues = await Promise.all(FILE_NAMES.map((file) => fs.readFile(path.join(directory, file))));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SolutionMaterializationError('SOLUTION_NOT_FOUND', 'Solution bundle is incomplete.');
      }
      throw error;
    }
    let values: unknown[];
    try {
      values = rawValues.map((value) => JSON.parse(value.toString('utf8')) as unknown);
    } catch {
      throw new SolutionMaterializationError('INVALID_SOLUTION_BUNDLE', 'Solution bundle contains malformed JSON.');
    }
    const manifest = record(values[0]);
    if (!manifest) {
      throw new SolutionMaterializationError('INVALID_SOLUTION_BUNDLE', 'manifest.json must be an object.');
    }
    return {
      manifest,
      agents: entries(values[1], 'agents'),
      skills: entries(values[2], 'skills'),
      raw: Object.fromEntries(FILE_NAMES.map((file, index) => [file, rawValues[index]])) as Readonly<Record<(typeof FILE_NAMES)[number], Buffer>>,
    };
  }

  private snapshot(bundle: ParsedBundle): Omit<SolutionMaterializationTask['input'], 'frozenAt'> {
    const files = FILE_NAMES.map((file) => ({
      file,
      digest: digest(bundle.raw[file]),
      size: bundle.raw[file].byteLength,
    }));
    return { digest: digest(files), files };
  }

  private planSteps(bundle: ParsedBundle): SolutionMaterializationStep[] {
    const agentIds = new Set(bundle.agents.map(({ id }) => id));
    const agentSteps = bundle.agents.map((agent): SolutionMaterializationStep => ({
      id: `agent:${agent.id}`,
      kind: 'agent',
      subjectId: agent.id,
      sourceIndex: agent.index,
      inputDigest: digest(agent.value),
      expectedArtifacts: expectedAgentArtifacts(agent),
      dependsOn: [],
      status: 'pending',
      attempts: 0,
      artifacts: [],
    }));
    const skillSteps = bundle.skills.map((skill): SolutionMaterializationStep => {
      const owner = ownerAgentId(skill, bundle.agents);
      if (!agentIds.has(owner)) {
        throw new SolutionMaterializationError('INVALID_SOLUTION_BUNDLE', `Skill ${skill.id} references unknown Agent ${owner}`);
      }
      const base = `agents/${owner}/skills/${skillCode(skill)}`;
      return {
        id: `skill:${skill.id}`,
        kind: 'skill',
        subjectId: skill.id,
        ownerAgentId: owner,
        sourceIndex: skill.index,
        inputDigest: digest(skill.value),
        expectedArtifacts: [`${base}/SKILL.md`],
        dependsOn: [`agent:${owner}`],
        status: 'pending',
        attempts: 0,
        artifacts: [],
      };
    });
    const dependencies = [...agentSteps, ...skillSteps].map(({ id }) => id);
    return [
      ...agentSteps,
      ...skillSteps,
      {
        id: 'validation:final',
        kind: 'validation',
        subjectId: 'final',
        inputDigest: digest({
          manifest: bundle.manifest,
          agents: bundle.agents.map(({ value }) => value),
          skills: bundle.skills.map(({ value }) => value),
        }),
        expectedArtifacts: [],
        dependsOn: dependencies,
        status: 'pending',
        attempts: 0,
        artifacts: [],
      },
    ];
  }

  private releaseExpiredClaims(steps: readonly SolutionMaterializationStep[], now: string): SolutionMaterializationStep[] {
    return steps.map((step) =>
      step.status === 'running' && step.claim && Date.parse(step.claim.expiresAt) <= Date.parse(now)
        ? cloneStep(step, { status: 'pending', claim: undefined, error: 'Recovered expired claim.' })
        : step
    );
  }

  private assertRevision(task: SolutionMaterializationTask, expected: number): void {
    if (task.revision !== expected) {
      throw new SolutionMaterializationError('REVISION_CONFLICT', `Expected revision ${expected}, found ${task.revision}.`);
    }
  }

  private assertClaim(step: SolutionMaterializationStep, token: string): void {
    if (step.status !== 'running' || !step.claim) {
      throw new SolutionMaterializationError('STEP_NOT_CLAIMED', `Step ${step.id} is not running.`);
    }
    if (step.claim.token !== token) {
      throw new SolutionMaterializationError('CLAIM_TOKEN_MISMATCH', `Claim token does not own ${step.id}.`);
    }
  }

  private async assertInputUnchanged(input: SolutionVersionRef, task: SolutionMaterializationTask): Promise<void> {
    const current = this.snapshot(await this.readBundleFiles(input));
    if (current.digest !== task.input.digest) {
      throw new SolutionMaterializationError('INPUT_CHANGED', 'Confirmed solution content changed after task creation.');
    }
  }

  private updateTask(task: SolutionMaterializationTask, steps: readonly SolutionMaterializationStep[], now: string): SolutionMaterializationTask {
    const status = taskStatus(steps);
    return {
      ...task,
      revision: task.revision + 1,
      status,
      steps,
      artifacts: uniqueArtifacts(steps),
      updatedAt: now,
      ...(status === 'completed' ? { completedAt: now } : { completedAt: undefined }),
    };
  }

  private async readExpectedArtifacts(input: SolutionVersionRef, step: SolutionMaterializationStep): Promise<SolutionMaterializationArtifact[]> {
    return Promise.all(step.expectedArtifacts.map((relativePath) => this.readArtifact(input, relativePath)));
  }

  private async readArtifact(input: SolutionVersionRef, relativePath: string): Promise<SolutionMaterializationArtifact> {
    const projectRoot = this.projectDirectory(input);
    const target = path.resolve(projectRoot, relativePath);
    if (!target.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) {
      throw new SolutionMaterializationError('ARTIFACT_INVALID', `Artifact escapes project root: ${relativePath}`);
    }
    let content: Buffer;
    try {
      content = await fs.readFile(target);
    } catch {
      throw new SolutionMaterializationError('ARTIFACT_INVALID', `Missing artifact: ${relativePath}`);
    }
    return { path: relativePath, digest: digest(content), size: content.byteLength };
  }

  private async validateCompletedSteps(input: SolutionVersionRef, task: SolutionMaterializationTask): Promise<SolutionMaterializationArtifact[]> {
    const fileSteps = task.steps.filter((step) => step.kind !== 'validation');
    const incomplete = fileSteps.find((step) => step.status !== 'completed');
    if (incomplete) {
      throw new SolutionMaterializationError('VALIDATION_FAILED', `Step ${incomplete.id} is not complete.`);
    }
    const verified: SolutionMaterializationArtifact[] = [];
    for (const step of fileSteps) {
      for (const expected of step.expectedArtifacts) {
        const artifact = await this.readArtifact(input, expected);
        const recorded = step.artifacts.find((candidate) => candidate.path === expected);
        if (!recorded || recorded.digest !== artifact.digest) {
          throw new SolutionMaterializationError('VALIDATION_FAILED', `Artifact changed after completion: ${expected}`);
        }
        verified.push(artifact);
      }
    }
    const bundle = await this.readBundleFiles(input);
    for (const skill of bundle.skills) {
      const owner = ownerAgentId(skill, bundle.agents);
      const code = skillCode(skill);
      const skillPath = `agents/${owner}/skills/${code}/SKILL.md`;
      const source = await fs.readFile(path.join(this.projectDirectory(input), skillPath), 'utf8');
      const contractLine = source.split(/\r?\n/).find((line) => line.startsWith('contract:'));
      if (!contractLine) {
        throw new SolutionMaterializationError('VALIDATION_FAILED', `${skillPath} has no canonical contract frontmatter.`);
      }
      let contract: unknown;
      try {
        contract = JSON.parse(contractLine.slice('contract:'.length).trim()) as unknown;
      } catch {
        throw new SolutionMaterializationError('VALIDATION_FAILED', `${skillPath} contract is not single-line JSON.`);
      }
      if (digest(contract) !== digest(skill.value['contract'])) {
        throw new SolutionMaterializationError('VALIDATION_FAILED', `${skillPath} contract does not match skills.json.`);
      }
      if (source.includes('references/ontology-tools.md')) {
        verified.push(await this.readArtifact(input, `agents/${owner}/skills/${code}/references/ontology-tools.md`));
      }
      const toolPath = `agents/${owner}/Tool.md`;
      const tool = await fs.readFile(path.join(this.projectDirectory(input), toolPath), 'utf8');
      if (!tool.includes(`skills/${code}/SKILL.md`) && !tool.includes(skillPath)) {
        throw new SolutionMaterializationError('VALIDATION_FAILED', `${toolPath} does not reference Skill ${skill.id}.`);
      }
    }
    return verified.sort((left, right) => left.path.localeCompare(right.path));
  }

  private projectDirectory(input: SolutionVersionRef): string {
    return path.join(this.dataRoot, 'projects', input.projectId);
  }

  private solutionDirectory(input: SolutionVersionRef): string {
    return path.join(this.projectDirectory(input), 'solutions', input.solutionVersion);
  }

  private taskPath(input: SolutionVersionRef): string {
    return path.join(this.solutionDirectory(input), 'materialization-task.json');
  }

  private async readTask(input: SolutionVersionRef): Promise<SolutionMaterializationTask | null> {
    try {
      return JSON.parse(await fs.readFile(this.taskPath(input), 'utf8')) as SolutionMaterializationTask;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private async requireTask(input: SolutionVersionRef): Promise<SolutionMaterializationTask> {
    const task = await this.readTask(input);
    if (!task || task.solutionId !== input.solutionId) {
      throw new SolutionMaterializationError('SOLUTION_NOT_FOUND', 'Materialization task not found.');
    }
    return task;
  }

  private async writeTask(input: SolutionVersionRef, task: SolutionMaterializationTask): Promise<void> {
    const target = this.taskPath(input);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(task, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, target);
  }

  private async withLock<T>(input: SolutionVersionRef, operation: () => Promise<T>): Promise<T> {
    const lock = `${this.taskPath(input)}.lock`;
    await fs.mkdir(path.dirname(lock), { recursive: true });
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(lock, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      const owner = await this.lockOwner(lock);
      const recentUnknownOwner = owner === null && await this.lockIsRecent(lock);
      if (recentUnknownOwner || (owner !== null && this.processExists(owner))) {
        throw new SolutionMaterializationError('REVISION_CONFLICT', 'Materialization task is being updated.');
      }
      await fs.rm(lock, { force: true });
      try {
        handle = await fs.open(lock, 'wx');
      } catch {
        throw new SolutionMaterializationError('REVISION_CONFLICT', 'Materialization task is being updated.');
      }
    }
    try {
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`);
      return await operation();
    } finally {
      await handle.close();
      await fs.rm(lock, { force: true });
    }
  }

  private async lockOwner(lock: string): Promise<number | null> {
    try {
      const value = record(JSON.parse(await fs.readFile(lock, 'utf8')) as unknown);
      const pid = value?.['pid'];
      return typeof pid === 'number' && Number.isSafeInteger(pid) ? pid : null;
    } catch {
      return null;
    }
  }

  private processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  private async lockIsRecent(lock: string): Promise<boolean> {
    try {
      const stat = await fs.stat(lock);
      return Date.now() - stat.mtimeMs < 30_000;
    } catch {
      return false;
    }
  }
}
