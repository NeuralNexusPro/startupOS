import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CANONICAL_ONTOLOGY_SCHEMA_VERSION,
  CanonicalOntologyStore,
  type CanonicalOntology,
} from '../../ontology';
import type { SolutionExecutionContract } from '../../solution';
import {
  ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF,
  ORIGINOS_ARTIFACT_VERIFIER_REF,
  createProjectContractRuntimeComposition,
  type ProjectContractRuntimeComposition,
  type ProjectContractRuntimeHostCapabilities,
} from '../contract-bound-runtime-composition';

import type { WorkItemExecutionStage } from '../../../../modules/collaboration-runtime/facade';
import type {
  VersionedContractVerifier,
  VersionedEvidenceSchema,
} from '../../../../modules/collaboration-runtime/integrations';

const HASH = `sha256:${'a'.repeat(64)}`;
const instant = new Date('2026-09-25T08:00:00.000Z');
const roots: string[] = [];

interface WorkerPromptRequest {
  readonly requestId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly workItemId: string;
  readonly attemptId: string;
  readonly target: { readonly targetId: string };
}

interface Harness {
  readonly root: string;
  readonly host: ProjectContractRuntimeHostCapabilities;
  readonly promptCalls: string[];
  readonly executionKeys: string[];
  readonly evidenceCalls: string[];
  readonly hitlMessages: string[];
  readonly composition: (options?: {
    readonly hostId?: string;
    readonly verifiers?: readonly VersionedContractVerifier[];
    readonly schemas?: readonly VersionedEvidenceSchema[];
  }) => ProjectContractRuntimeComposition;
  evidenceBehavior?: (requestId: string) => Promise<{
    readonly eventId: string;
    readonly revisionAfter: number;
  }>;
  promptBehavior?: (
    request: WorkerPromptRequest,
    content: string,
  ) => Promise<void>;
}

function ontology(): CanonicalOntology {
  return {
    id: 'orders',
    projectId: 'project-1',
    name: 'Orders',
    schemaVersion: CANONICAL_ONTOLOGY_SCHEMA_VERSION,
    version: '1',
    domains: [{
      id: 'sales',
      name: 'Sales',
      description: '',
      createdAt: instant,
      updatedAt: instant,
    }],
    concepts: [{
      id: 'order',
      domainId: 'sales',
      name: 'Order',
      type: 'aggregate',
      attributes: {},
      createdAt: instant,
      updatedAt: instant,
    }],
    instances: [],
    properties: [],
    relations: [],
    businessStates: [],
    transitions: [],
    factTypes: [{
      id: 'ready',
      conceptId: 'order',
      name: 'Ready',
      propertyIds: [],
    }],
    rules: [],
    actions: [{
      id: 'prepare-order',
      name: 'Prepare order',
      conceptId: 'order',
      inputFactTypeIds: [],
      outputFactTypeIds: ['ready'],
      permissions: ['order.prepare'],
    }],
    events: [],
    projections: [],
    createdAt: instant,
    updatedAt: instant,
  };
}

function contract(options: {
  readonly nodeIds?: readonly string[];
  readonly verifierRef?: string;
  readonly evidenceSchemaRef?: string;
  readonly maxTokens?: number;
  readonly hitl?: SolutionExecutionContract['hitl'];
} = {}): SolutionExecutionContract {
  const nodeIds = options.nodeIds ?? ['prepare'];
  const verifierRef = options.verifierRef ?? ORIGINOS_ARTIFACT_VERIFIER_REF;
  const evidenceSchemaRef = options.evidenceSchemaRef
    ?? ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF;
  return {
    schemaVersion: '1.0.0',
    contractId: 'solution@1',
    contractHash: HASH,
    projectId: 'project-1',
    solutionId: 'solution',
    solutionVersion: '1',
    status: 'approved',
    modelingDimension: 'workflow',
    topology: {
      nodes: nodeIds.map((id) => ({
        id,
        kind: 'agent' as const,
        contractRef: 'preparer',
        requiresVerification: true,
      })),
      edges: [],
      externalInputs: [],
    },
    agents: [{
      agentId: 'preparer',
      ontology: { ontologyId: 'orders', ontologyVersion: '1' },
      inputs: [],
      outputs: [{
        factType: {
          ontologyId: 'orders',
          ontologyVersion: '1',
          conceptId: 'order',
          factTypeId: 'ready',
        },
        required: true,
      }],
      actions: [{
        actionId: 'prepare-order',
        concept: {
          ontologyId: 'orders',
          ontologyVersion: '1',
          conceptId: 'order',
        },
      }],
      permissions: ['order.prepare'],
    }],
    skills: [],
    semanticContext: {
      ontology: { ontologyId: 'orders', ontologyVersion: '1' },
      sourceRefs: [],
      objectSlots: [],
      allowedActionIds: ['prepare-order'],
      taskTemplates: nodeIds.map((designNodeId) => ({
        id: `${designNodeId}-template`,
        designNodeId,
        objective: `Execute ${designNodeId}`,
        candidateAgentIds: ['preparer'],
        candidateSkillIds: [],
      })),
    },
    verification: nodeIds.map((nodeId) => ({
      id: `verify-${nodeId}`,
      nodeId,
      verifierRef,
      evidenceSchemaRef,
    })),
    hitl: options.hitl ?? [],
    permissions: { allowed: ['order.prepare'] },
    budget: {
      maxAttempts: 2,
      maxDurationMs: 60_000,
      maxTokens: options.maxTokens ?? 1_000,
    },
    createdAt: instant.toISOString(),
  };
}

function workerContent(request: WorkerPromptRequest): string {
  const factId = `ready-${request.workItemId.replace(/[^A-Za-z0-9]/g, '-')}`;
  return JSON.stringify({
    outcome: {
      actionId: 'prepare-order',
      inputFactRefs: [],
      outputs: [{
        factId,
        factTypeId: 'ready',
        value: { ready: true },
        source: { sourceType: 'runtime', sourceId: request.attemptId },
      }],
      expectedRevision: 0,
    },
  });
}

async function harness(frozen = contract()): Promise<Harness> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'originos-contract-recovery-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'projects', 'project-1', 'agents', 'preparer'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, 'projects', 'project-1', 'agents', 'preparer', 'Agent.md'),
    '# Preparer',
    'utf8',
  );
  await new CanonicalOntologyStore(root).writeOntology('project-1', ontology());

  const promptCalls: string[] = [];
  const executionKeys: string[] = [];
  const evidenceCalls: string[] = [];
  const hitlMessages: string[] = [];
  const test = {} as Harness;
  const host = {
    sessions: {
      listTaskRuntimeSessions: async () => [{
        sessionId: 'parent-session',
        projectId: 'project-1',
        updatedAt: Date.now(),
        taskRuntime: {
          execution: { projection: { taskId: 'task-1' } },
        },
      }],
      getSession: async () => ({
        sessionId: 'parent-session',
        projectId: 'project-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      updateSession: async () => ({
        sessionId: 'parent-session',
        projectId: 'project-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      addMessage: async (
        _sessionId: string,
        message: { readonly content: string },
      ) => {
        hitlMessages.push(message.content);
        return {
          sessionId: 'parent-session',
          projectId: 'project-1',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    },
    agents: {
      getOrCreateAgent: async (executionKey: string) => {
        executionKeys.push(executionKey);
        let content = '';
        return {
          abort: () => undefined,
          prompt: async (prompt: string) => {
            promptCalls.push(prompt);
            const parsed = JSON.parse(prompt) as { readonly request: WorkerPromptRequest };
            content = workerContent(parsed.request);
            if (test.promptBehavior) {
              await test.promptBehavior(parsed.request, content);
            }
          },
          getSessionState: async () => ({
            sessionId: executionKey,
            messages: [{
              id: `${executionKey}:assistant`,
              role: 'assistant' as const,
              content,
              timestamp: Date.now(),
              usage: {
                input: 3,
                output: 4,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 7,
              },
            }],
            systemPrompt: '',
            model: { provider: 'test', id: 'test' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        };
      },
      getOrCreateTaskRuntime: async () => ({
        recordVerifiedEvidence: async (input: { readonly requestId: string }) => {
          evidenceCalls.push(input.requestId);
          if (test.evidenceBehavior) {return test.evidenceBehavior(input.requestId);}
          return { eventId: `evidence-${input.requestId}`, revisionAfter: 1 };
        },
      }),
      removeAgent: () => true,
      getTaskRuntimeSnapshot: () => null,
      controlTaskRuntime: async () => {
        throw new Error('not reached');
      },
    },
  } as unknown as ProjectContractRuntimeHostCapabilities;
  const composition = (options: {
    readonly hostId?: string;
    readonly verifiers?: readonly VersionedContractVerifier[];
    readonly schemas?: readonly VersionedEvidenceSchema[];
  } = {}) => createProjectContractRuntimeComposition({
    dataRoot: root,
    host,
    hostId: options.hostId,
    additionalVerifiers: options.verifiers,
    additionalEvidenceSchemas: options.schemas,
    contractPort: {
      load: async () => ({ contract: frozen }),
      verifyIntegrity: async () => ({ valid: true }),
    },
  });
  Object.assign(test, {
    root,
    host,
    promptCalls,
    executionKeys,
    evidenceCalls,
    hitlMessages,
    composition,
  });
  return test;
}

async function start(test: Harness, composition = test.composition()) {
  const run = await composition.executionPort.start({
    projectId: 'project-1',
    solutionId: 'solution',
    solutionVersion: '1',
    parentTaskId: 'task-1',
    parentStepId: 'step-1',
    parentSessionId: 'parent-session',
    taskRevision: 1,
    executionContractId: 'solution@1',
    contractHash: HASH,
    inputRefs: [],
  });
  return { composition, run };
}

function ledgerPath(root: string, runId: string): string {
  return path.join(root, 'projects', 'project-1', 'collaboration-runs', `${runId}.json`);
}

async function expireClaim(
  root: string,
  runId: string,
  stage: WorkItemExecutionStage,
): Promise<void> {
  const filePath = ledgerPath(root, runId);
  for (let index = 0; index < 200; index += 1) {
    const snapshot = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
      workItems: Array<{
        attempts: Array<{
          stageClaim?: { stage: WorkItemExecutionStage; expiresAt: string };
        }>;
      }>;
    };
    const claim = snapshot.workItems[0]?.attempts[0]?.stageClaim;
    if (claim?.stage === stage) {
      claim.expiresAt = '1970-01-01T00:00:00.000Z';
      await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${stage} stage claim`);
}

function never(): Promise<never> {
  return new Promise(() => undefined);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })
  ));
});

describe('contract-bound production recovery', () => {
  it('recovers an expired readiness claim after a process exit', async () => {
    const test = await harness();
    const { composition, run } = await start(test);
    vi.spyOn(fs, 'stat').mockImplementationOnce(() => never());
    void composition.executionPort.executeWorkItem({
      runId: run.runId,
      workItemId: run.workItems[0]!.id,
      requestId: 'readiness-crash',
      payloadHash: HASH,
    }).catch(() => undefined);
    await expireClaim(test.root, run.runId, 'readiness');
    vi.restoreAllMocks();

    const recovered = await test.composition({ hostId: 'restart' }).executionPort.recover(run.runId);
    expect(recovered.terminalStatus).toBe('completed');
    expect(test.promptCalls).toHaveLength(1);
  });

  it('reuses a persisted Worker artifact instead of invoking the Agent again', async () => {
    const test = await harness();
    const { composition, run } = await start(test);
    test.promptBehavior = async (request, content) => {
      const filePath = path.join(
        test.root,
        'projects',
        request.projectId,
        'collaboration-artifacts',
        request.runId,
        request.workItemId,
        `${request.attemptId}.json`,
      );
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({
        schemaVersion: '1.0.0',
        requestId: request.requestId,
        runId: request.runId,
        workItemId: request.workItemId,
        attemptId: request.attemptId,
        targetId: request.target.targetId,
        content,
        createdAt: instant.toISOString(),
      }, null, 2), 'utf8');
      return never();
    };
    void composition.executionPort.executeWorkItem({
      runId: run.runId,
      workItemId: run.workItems[0]!.id,
      requestId: 'worker-crash',
      payloadHash: HASH,
    }).catch(() => undefined);
    await expireClaim(test.root, run.runId, 'worker');
    test.promptBehavior = undefined;

    const recovered = await test.composition({ hostId: 'restart' }).executionPort.recover(run.runId);
    expect(recovered.terminalStatus).toBe('completed');
    expect(test.promptCalls).toHaveLength(1);
    expect(test.executionKeys).toHaveLength(1);
  });

  it('resumes verifier, Action and Evidence claims without repeating prior stages', async () => {
    const crashVerifierRef = 'originos.crash-verifier@1.0.0';
    const crashSchemaRef = 'originos.crash-evidence@1.0.0';
    const frozen = contract({
      verifierRef: crashVerifierRef,
      evidenceSchemaRef: crashSchemaRef,
    });
    const test = await harness(frozen);
    const schema: VersionedEvidenceSchema = {
      ref: crashSchemaRef,
      validate: () => ({ valid: true }),
    };
    const blockedVerifier: VersionedContractVerifier = {
      ref: crashVerifierRef,
      verify: () => never(),
    };
    const passingVerifier: VersionedContractVerifier = {
      ref: crashVerifierRef,
      verify: async (input) => ({
        status: 'passed',
        artifactRefs: input.workerReceipt.outputRefs,
        resultRef: `${input.idempotencyKey}:verified`,
        evidence: { persisted: true },
      }),
    };
    const first = await start(test, test.composition({
      hostId: 'verifier-crash',
      verifiers: [blockedVerifier],
      schemas: [schema],
    }));
    void first.composition.executionPort.executeWorkItem({
      runId: first.run.runId,
      workItemId: first.run.workItems[0]!.id,
      requestId: 'verifier-crash',
      payloadHash: HASH,
    }).catch(() => undefined);
    await expireClaim(test.root, first.run.runId, 'verifier');

    const afterVerifier = test.composition({
      hostId: 'outcome-crash',
      verifiers: [passingVerifier],
      schemas: [schema],
    });
    const appendFact = vi.spyOn(CanonicalOntologyStore.prototype, 'appendFact')
      .mockImplementationOnce(() => never());
    void afterVerifier.executionPort.recover(first.run.runId).catch(() => undefined);
    await expireClaim(test.root, first.run.runId, 'outcome');
    appendFact.mockRestore();

    let acceptedEvidence = false;
    test.evidenceBehavior = async (requestId) => {
      if (!acceptedEvidence) {
        acceptedEvidence = true;
        return never();
      }
      return { eventId: `evidence-${requestId}`, revisionAfter: 7 };
    };
    const afterOutcome = test.composition({
      hostId: 'evidence-crash',
      verifiers: [passingVerifier],
      schemas: [schema],
    });
    void afterOutcome.executionPort.recover(first.run.runId).catch(() => undefined);
    await expireClaim(test.root, first.run.runId, 'evidence');

    const recovered = await test.composition({
      hostId: 'final-restart',
      verifiers: [passingVerifier],
      schemas: [schema],
    }).executionPort.recover(first.run.runId);
    expect(recovered.terminalStatus).toBe('completed');
    expect(test.promptCalls).toHaveLength(1);
    expect(test.evidenceCalls).toHaveLength(2);
    const facts = await new CanonicalOntologyStore(test.root).readFacts('project-1');
    expect(facts).toHaveLength(1);
    const operations = await new CanonicalOntologyStore(test.root).readOperations('project-1');
    expect(operations.filter(({ status }) => status === 'accepted')).toHaveLength(1);

    const replayed = await test.composition({
      hostId: 'response-lost-restart',
      verifiers: [passingVerifier],
      schemas: [schema],
    }).executionPort.recover(first.run.runId);
    expect(replayed).toEqual(recovered);
    expect(test.promptCalls).toHaveLength(1);
    expect(test.evidenceCalls).toHaveLength(2);
    expect(await new CanonicalOntologyStore(test.root).readFacts('project-1'))
      .toHaveLength(1);
    expect((await new CanonicalOntologyStore(test.root).readOperations('project-1'))
      .filter(({ status }) => status === 'accepted')).toHaveLength(1);
  });

  it('isolates concurrent WorkItems for the same Agent and aggregates Run completion', async () => {
    const test = await harness(contract({ nodeIds: ['prepare-a', 'prepare-b'] }));
    const { composition, run } = await start(test);
    const [first] = await Promise.all(run.workItems.map((item, index) =>
      composition.executionPort.executeWorkItem({
        runId: run.runId,
        workItemId: item.id,
        requestId: `parallel-${index}`,
        payloadHash: HASH,
      })
    ));
    expect(first.workItems.find(({ id }) => id === run.workItems[0]!.id)?.status)
      .toBe('completed');
    expect((await composition.executionPort.inspect(run.runId)).terminalStatus)
      .toBe('completed');
    expect(new Set(test.executionKeys).size).toBe(2);
    expect(test.executionKeys.every((key) => key.startsWith(`${run.runId}:`))).toBe(true);
    expect(await new CanonicalOntologyStore(test.root).readFacts('project-1')).toHaveLength(2);
  });

  it('serializes two production hosts with filesystem CAS', async () => {
    const test = await harness();
    const first = test.composition({ hostId: 'web' });
    const second = test.composition({ hostId: 'desktop' });
    const { run } = await start(test, first);
    const request = {
      runId: run.runId,
      workItemId: run.workItems[0]!.id,
      requestId: 'dual-host',
      payloadHash: HASH,
    };
    const results = await Promise.allSettled([
      first.executionPort.executeWorkItem(request),
      second.executionPort.executeWorkItem(request),
    ]);
    expect(results.some(({ status }) => status === 'fulfilled')).toBe(true);
    const recovered = await first.executionPort.recover(run.runId);
    expect(recovered.terminalStatus).toBe('completed');
    expect(test.promptCalls).toHaveLength(1);
    expect(test.evidenceCalls).toHaveLength(1);
  });

  it('enforces token budget before Action and Evidence', async () => {
    const test = await harness(contract({ maxTokens: 6 }));
    const { composition, run } = await start(test);
    const result = await composition.executionPort.executeWorkItem({
      runId: run.runId,
      workItemId: run.workItems[0]!.id,
      requestId: 'budget',
      payloadHash: HASH,
    });
    const attempt = result.workItems[0]!.attempts[0]!;
    expect(attempt.status).toBe('failed');
    expect(attempt.reason).toBe('MAX_TOKENS_EXCEEDED');
    expect(attempt.outcomeReceipt).toBeUndefined();
    expect(attempt.evidenceReceipt).toBeUndefined();
    expect(result.terminalStatus).toBe('failed');
  });

  it('restores the same persistent HITL request and advances one approved attempt', async () => {
    const test = await harness(contract({
      hitl: [{
        id: 'approve-prepare',
        nodeId: 'prepare',
        trigger: 'before_execution',
        approverRole: 'owner',
      }],
    }));
    const { composition, run } = await start(test);
    const waiting = await composition.executionPort.executeWorkItem({
      runId: run.runId,
      workItemId: run.workItems[0]!.id,
      requestId: 'hitl',
      payloadHash: HASH,
    });
    const attempt = waiting.workItems[0]!.attempts[0]!;
    const request = attempt.hitlRequests?.[0];
    expect(request).toMatchObject({ status: 'pending', trigger: 'before_execution' });
    const restarted = test.composition({ hostId: 'restart' });
    const recovered = await restarted.executionPort.recover(run.runId);
    expect(recovered.workItems[0]!.attempts[0]!.hitlRequests?.[0]?.requestId)
      .toBe(request?.requestId);
    const completed = await restarted.executionPort.resolveHitl({
      runId: run.runId,
      requestId: request!.requestId,
      attemptId: attempt.attemptId,
      leaseEpoch: attempt.leaseEpoch,
      decision: 'approve',
      decisionRef: 'parent-session:message-1',
    });
    expect(completed.terminalStatus).toBe('completed');
    const replay = await restarted.executionPort.resolveHitl({
      runId: run.runId,
      requestId: request!.requestId,
      attemptId: attempt.attemptId,
      leaseEpoch: attempt.leaseEpoch,
      decision: 'approve',
      decisionRef: 'parent-session:message-1',
    });
    expect(replay.revision).toBe(completed.revision);
    expect(test.promptCalls).toHaveLength(1);
  });
});
