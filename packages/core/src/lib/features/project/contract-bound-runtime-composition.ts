import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  CollaborationExecutionStore,
  FileCollaborationMutationLock,
  createAgentTaskEvidenceSink,
  type CollaborationExecutionPort,
  type EvidenceReceipt,
  type EvidenceSubmissionInput,
  type HitlOpenInput,
  type WorkItemEvidenceSink,
  type WorkItemHitlPort,
  type WorkItemReadinessInput,
  type WorkItemReadinessPort,
  type WorkItemReadinessResult,
} from '../../../modules/collaboration-runtime/facade';
import {
  CanonicalOntologyOutcomeAdapter,
  VersionedContractVerifierRegistry,
  type ContractVerifierCandidate,
  type FrozenOutcomeDraft,
  type FrozenOutcomeDraftPort,
  type VersionedContractVerifier,
  type VersionedEvidenceSchema,
} from '../../../modules/collaboration-runtime/integrations';
import {
  CanonicalOntologyOSDK,
  CanonicalOntologyStore,
  type CanonicalActionOutputDraft,
  type CanonicalFactReference,
} from '../ontology';
import {
  SolutionExecutionContractStore,
  type ContractIntegrityResult,
  type SolutionExecutionContract,
  type SolutionExecutionContractPort,
} from '../solution';
import { OntologyCrossPackageService } from './ontology-cross-package-service';
import { OntologyWorkItemRecovery } from './ontology-work-item-recovery';
import {
  RuntimeProjectTaskSource,
  type ProjectTaskRuntimeRecoveryInput,
  type ProjectTaskRuntimeRecoveryPort,
  type ProjectTaskRuntimeRecoveryResult,
} from './project-task-source';
import { ProjectTaskBoardService } from './task-board';
import {
  ApprovedProjectTaskCreationService,
  type ApprovedProjectTaskCreateRequest,
  type ApprovedProjectTaskPort,
  type ApprovedProjectTaskReceipt,
} from './project-task-creation';
import {
  buildRoleSystemPrompt,
  loadRoleContext,
  parseStateMachine,
} from '../../integrations/pi-agent/role-agent';
import {
  ContractBoundAgentSkillWorker,
  type ContractBoundAgentSkillRuntimePort,
  type ContractBoundRuntimeRequest,
  type ContractBoundRuntimeResult,
} from '../agent/server';

import type { AgentSession, AgentMessage, CreateSessionRequest } from '../../../types/agent';
import type { AgentManager } from '../../integrations/pi-agent/agent-manager';
import {
  isAgentTaskRuntimePersistenceV1,
  type AgentTaskProjectMetadataMutationReceiptV1,
  type AgentTaskRuntimePersistenceV1,
  type AgentTaskRuntimeSnapshotV1,
} from '../../integrations/pi-agent/task-runtime';
import type {
  ProjectTaskPriorityMutationInput,
  ProjectTaskPriorityMutationPort,
} from './ontology-cross-package-service';
import type { AgentSessionService } from '../agent';
import {
  AuthorizedProjectTaskSubscriptions,
  ProjectTaskEventAggregator,
  type ProjectAccessPort,
  type ProjectTaskChangeSourcePort,
  type ProjectTaskSubscriptionPort,
} from './project-task-access-subscription';

export const ORIGINOS_ARTIFACT_VERIFIER_REF = 'originos.artifact-output@1.0.0';
export const ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF = 'originos.artifact-evidence@1.0.0';

const ARTIFACT_PROTOCOL = 'artifact:';
const ARTIFACT_HOST = 'collaboration';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@:-]*$/;

interface ContractArtifactEnvelope {
  readonly schemaVersion: '1.0.0';
  readonly requestId: string;
  readonly runId: string;
  readonly workItemId: string;
  readonly attemptId: string;
  readonly targetId: string;
  readonly content: string;
  readonly createdAt: string;
}

interface ProjectContractSessionPort {
  createSession(request: CreateSessionRequest): Promise<AgentSession>;
  listTaskRuntimeSessions(projectId: string): Promise<readonly {
    readonly sessionId: string;
    readonly projectId: string;
    readonly updatedAt: number;
    readonly taskRuntime: AgentTaskRuntimePersistenceV1;
  }[]>;
  getSession(sessionId: string, projectId?: string): Promise<AgentSession | null>;
  updateSession(
    sessionId: string,
    updates: { readonly taskRuntime?: AgentTaskRuntimePersistenceV1 },
    projectId?: string,
  ): Promise<AgentSession | null>;
  addMessage(
    sessionId: string,
    message: Omit<AgentMessage, 'id' | 'timestamp'>,
    projectId?: string,
  ): Promise<AgentSession | null>;
}

export interface ProjectContractRuntimeHostCapabilities {
  readonly sessions: ProjectContractSessionPort;
  readonly agents: Pick<
    AgentManager,
    'getOrCreateAgent' | 'getOrCreateTaskRuntime' | 'removeAgent' | 'getTaskRuntimeSnapshot' | 'controlTaskRuntime'
    | 'requestTaskReview' | 'approveTaskCompletion' | 'rejectTaskReview'
  >;
}

export interface ProjectContractRuntimeCompositionOptions {
  readonly dataRoot: string;
  readonly host: ProjectContractRuntimeHostCapabilities;
  readonly hostId?: string;
  readonly additionalVerifiers?: readonly VersionedContractVerifier[];
  readonly additionalEvidenceSchemas?: readonly VersionedEvidenceSchema[];
  readonly contractPort?: SolutionExecutionContractPort;
  readonly projectAccess?: ProjectAccessPort;
  readonly projectTaskChangeSources?: readonly ProjectTaskChangeSourcePort[];
}

export interface ProjectContractRuntimeComposition {
  readonly service: OntologyCrossPackageService;
  readonly executionPort: CollaborationExecutionPort;
  readonly taskBoard: ProjectTaskBoardService;
  readonly contractPort: SolutionExecutionContractPort;
  readonly taskCreation: ApprovedProjectTaskCreationService;
  readonly taskSubscriptions: ProjectTaskSubscriptionPort;
}

function assertIdentifier(value: string, field: string): void {
  if (!IDENTIFIER.test(value) || value.includes('..')) {
    throw new TypeError(`Invalid ${field}: ${value}`);
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {return value.map(stableValue);}
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(stableValue(value)))
    .digest('hex')}`;
}

function artifactPath(
  dataRoot: string,
  projectId: string,
  runId: string,
  workItemId: string,
  attemptId: string,
): string {
  for (const [field, value] of Object.entries({ projectId, runId, workItemId, attemptId })) {
    assertIdentifier(value, field);
  }
  return path.join(
    dataRoot,
    'projects',
    projectId,
    'collaboration-artifacts',
    runId,
    workItemId,
    `${attemptId}.json`,
  );
}

function artifactRef(
  projectId: string,
  runId: string,
  workItemId: string,
  attemptId: string,
): string {
  return `${ARTIFACT_PROTOCOL}//${ARTIFACT_HOST}/${[
    projectId,
    runId,
    workItemId,
    attemptId,
  ].map(encodeURIComponent).join('/')}`;
}

function parseArtifactRef(dataRoot: string, ref: string): string {
  const parsed = new URL(ref);
  if (parsed.protocol !== ARTIFACT_PROTOCOL || parsed.hostname !== ARTIFACT_HOST) {
    throw new TypeError('Unsupported collaboration artifact reference');
  }
  const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length !== 4) {
    throw new TypeError('Invalid collaboration artifact reference');
  }
  const [projectId, runId, workItemId, attemptId] = segments;
  return artifactPath(dataRoot, projectId!, runId!, workItemId!, attemptId!);
}

function messageText(message: { readonly content?: unknown } | undefined): string {
  const content = message?.content;
  if (typeof content === 'string') {return content.trim();}
  if (!Array.isArray(content)) {return '';}
  return content
    .filter((block): block is { readonly type: 'text'; readonly text: string } =>
      Boolean(block)
      && typeof block === 'object'
      && (block as Record<string, unknown>)['type'] === 'text'
      && typeof (block as Record<string, unknown>)['text'] === 'string'
    )
    .map(({ text }) => text)
    .join('\n')
    .trim();
}


function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const unwrapped = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  const value: unknown = JSON.parse(unwrapped);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Worker result must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function buildWorkerPrompt(request: ContractBoundRuntimeRequest): string {
  return JSON.stringify({
    instruction: 'Execute this frozen WorkItem. Return exactly one JSON object. Include an outcome object with actionId, optional currentStateId, inputFactRefs, outputs and expectedRevision. Do not add markdown fences.',
    request: {
      requestId: request.requestId,
      projectId: request.projectId,
      runId: request.runId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      leaseEpoch: request.leaseEpoch,
      contractId: request.contractId,
      contractHash: request.contractHash,
      designNodeId: request.designNodeId,
      target: request.target,
      objective: request.objective,
      taskTemplate: request.taskTemplate,
      semanticContext: request.semanticContext,
      requiredPermissions: request.requiredPermissions,
      inputRefs: request.inputRefs,
      expectedOutputRefs: request.expectedOutputRefs,
      checkpointRef: request.checkpointRef,
    },
  });
}

async function firstExisting(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {return candidate;}
    } catch {
      // Continue to the next explicit asset location.
    }
  }
  return null;
}

async function loadTargetSystemPrompt(
  workingDirectory: string,
  request: Pick<ContractBoundRuntimeRequest, 'target'>,
): Promise<string> {
  if (request.target.kind === 'agent') {
    const context = await loadRoleContext(workingDirectory);
    if (context) {
      const stateMachine = parseStateMachine(context.roleMd);
      context.currentPhase = stateMachine.currentPhase;
      return buildRoleSystemPrompt(context, stateMachine);
    }
    const agentMd = await fs.readFile(
      path.join(workingDirectory, 'Agent.md'),
      'utf8',
    ).catch(() => '');
    return [
      `# Contract-bound Agent: ${request.target.targetId}`,
      agentMd,
    ].filter(Boolean).join('\n\n');
  }
  const skillMd = await fs.readFile(
    path.join(workingDirectory, 'SKILL.md'),
    'utf8',
  ).catch(() => '');
  return [
    `# Contract-bound Skill: ${request.target.targetId}`,
    skillMd,
  ].filter(Boolean).join('\n\n');
}

async function resolveTargetDirectory(
  dataRoot: string,
  request: Pick<ContractBoundRuntimeRequest, 'projectId' | 'target'>,
): Promise<string> {
  const targetId = request.target.targetId;
  assertIdentifier(request.projectId, 'projectId');
  assertIdentifier(targetId, 'targetId');
  const projectRoot = path.join(dataRoot, 'projects', request.projectId);
  const candidates = request.target.kind === 'agent'
    ? [
        path.join(projectRoot, 'agents', targetId),
        path.join(dataRoot, 'agents', targetId),
      ]
    : [
        path.join(projectRoot, 'skills', targetId),
        path.join(dataRoot, 'skills', targetId),
      ];
  const resolved = await firstExisting(candidates);
  if (!resolved) {throw new Error('CONTRACT_TARGET_UNAVAILABLE');}
  return resolved;
}

class AgentManagerContractRuntime implements ContractBoundAgentSkillRuntimePort {
  constructor(
    private readonly dataRoot: string,
    private readonly agents: ProjectContractRuntimeHostCapabilities['agents'],
  ) {}

  async execute(
    request: ContractBoundRuntimeRequest,
    signal: AbortSignal,
  ): Promise<ContractBoundRuntimeResult> {
    const startedAt = Date.now();
    const persisted = await this.recoverPersistedArtifact(request);
    if (persisted) {return persisted;}
    const workingDirectory = await resolveTargetDirectory(this.dataRoot, request);
    const agentType = request.target.kind === 'agent' ? 'role-agent' : 'skill';
    const systemPrompt = await loadTargetSystemPrompt(workingDirectory, request);
    const agent = await this.agents.getOrCreateAgent(
      request.executionKey,
      request.projectId,
      {
        agentType,
        systemPrompt,
        agentBaseDir: workingDirectory,
        isWindowBound: false,
      },
    );
    const abort = (): void => agent.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) {throw new Error('WORKER_ABORTED');}
      await agent.prompt(buildWorkerPrompt(request), undefined, {
        completionPolicy: 'task_runtime',
      });
      if (signal.aborted) {throw new Error('WORKER_ABORTED');}
      const state = await agent.getSessionState();
      const assistant = [...state.messages]
        .reverse()
        .find((message) => message.role === 'assistant');
      const content = messageText(assistant);
      if (!content) {throw new Error('WORKER_RESULT_EMPTY');}
      extractJsonObject(content);

      const envelope: ContractArtifactEnvelope = {
        schemaVersion: '1.0.0',
        requestId: request.requestId,
        runId: request.runId,
        workItemId: request.workItemId,
        attemptId: request.attemptId,
        targetId: request.target.targetId,
        content,
        createdAt: new Date().toISOString(),
      };
      const filePath = artifactPath(
        this.dataRoot,
        request.projectId,
        request.runId,
        request.workItemId,
        request.attemptId,
      );
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(envelope, null, 2), 'utf8');
      await fs.rename(temporary, filePath);
      const ref = artifactRef(
        request.projectId,
        request.runId,
        request.workItemId,
        request.attemptId,
      );
      const usage = assistant?.usage;
      return {
        receiptId: `${request.idempotencyKey}:worker`,
        outputRefs: [ref],
        outputHash: sha256(envelope),
        usage: {
          durationMs: Date.now() - startedAt,
          tokens: usage?.totalTokens ?? 0,
        },
        checkpointRef: ref,
      };
    } finally {
      signal.removeEventListener('abort', abort);
      this.agents.removeAgent(request.executionKey);
    }
  }

  private async recoverPersistedArtifact(
    request: ContractBoundRuntimeRequest,
  ): Promise<ContractBoundRuntimeResult | null> {
    const filePath = artifactPath(
      this.dataRoot,
      request.projectId,
      request.runId,
      request.workItemId,
      request.attemptId,
    );
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {return null;}
      throw error;
    }
    const envelope = JSON.parse(raw) as ContractArtifactEnvelope;
    if (
      envelope.schemaVersion !== '1.0.0'
      || envelope.requestId !== request.requestId
      || envelope.runId !== request.runId
      || envelope.workItemId !== request.workItemId
      || envelope.attemptId !== request.attemptId
      || envelope.targetId !== request.target.targetId
    ) {
      throw new Error('PERSISTED_WORKER_ARTIFACT_SCOPE_MISMATCH');
    }
    extractJsonObject(envelope.content);
    return {
      receiptId: `${request.idempotencyKey}:worker`,
      outputRefs: [artifactRef(
        request.projectId,
        request.runId,
        request.workItemId,
        request.attemptId,
      )],
      outputHash: sha256(envelope),
      usage: { durationMs: 0, tokens: 0 },
      checkpointRef: artifactRef(
        request.projectId,
        request.runId,
        request.workItemId,
        request.attemptId,
      ),
    };
  }
}

function parseOntologyFactRef(ref: string): CanonicalFactReference | null {
  if (!ref.startsWith('ontology-fact:')) {return null;}
  const segments = ref.split(':');
  if (segments.length !== 7) {return null;}
  const [, ontologyId, ontologyVersion, conceptId, factTypeId, factId, factVersion] = segments;
  if (![ontologyId, ontologyVersion, conceptId, factTypeId, factId, factVersion]
    .every((value) => Boolean(value?.trim()))) {
    return null;
  }
  return {
    ontologyId: ontologyId!,
    ontologyVersion: ontologyVersion!,
    conceptId: conceptId!,
    factTypeId: factTypeId!,
    factId: factId!,
    factVersion: factVersion!,
  };
}

class CanonicalReadiness implements WorkItemReadinessPort {
  constructor(
    private readonly dataRoot: string,
    private readonly osdk: Pick<CanonicalOntologyOSDK, 'queryFacts'>,
  ) {}

  async check(input: WorkItemReadinessInput): Promise<WorkItemReadinessResult> {
    try {
      const node = input.run.contract.topology.nodes.find(
        ({ id }) => id === input.workItem.designNodeId,
      );
      if (!node) {throw new Error('CONTRACT_NODE_NOT_FOUND');}
      const target = node.kind === 'agent'
        ? input.run.contract.agents.find(({ agentId }) => agentId === node.contractRef)
        : input.run.contract.skills.find(({ skillId }) => skillId === node.contractRef);
      if (!target) {throw new Error('CONTRACT_TARGET_NOT_FOUND');}
      if (target.permissions.some(
        (permission) => !input.run.contract.permissions.allowed.includes(permission),
      )) {
        throw new Error('TARGET_PERMISSION_NOT_ALLOWED');
      }
      if (node.kind === 'agent') {
        const agent = input.run.contract.agents.find(
          ({ agentId }) => agentId === node.contractRef,
        );
        if (!agent) {throw new Error('CONTRACT_TARGET_NOT_FOUND');}
        await resolveTargetDirectory(this.dataRoot, {
          projectId: input.run.projectId,
          target: { kind: 'agent', targetId: node.contractRef, contract: agent },
        });
      } else {
        const skill = input.run.contract.skills.find(
          ({ skillId }) => skillId === node.contractRef,
        );
        if (!skill) {throw new Error('CONTRACT_TARGET_NOT_FOUND');}
        await resolveTargetDirectory(this.dataRoot, {
          projectId: input.run.projectId,
          target: { kind: 'skill', targetId: node.contractRef, contract: skill },
        });
      }

      const incomingBindings = input.run.contract.topology.edges
        .filter(({ toNodeId }) => toNodeId === node.id)
        .map(({ factType }) => factType);
      const bindings = incomingBindings.length
        ? incomingBindings
        : input.run.contract.topology.externalInputs;
      for (const ref of input.requiredInputRefs) {
        if (ref.startsWith('artifact://')) {
          await fs.access(parseArtifactRef(this.dataRoot, ref));
          continue;
        }
        const exact = parseOntologyFactRef(ref);
        const binding = exact ?? bindings.find(({ factTypeId }) => factTypeId === ref);
        if (!binding) {throw new Error(`INPUT_REFERENCE_UNRESOLVED:${ref}`);}
        const facts = await this.osdk.queryFacts({
          projectId: input.run.projectId,
          ontologyId: binding.ontologyId,
          ontologyVersion: binding.ontologyVersion,
          conceptId: binding.conceptId,
          factTypeId: binding.factTypeId,
          latestOnly: exact === null,
        });
        if (facts.ok === false) {
          throw new Error('INPUT_FACT_QUERY_REJECTED');
        }
        const exists = exact
          ? facts.facts.some(({ ref: stored }) =>
              stored.ontologyId === exact.ontologyId
              && stored.ontologyVersion === exact.ontologyVersion
              && stored.conceptId === exact.conceptId
              && stored.factTypeId === exact.factTypeId
              && stored.factId === exact.factId
              && stored.factVersion === exact.factVersion
            )
          : facts.facts.length > 0;
        if (!exists) {throw new Error(`INPUT_FACT_NOT_FOUND:${ref}`);}
      }
      return {
        status: 'ready',
        receiptId: `${input.attempt.attemptId}:readiness`,
        inputRefs: [...input.requiredInputRefs],
        grantedPermissions: [...input.requiredPermissions],
        targetAvailable: true,
        stateRef: `${input.run.contract.semanticContext.ontology.ontologyId}@${input.run.contract.semanticContext.ontology.ontologyVersion}`,
      };
    } catch (error) {
      return {
        status: 'blocked',
        receiptId: `${input.attempt.attemptId}:readiness`,
        inputRefs: [],
        grantedPermissions: [],
        targetAvailable: false,
        reason: error instanceof Error ? error.message : 'READINESS_FAILED',
      };
    }
  }
}

class ArtifactVerifier implements VersionedContractVerifier {
  readonly ref = ORIGINOS_ARTIFACT_VERIFIER_REF;

  constructor(private readonly dataRoot: string) {}

  async verify(input: Parameters<VersionedContractVerifier['verify']>[0]): Promise<ContractVerifierCandidate> {
    const refs = input.workerReceipt.outputRefs.filter((ref) => ref.startsWith('artifact://'));
    if (!refs.length) {
      return {
        status: 'failed',
        artifactRefs: [],
        resultRef: `${input.idempotencyKey}:verification`,
        evidence: {},
        reason: 'WORKER_ARTIFACT_MISSING',
      };
    }
    const artifacts = await Promise.all(refs.map(async (ref) => {
      const raw = await fs.readFile(parseArtifactRef(this.dataRoot, ref), 'utf8');
      const envelope = JSON.parse(raw) as ContractArtifactEnvelope;
      if (
        envelope.schemaVersion !== '1.0.0'
        || envelope.runId !== input.run.runId
        || envelope.workItemId !== input.workItem.id
        || envelope.attemptId !== input.attempt.attemptId
      ) {
        throw new Error('ARTIFACT_SCOPE_MISMATCH');
      }
      extractJsonObject(envelope.content);
      return { ref, contentHash: sha256(raw) };
    }));
    return {
      status: 'passed',
      artifactRefs: refs,
      resultRef: `${input.idempotencyKey}:verification`,
      evidence: { artifacts },
    };
  }
}

const artifactEvidenceSchema: VersionedEvidenceSchema = {
  ref: ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF,
  validate({ candidate }) {
    const artifacts = candidate.evidence['artifacts'];
    return Array.isArray(artifacts) && artifacts.length > 0
      ? { valid: true }
      : { valid: false, reason: 'Artifact evidence is empty' };
  },
};

function factReference(value: unknown): CanonicalFactReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid input fact reference');
  }
  const record = value as Record<string, unknown>;
  const required = [
    'ontologyId',
    'ontologyVersion',
    'conceptId',
    'factTypeId',
    'factId',
    'factVersion',
  ] as const;
  for (const field of required) {
    if (typeof record[field] !== 'string' || !(record[field] as string).trim()) {
      throw new TypeError(`Invalid input fact reference ${field}`);
    }
  }
  return record as unknown as CanonicalFactReference;
}

function outputDraft(value: unknown): CanonicalActionOutputDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid action output');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record['factId'] !== 'string'
    || typeof record['factTypeId'] !== 'string'
    || !record['value']
    || typeof record['value'] !== 'object'
    || Array.isArray(record['value'])
    || !record['source']
    || typeof record['source'] !== 'object'
    || Array.isArray(record['source'])
  ) {
    throw new TypeError('Invalid action output');
  }
  const source = record['source'] as Record<string, unknown>;
  if (
    !['interview', 'manual', 'import', 'runtime'].includes(String(source['sourceType']))
    || typeof source['sourceId'] !== 'string'
  ) {
    throw new TypeError('Invalid action output source');
  }
  return record as unknown as CanonicalActionOutputDraft;
}

class ArtifactOutcomeDrafts implements FrozenOutcomeDraftPort {
  constructor(private readonly dataRoot: string) {}

  async resolve(input: Parameters<FrozenOutcomeDraftPort['resolve']>[0]): Promise<FrozenOutcomeDraft> {
    const ref = input.workerReceipt.outputRefs.find((candidate) => candidate.startsWith('artifact://'));
    if (!ref) {throw new Error('OUTCOME_ARTIFACT_MISSING');}
    const raw = await fs.readFile(parseArtifactRef(this.dataRoot, ref), 'utf8');
    const envelope = JSON.parse(raw) as ContractArtifactEnvelope;
    const result = extractJsonObject(envelope.content);
    const outcome = result['outcome'];
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
      throw new Error('OUTCOME_DRAFT_MISSING');
    }
    const draft = outcome as Record<string, unknown>;
    if (
      typeof draft['actionId'] !== 'string'
      || !Array.isArray(draft['inputFactRefs'])
      || !Array.isArray(draft['outputs'])
      || !Number.isSafeInteger(draft['expectedRevision'])
      || (draft['expectedRevision'] as number) < 0
      || (draft['currentStateId'] !== undefined && typeof draft['currentStateId'] !== 'string')
    ) {
      throw new Error('OUTCOME_DRAFT_INVALID');
    }
    return {
      actionId: draft['actionId'],
      ...(typeof draft['currentStateId'] === 'string'
        ? { currentStateId: draft['currentStateId'] }
        : {}),
      inputFactRefs: draft['inputFactRefs'].map(factReference),
      outputs: draft['outputs'].map(outputDraft),
      expectedRevision: draft['expectedRevision'] as number,
    };
  }
}

class ParentSessionHitl implements WorkItemHitlPort {
  constructor(private readonly sessions: ProjectContractSessionPort) {}

  async open(input: HitlOpenInput): Promise<void> {
    const sessionId = input.request.parentSessionId;
    if (!sessionId) {throw new Error('PARENT_SESSION_REQUIRED');}
    const updated = await this.sessions.addMessage(
      sessionId,
      {
        role: 'assistant',
        content: JSON.stringify({
          type: 'work_item_hitl',
          requestId: input.request.requestId,
          runId: input.run.runId,
          workItemId: input.request.workItemId,
          question: input.request.question,
          options: input.request.options,
        }),
        metadata: {
          collaborationRunId: input.run.runId,
          hitlRequestId: input.request.requestId,
        },
      },
      input.run.projectId,
    );
    if (!updated) {throw new Error('PARENT_SESSION_UNAVAILABLE');}
  }
}

function taskCreationSessionId(projectId: string, requestId: string): string {
  return `approved-task-${createHash('sha256')
    .update(`${projectId}:${requestId}`)
    .digest('hex')
    .slice(0, 32)}`;
}

class RuntimeApprovedProjectTaskPort implements ApprovedProjectTaskPort {
  constructor(
    private readonly host: ProjectContractRuntimeHostCapabilities,
    private readonly taskBoard: ProjectTaskBoardService,
  ) {}

  async findByRequest(
    projectId: string,
    requestId: string,
  ): Promise<ApprovedProjectTaskReceipt | null> {
    const sessionId = taskCreationSessionId(projectId, requestId);
    const session = await this.host.sessions.getSession(sessionId, projectId);
    if (!session?.taskRuntime
      || session.taskRuntime.execution.requestId !== requestId
      || !session.taskRuntime.execution.projection) {
      return null;
    }
    const projection = session.taskRuntime.execution.projection;
    const parentStepId = projection.currentStep ?? projection.steps[0]?.id;
    if (!parentStepId) throw new Error('APPROVED_TASK_STEP_MISSING');
    return {
      task: await this.taskBoard.getProjectTask(projectId, projection.taskId),
      parentStepId,
      parentSessionId: sessionId,
    };
  }

  async create(input: ApprovedProjectTaskCreateRequest): Promise<ApprovedProjectTaskReceipt> {
    const recovered = await this.findByRequest(input.projectId, input.requestId);
    if (recovered) return recovered;
    const sessionId = taskCreationSessionId(input.projectId, input.requestId);
    const session = await this.host.sessions.getSession(sessionId, input.projectId)
      ?? await this.host.sessions.createSession({
        sessionId,
        projectId: input.projectId,
        projectName: input.projectId,
        agentType: 'project-agent',
        systemPrompt: [
          'Execute only the approved project Task. The collaboration topology is frozen by its published contract.',
          `Contract: ${input.source.contractId} (${input.source.contractHash})`,
          `Template: ${input.source.taskTemplateId}`,
        ].join('\n'),
      });
    const runtime = await this.host.agents.getOrCreateTaskRuntime(session, {
      persist: async (state) => {
        const updated = await this.host.sessions.updateSession(
          sessionId,
          { taskRuntime: state },
          input.projectId,
        );
        if (!updated) throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');
      },
    });
    const snapshot = await runtime.createTask({
      version: 1,
      requestId: input.requestId,
      sessionId,
      title: input.title,
      objective: input.objective,
      acceptanceCriteria: [...input.acceptanceCriteria],
      context: JSON.stringify({ source: input.source }),
    });
    if (!snapshot.projection || snapshot.execution.status === 'failed') {
      throw new Error(snapshot.execution.lastError?.message ?? 'APPROVED_TASK_CREATION_FAILED');
    }
    const parentStepId = snapshot.projection.currentStep ?? snapshot.projection.steps[0]?.id;
    if (!parentStepId) throw new Error('APPROVED_TASK_STEP_MISSING');
    return {
      task: await this.taskBoard.getProjectTask(input.projectId, snapshot.projection.taskId),
      parentStepId,
      parentSessionId: sessionId,
    };
  }
}

function createProjectEvidenceSink(
  host: ProjectContractRuntimeHostCapabilities,
): WorkItemEvidenceSink {
  return {
    async record(input: EvidenceSubmissionInput): Promise<EvidenceReceipt> {
      const taskId = input.workItem.binding.parentTaskId;
      const records = await host.sessions.listTaskRuntimeSessions(input.run.projectId);
      const record = records.find(({ taskRuntime }) =>
        taskRuntime.execution.projection?.taskId === taskId
      );
      if (!record) {throw new Error('PROJECT_TASK_RUNTIME_UNAVAILABLE');}
      const session = await host.sessions.getSession(record.sessionId, input.run.projectId);
      if (!session) {throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');}
      const runtime = await host.agents.getOrCreateTaskRuntime(session, {
        persist: async (state) => {
          const updated = await host.sessions.updateSession(
            session.sessionId,
            { taskRuntime: state },
            input.run.projectId,
          );
          if (!updated) {throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');}
        },
      });
      return createAgentTaskEvidenceSink(runtime).record(input);
    },
  };
}

function recoveryUnavailable(
  code: Extract<ProjectTaskRuntimeRecoveryResult, { status: 'unavailable' }>['code'],
): ProjectTaskRuntimeRecoveryResult {
  return { status: 'unavailable', code };
}

function isExactRecoveredTask(
  snapshot: AgentTaskRuntimeSnapshotV1,
  input: ProjectTaskRuntimeRecoveryInput,
): boolean {
  return snapshot.sessionId === input.sessionId
    && snapshot.projection?.taskId === input.taskId
    && snapshot.execution.taskId === input.taskId
    && snapshot.execution.expectedRevision === snapshot.projection.revision
    && snapshot.execution.expectedCursor === snapshot.projection.cursor;
}

/**
 * Core-owned session recovery. It hydrates the original persisted Session into
 * the supplied AgentManager and deliberately does not call resumeAfterRestore.
 */
export class ProjectContractTaskRuntimeRecovery implements ProjectTaskRuntimeRecoveryPort {
  private readonly pending = new Map<string, Promise<ProjectTaskRuntimeRecoveryResult>>();

  constructor(private readonly host: ProjectContractRuntimeHostCapabilities) {}

  recover(input: ProjectTaskRuntimeRecoveryInput): Promise<ProjectTaskRuntimeRecoveryResult> {
    const key = `${input.projectId}:${input.sessionId}:${input.taskId}`;
    const current = this.pending.get(key);
    if (current) return current;
    const recovery = this.restore(input).finally(() => {
      if (this.pending.get(key) === recovery) this.pending.delete(key);
    });
    this.pending.set(key, recovery);
    return recovery;
  }

  private async restore(
    input: ProjectTaskRuntimeRecoveryInput,
  ): Promise<ProjectTaskRuntimeRecoveryResult> {
    try {
      const session = await this.host.sessions.getSession(input.sessionId, input.projectId);
      if (!session) return recoveryUnavailable('SESSION_NOT_FOUND');
      if (
        session.sessionId !== input.sessionId
        || session.projectContext.projectId !== input.projectId
      ) {
        return recoveryUnavailable('PROJECT_SCOPE_MISMATCH');
      }
      if (
        !isAgentTaskRuntimePersistenceV1(session.taskRuntime)
        || session.taskRuntime.execution.taskId !== input.taskId
        || session.taskRuntime.execution.projection?.taskId !== input.taskId
      ) {
        return recoveryUnavailable('TASK_BINDING_MISMATCH');
      }
      const runtime = await this.host.agents.getOrCreateTaskRuntime(session, {
        persist: async (state) => {
          const authority = await this.host.sessions.getSession(input.sessionId, input.projectId);
          if (
            !authority
            || authority.sessionId !== input.sessionId
            || authority.projectContext.projectId !== input.projectId
            || authority.taskRuntime?.execution.taskId !== input.taskId
          ) {
            throw new Error('PROJECT_TASK_RECOVERY_AUTHORITY_CHANGED');
          }
          const updated = await this.host.sessions.updateSession(
            input.sessionId,
            { taskRuntime: state },
            input.projectId,
          );
          if (!updated) throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');
        },
      });
      const snapshot = runtime.getSnapshot();
      if (!isExactRecoveredTask(snapshot, input)) {
        return recoveryUnavailable('TASK_BINDING_MISMATCH');
      }
      const authority = await this.host.sessions.getSession(input.sessionId, input.projectId);
      if (
        !authority
        || authority.projectContext.projectId !== input.projectId
        || authority.taskRuntime?.execution.taskId !== input.taskId
      ) {
        return recoveryUnavailable('TASK_BINDING_MISMATCH');
      }
      const persisted = await this.host.sessions.updateSession(
        input.sessionId,
        { taskRuntime: runtime.getPersistenceState() },
        input.projectId,
      );
      if (!persisted) return recoveryUnavailable('RUNTIME_RECOVERY_FAILED');
      return { status: 'recovered', snapshot };
    } catch {
      return recoveryUnavailable('RUNTIME_RECOVERY_FAILED');
    }
  }
}

/** Resolves a project Task to its original Session before entering Task Runtime CAS. */
export class ProjectContractTaskPriorityMutation implements ProjectTaskPriorityMutationPort {
  constructor(private readonly host: ProjectContractRuntimeHostCapabilities) {}

  async updateProjectTaskPriority(
    input: ProjectTaskPriorityMutationInput,
  ): Promise<AgentTaskProjectMetadataMutationReceiptV1> {
    const records = await this.host.sessions.listTaskRuntimeSessions(input.projectId);
    const matches = records.filter(({ taskRuntime }) =>
      taskRuntime.execution.taskId === input.taskId
      && taskRuntime.execution.projection?.taskId === input.taskId
    );
    if (matches.length !== 1) {
      throw new Error('PROJECT_TASK_RUNTIME_UNAVAILABLE');
    }
    const record = matches[0]!;
    const session = await this.host.sessions.getSession(record.sessionId, input.projectId);
    if (!session || session.projectContext.projectId !== input.projectId) {
      throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');
    }
    const runtime = await this.host.agents.getOrCreateTaskRuntime(session, {
      persist: async (state) => {
        const updated = await this.host.sessions.updateSession(
          record.sessionId,
          { taskRuntime: state },
          input.projectId,
        );
        if (!updated) throw new Error('PROJECT_TASK_SESSION_UNAVAILABLE');
      },
    });
    return runtime.updateProjectTaskMetadata({
      version: 1,
      projectId: input.projectId,
      sessionId: record.sessionId,
      taskId: input.taskId,
      requestId: input.requestId,
      priority: input.priority,
      expectedRevision: input.expectedRevision,
      expectedCursor: input.expectedCursor,
      bridgeEpoch: input.bridgeEpoch,
    });
  }
}

/**
 * The only production composition for contract-bound project execution.
 * Web and Desktop provide host singletons; all business adapters remain in Core.
 */
export function createProjectContractRuntimeComposition(
  options: ProjectContractRuntimeCompositionOptions,
): ProjectContractRuntimeComposition {
  const contractStore = new SolutionExecutionContractStore(options.dataRoot);
  const contractPort = options.contractPort ?? {
    load: contractStore.load.bind(contractStore),
    verifyIntegrity: async (contract: SolutionExecutionContract): Promise<ContractIntegrityResult> => contractStore.verifyIntegrity(contract),
  };
  const osdk = new CanonicalOntologyOSDK(new CanonicalOntologyStore(options.dataRoot));
  const verifier = new VersionedContractVerifierRegistry(
    [new ArtifactVerifier(options.dataRoot), ...(options.additionalVerifiers ?? [])],
    [artifactEvidenceSchema, ...(options.additionalEvidenceSchemas ?? [])],
  );
  const executionPort = new CollaborationExecutionStore(
    contractPort,
    options.dataRoot,
    {
      readiness: new CanonicalReadiness(options.dataRoot, osdk),
      worker: new ContractBoundAgentSkillWorker(
        new AgentManagerContractRuntime(options.dataRoot, options.host.agents),
      ),
      verifier,
      outcome: new CanonicalOntologyOutcomeAdapter(
        osdk,
        new ArtifactOutcomeDrafts(options.dataRoot),
      ),
      evidenceSink: createProjectEvidenceSink(options.host),
      hitl: new ParentSessionHitl(options.host.sessions),
      mutationLock: new FileCollaborationMutationLock(options.dataRoot),
      ...(options.hostId ? { hostId: options.hostId } : {}),
    },
  );
  const taskRuntimeRecovery = new ProjectContractTaskRuntimeRecovery(options.host);
  const reviewPort = typeof options.host.agents.requestTaskReview === 'function'
    && typeof options.host.agents.approveTaskCompletion === 'function'
    && typeof options.host.agents.rejectTaskReview === 'function'
    ? {
        requestReview: options.host.agents.requestTaskReview.bind(options.host.agents),
        approveCompletion: options.host.agents.approveTaskCompletion.bind(options.host.agents),
        rejectReview: options.host.agents.rejectTaskReview.bind(options.host.agents),
      }
    : undefined;
  const taskBoard = new ProjectTaskBoardService(
    new RuntimeProjectTaskSource(
      options.host.sessions,
      options.host.agents,
      executionPort,
      reviewPort,
      taskRuntimeRecovery,
    ),
    executionPort,
  );
  const taskCreation = new ApprovedProjectTaskCreationService(options.dataRoot, {
    contractPort,
    factPort: osdk,
    taskPort: new RuntimeApprovedProjectTaskPort(options.host, taskBoard),
    executionPort,
  });
  const taskPriority = new ProjectContractTaskPriorityMutation(options.host);
  const taskSubscriptions = new AuthorizedProjectTaskSubscriptions(
    options.projectAccess,
    new ProjectTaskEventAggregator(options.projectTaskChangeSources ?? [], options.hostId),
  );
  const service = new OntologyCrossPackageService({
    projectAccess: options.projectAccess,
    osdk,
    contractPort,
    contractCatalog: contractStore,
    executionPort,
    taskBoard,
    taskCreation,
    workItemRecovery: new OntologyWorkItemRecovery(executionPort),
    taskPriority,
    taskSubscriptions,
  });
  return { service, executionPort, taskBoard, contractPort, taskCreation, taskSubscriptions };
}

export function projectContractRuntimeHost(
  sessions: AgentSessionService,
  agents: AgentManager,
): ProjectContractRuntimeHostCapabilities {
  return { sessions, agents };
}
