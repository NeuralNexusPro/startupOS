#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const os = require('node:os');
const asar = require('@electron/asar');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const packagedAsar = process.argv[2] ? path.resolve(process.argv[2]) : null;
const extracted = packagedAsar
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'originos-ontology-runtime-'))
  : null;
if (packagedAsar) asar.extractAll(packagedAsar, extracted);
const runtimeRoot = extracted
  ? path.join(extracted, 'dist-electron')
  : path.join(repoRoot, 'dist-electron');
const runtimeRequire = createRequire(path.join(extracted ?? repoRoot, 'package.json'));
const files = {
  service: path.join(runtimeRoot, 'core/src/lib/features/project/ontology-cross-package-service.js'),
  recovery: path.join(runtimeRoot, 'core/src/lib/features/project/ontology-work-item-recovery.js'),
  execution: path.join(runtimeRoot, 'core/src/modules/collaboration-runtime/facade/contract-execution.js'),
  composition: path.join(runtimeRoot, 'core/src/lib/features/project/contract-bound-runtime-composition.js'),
  taskSource: path.join(runtimeRoot, 'core/src/lib/features/project/project-task-source.js'),
  ontology: path.join(runtimeRoot, 'core/src/lib/features/ontology/index.js'),
  desktop: path.join(runtimeRoot, 'desktop/src/main/services/ontology-cross-package-ipc.js'),
  protocol: path.join(runtimeRoot, 'desktop/src/main/ipc-protocol.js'),
};

for (const [name, filePath] of Object.entries(files)) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing ONT ${name} runtime: ${filePath}`);
}

const service = runtimeRequire(files.service);
const recovery = runtimeRequire(files.recovery);
const execution = runtimeRequire(files.execution);
const composition = runtimeRequire(files.composition);
const taskSource = runtimeRequire(files.taskSource);
const ontology = runtimeRequire(files.ontology);
if (typeof service.OntologyCrossPackageService !== 'function') {
  throw new Error('OntologyCrossPackageService export is unavailable');
}
if (typeof recovery.OntologyWorkItemRecovery !== 'function') {
  throw new Error('OntologyWorkItemRecovery export is unavailable');
}
if (typeof execution.CollaborationExecutionStore !== 'function') {
  throw new Error('CollaborationExecutionStore export is unavailable');
}
if (typeof composition.createProjectContractRuntimeComposition !== 'function') {
  throw new Error('Project contract runtime composition export is unavailable');
}
if (typeof composition.ProjectContractTaskRuntimeRecovery !== 'function'
  || typeof composition.projectContractRuntimeHost !== 'function') {
  throw new Error('Project Task Runtime recovery composition exports are unavailable');
}
if (typeof taskSource.RuntimeProjectTaskSource !== 'function') {
  throw new Error('Project Task Runtime source export is unavailable');
}
if (typeof ontology.CanonicalOntologyStore !== 'function') {
  throw new Error('CanonicalOntologyStore export is unavailable');
}
const desktopSource = fs.readFileSync(files.desktop, 'utf8');
const protocolSource = fs.readFileSync(files.protocol, 'utf8');
if (!desktopSource.includes('createProjectContractRuntimeComposition')) {
  throw new Error('Desktop ONT runtime is not wired to the shared project composition');
}
if (!desktopSource.includes('projectContractRuntimeHost')) {
  throw new Error('Desktop ONT runtime does not inject the shared Task Runtime recovery host');
}
if (!desktopSource.includes('ONTOLOGY_CROSS_PACKAGE_INVOKE')
  || !protocolSource.includes('ontology:cross-package:invoke')) {
  throw new Error('Desktop ONT IPC channel is missing');
}

async function verifyRecoveryLedger() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-ontology-ledger-'));
  const contract = {
    schemaVersion: '1.0.0',
    contractId: 'smoke-contract-1',
    contractHash: 'sha256:smoke-contract-1',
    projectId: 'smoke-project',
    solutionId: 'smoke-solution',
    solutionVersion: '1',
    status: 'approved',
    modelingDimension: 'workflow',
    topology: {
      nodes: [{ id: 'smoke-node', kind: 'agent', contractRef: 'smoke-agent', requiresVerification: true }],
      edges: [],
      externalInputs: [],
    },
    agents: [{ agentId: 'smoke-agent', ontology: { ontologyId: 'smoke', ontologyVersion: '1' }, inputs: [], outputs: [], actions: [], permissions: [] }],
    skills: [],
    semanticContext: { ontology: { ontologyId: 'smoke', ontologyVersion: '1' }, sourceRefs: [], objectSlots: [], allowedActionIds: [], taskTemplates: [] },
    verification: [],
    hitl: [],
    permissions: { allowed: [] },
    budget: { maxAttempts: 1, maxDurationMs: 1000, maxTokens: 1000 },
    createdAt: '2026-09-25T00:00:00.000Z',
  };
  const contractPort = {
    load: async () => ({ contract }),
    verifyIntegrity: async () => ({ valid: true }),
  };
  try {
    const firstHost = new execution.CollaborationExecutionStore(contractPort, dataRoot);
    const run = await firstHost.start({
      projectId: 'smoke-project',
      solutionId: 'smoke-solution',
      solutionVersion: '1',
      parentTaskId: 'smoke-task',
      parentStepId: 'smoke-step',
      taskRevision: 1,
      executionContractId: 'smoke-contract-1',
      contractHash: 'sha256:smoke-contract-1',
      inputRefs: [],
    });
    await firstHost.pause(run.runId);
    const restarted = new execution.CollaborationExecutionStore(contractPort, dataRoot);
    if ((await restarted.recover(run.runId)).status !== 'paused') {
      throw new Error('Packaged ONT runtime auto-resumed a paused Run');
    }
    await restarted.resume(run.runId);
    await restarted.cancel(run.runId);
    const finalHost = new execution.CollaborationExecutionStore(contractPort, dataRoot);
    if ((await finalHost.recover(run.runId)).status !== 'canceled') {
      throw new Error('Packaged ONT runtime revived a canceled Run');
    }
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

async function verifyProjectTaskRuntimeRecovery() {
  const task = {
    version: 1,
    taskId: 'smoke-task',
    title: 'Packaged recovery smoke',
    objective: 'Recover the original Task Runtime',
    status: 'active',
    progress: 50,
    steps: [],
    criteria: [],
    blockers: [],
    warnings: [],
    evidenceCount: 1,
    actions: ['resume', 'cancel'],
    revision: 4,
    cursor: 'cursor-4',
    stateHash: 'state-4',
    truncated: false,
  };
  const executionState = {
    schemaVersion: 1,
    mode: 'task_running',
    status: 'paused',
    taskId: task.taskId,
    bridgeEpoch: 7,
    expectedRevision: task.revision,
    expectedCursor: task.cursor,
    continuationCount: 1,
    noProgressCount: 0,
    projection: task,
    updatedAt: '2026-09-25T08:00:00.000Z',
  };
  let storedSession = {
    sessionId: 'smoke-session',
    createdAt: 1,
    updatedAt: 2,
    status: 'active',
    messages: [],
    projectContext: {
      projectId: 'smoke-project',
      projectName: 'Smoke project',
      currentPath: '/tmp/smoke-project',
    },
    systemPrompt: '',
    agentType: 'project',
    config: { sessionId: 'smoke-session' },
    taskRuntime: {
      schemaVersion: 1,
      branchEntries: [],
      execution: executionState,
    },
  };
  let restoreCalls = 0;
  let promptCalls = 0;
  const snapshot = {
    version: 1,
    sessionId: storedSession.sessionId,
    execution: executionState,
    projection: task,
  };
  const runtime = {
    getSnapshot: () => snapshot,
    getPersistenceState: () => storedSession.taskRuntime,
  };
  const host = {
    sessions: {
      listTaskRuntimeSessions: async () => [],
      getSession: async (sessionId, projectId) =>
        sessionId === storedSession.sessionId
          && projectId === storedSession.projectContext.projectId
          ? structuredClone(storedSession)
          : null,
      updateSession: async (sessionId, updates, projectId) => {
        if (sessionId !== storedSession.sessionId
          || projectId !== storedSession.projectContext.projectId) return null;
        storedSession = { ...storedSession, ...structuredClone(updates), updatedAt: 3 };
        return structuredClone(storedSession);
      },
      addMessage: async () => null,
    },
    agents: {
      getOrCreateAgent: async () => ({
        prompt: async () => { promptCalls += 1; },
      }),
      getOrCreateTaskRuntime: async () => {
        restoreCalls += 1;
        return runtime;
      },
      removeAgent: () => true,
      getTaskRuntimeSnapshot: () => null,
      controlTaskRuntime: async () => snapshot,
      requestTaskReview: async () => snapshot,
      approveTaskCompletion: async () => snapshot,
      rejectTaskReview: async () => snapshot,
    },
  };
  const recovery = new composition.ProjectContractTaskRuntimeRecovery(host);
  const input = {
    sessionId: storedSession.sessionId,
    projectId: storedSession.projectContext.projectId,
    taskId: task.taskId,
  };
  const [first, concurrent] = await Promise.all([
    recovery.recover(input),
    recovery.recover(input),
  ]);
  if (first.status !== 'recovered' || concurrent.status !== 'recovered') {
    throw new Error('Packaged Project Task Runtime recovery returned unavailable');
  }
  if (first.snapshot.sessionId !== input.sessionId
    || first.snapshot.projection?.taskId !== input.taskId
    || first.snapshot.execution.status !== 'paused') {
    throw new Error('Packaged Project Task Runtime recovery changed authoritative binding');
  }
  if (restoreCalls !== 1 || promptCalls !== 0) {
    throw new Error('Packaged Project Task Runtime recovery duplicated or auto-started work');
  }
  const mismatch = await recovery.recover({ ...input, taskId: 'other-task' });
  if (mismatch.status !== 'unavailable' || mismatch.code !== 'TASK_BINDING_MISMATCH') {
    throw new Error('Packaged Project Task Runtime recovery did not fail closed by Task binding');
  }
}

async function verifyFrozenWorkItem() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-frozen-workitem-'));
  const projectId = 'smoke-project';
  const targetId = 'smoke-agent';
  const contractHash = `sha256:${'a'.repeat(64)}`;
  const targetDir = path.join(dataRoot, 'projects', projectId, 'agents', targetId);
  const now = new Date('2026-09-25T08:00:00.000Z');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'Agent.md'), '# Packaged smoke agent', 'utf8');
  const canonical = {
    id: 'smoke',
    projectId,
    name: 'Smoke',
    schemaVersion: ontology.CANONICAL_ONTOLOGY_SCHEMA_VERSION,
    version: '1',
    domains: [{ id: 'domain', name: 'Domain', description: '', createdAt: now, updatedAt: now }],
    concepts: [{ id: 'item', domainId: 'domain', name: 'Item', type: 'aggregate', attributes: {}, createdAt: now, updatedAt: now }],
    instances: [],
    properties: [],
    relations: [],
    businessStates: [],
    transitions: [],
    factTypes: [{ id: 'ready', conceptId: 'item', name: 'Ready', propertyIds: [] }],
    rules: [],
    actions: [{
      id: 'prepare',
      name: 'Prepare',
      conceptId: 'item',
      inputFactTypeIds: [],
      outputFactTypeIds: ['ready'],
      permissions: ['item.prepare'],
    }],
    events: [],
    projections: [],
    createdAt: now,
    updatedAt: now,
  };
  const contract = {
    schemaVersion: '1.0.0',
    contractId: 'smoke-contract@1',
    contractHash,
    projectId,
    solutionId: 'smoke-solution',
    solutionVersion: '1',
    status: 'approved',
    modelingDimension: 'workflow',
    topology: {
      nodes: [{ id: 'prepare', kind: 'agent', contractRef: targetId, requiresVerification: true }],
      edges: [],
      externalInputs: [],
    },
    agents: [{
      agentId: targetId,
      ontology: { ontologyId: 'smoke', ontologyVersion: '1' },
      inputs: [],
      outputs: [{
        factType: { ontologyId: 'smoke', ontologyVersion: '1', conceptId: 'item', factTypeId: 'ready' },
        required: true,
      }],
      actions: [{
        actionId: 'prepare',
        concept: { ontologyId: 'smoke', ontologyVersion: '1', conceptId: 'item' },
      }],
      permissions: ['item.prepare'],
    }],
    skills: [],
    semanticContext: {
      ontology: { ontologyId: 'smoke', ontologyVersion: '1' },
      sourceRefs: [],
      objectSlots: [],
      allowedActionIds: ['prepare'],
      taskTemplates: [{
        id: 'prepare-template',
        designNodeId: 'prepare',
        objective: 'Run packaged frozen WorkItem',
        candidateAgentIds: [targetId],
        candidateSkillIds: [],
      }],
    },
    verification: [{
      id: 'verify-prepare',
      nodeId: 'prepare',
      verifierRef: composition.ORIGINOS_ARTIFACT_VERIFIER_REF,
      evidenceSchemaRef: composition.ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF,
    }],
    hitl: [],
    permissions: { allowed: ['item.prepare'] },
    budget: { maxAttempts: 1, maxDurationMs: 30_000, maxTokens: 100 },
    createdAt: now.toISOString(),
  };
  let promptCalls = 0;
  let content = '';
  const host = {
    sessions: {
      listTaskRuntimeSessions: async () => [{
        sessionId: 'smoke-session',
        projectId,
        updatedAt: Date.now(),
        taskRuntime: { execution: { projection: { taskId: 'smoke-task' } } },
      }],
      getSession: async () => ({
        sessionId: 'smoke-session', projectId, messages: [], createdAt: Date.now(), updatedAt: Date.now(),
      }),
      updateSession: async () => ({
        sessionId: 'smoke-session', projectId, messages: [], createdAt: Date.now(), updatedAt: Date.now(),
      }),
      addMessage: async () => ({
        sessionId: 'smoke-session', projectId, messages: [], createdAt: Date.now(), updatedAt: Date.now(),
      }),
    },
    agents: {
      getOrCreateAgent: async () => ({
        abort: () => undefined,
        prompt: async (prompt) => {
          promptCalls += 1;
          const request = JSON.parse(prompt).request;
          content = JSON.stringify({
            outcome: {
              actionId: 'prepare',
              inputFactRefs: [],
              outputs: [{
                factId: 'ready-1',
                factTypeId: 'ready',
                value: { ready: true },
                source: { sourceType: 'runtime', sourceId: request.attemptId },
              }],
              expectedRevision: 0,
            },
          });
        },
        getSessionState: async () => ({
          sessionId: 'worker',
          messages: [{
            id: 'assistant', role: 'assistant', content, timestamp: Date.now(),
            usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
          }],
          systemPrompt: '',
          model: { provider: 'smoke', id: 'smoke' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      }),
      getOrCreateTaskRuntime: async () => ({
        recordVerifiedEvidence: async ({ requestId }) => ({
          eventId: `smoke-${requestId}`,
          revisionAfter: 1,
        }),
      }),
      removeAgent: () => true,
      getTaskRuntimeSnapshot: () => null,
      controlTaskRuntime: async () => { throw new Error('not reached'); },
    },
  };
  const contractPort = {
    load: async () => ({ contract }),
    verifyIntegrity: async () => ({ valid: true }),
  };
  try {
    await new ontology.CanonicalOntologyStore(dataRoot).writeOntology(projectId, canonical);
    const first = composition.createProjectContractRuntimeComposition({
      dataRoot,
      host,
      hostId: 'package-smoke',
      contractPort,
    });
    const run = await first.executionPort.start({
      projectId,
      solutionId: 'smoke-solution',
      solutionVersion: '1',
      parentTaskId: 'smoke-task',
      parentStepId: 'smoke-step',
      parentSessionId: 'smoke-session',
      taskRevision: 1,
      executionContractId: 'smoke-contract@1',
      contractHash,
      inputRefs: [],
    });
    const completed = await first.executionPort.executeWorkItem({
      runId: run.runId,
      workItemId: run.workItems[0].id,
      requestId: 'package-smoke-request',
      payloadHash: contractHash,
    });
    if (completed.terminalStatus !== 'completed') {
      throw new Error(`Packaged frozen WorkItem did not complete: ${completed.terminalStatus ?? completed.status}`);
    }
    const restarted = composition.createProjectContractRuntimeComposition({
      dataRoot,
      host,
      hostId: 'package-smoke-restart',
      contractPort,
    });
    if ((await restarted.executionPort.recover(run.runId)).terminalStatus !== 'completed') {
      throw new Error('Packaged frozen WorkItem did not survive restart');
    }
    if (promptCalls !== 1) {
      throw new Error(`Packaged frozen WorkItem executed ${promptCalls} times`);
    }
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
}

Promise.all([
  verifyRecoveryLedger(),
  verifyFrozenWorkItem(),
  verifyProjectTaskRuntimeRecovery(),
])
  .then(() => {
    console.log(`[verify-ontology-runtime] ${packagedAsar ? 'packaged' : 'development'} module resolution, IPC wiring, process recovery, and frozen WorkItem execution ok`);
  })
  .finally(() => {
    if (extracted) fs.rmSync(extracted, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error('[verify-ontology-runtime] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
