import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PI_TASK_EVENT_V2_SCHEMA,
  PI_TASK_LEGACY_FORCED_COMPLETION_CODE,
  createTaskRuntimeStore,
} from '../index.js';
import { assertMutationRequest } from '../src/contracts.js';
import { TASK_EVENT_CUSTOM_TYPE } from '../src/model.js';
import { reduceTaskState } from '../src/reducer.js';
import { registerTaskTools } from '../src/tools.js';

const CREATED_AT = '2026-08-01T00:00:00.000Z';

function createdEvent() {
  return {
    version: 1,
    id: 'event-create-T1',
    type: 'task.created',
    taskId: 'T1',
    createdAt: CREATED_AT,
    source: 'tool',
    title: 'Evidence gate task',
    objective: 'Prove completion requires passing evidence',
    acceptanceCriteria: ['Verified artifact exists'],
    planSteps: [{
      text: 'Verify one concrete artifact',
      expectedOutput: 'A reproducible verification artifact',
      allowedActions: ['run test'],
      evidenceRequired: true,
      decompositionStatus: 'atomic',
      granularityCheck: {
        isAtomic: true,
        reason: 'One test has one observable result',
        canBeDoneInOneAgentAction: true,
        hasSingleObservableOutput: true,
        hasSingleVerificationMethod: true,
        hasNoHiddenSubtasks: true,
      },
    }],
    activate: true,
  };
}

function passingEvidence(overrides = {}) {
  return {
    id: 'E1',
    taskId: 'T1',
    type: 'test',
    level: 'unit_test',
    summary: 'Unit test verifies the artifact deterministically',
    passed: true,
    references: ['test/evidence-gate.test.js'],
    quality: {
      source: 'node:test',
      reproducible: true,
      verifier: 'tool',
      artifactRefs: ['test/evidence-gate.test.js'],
      observedOutput: 'All evidence gate assertions passed',
    },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function completableState() {
  const state = reduceTaskState({ tasks: {}, events: [], warnings: [] }, createdEvent());
  const task = state.tasks.T1;
  const evidence = passingEvidence();
  task.evidence = [evidence];
  task.planSteps[0].status = 'done';
  task.planSteps[0].evidenceIds = [evidence.id];
  task.acceptanceCriteria[0].status = 'satisfied';
  task.acceptanceCriteria[0].evidenceIds = [evidence.id];
  task.progress = 99;
  return state;
}

function completedEvent(overrides = {}) {
  return {
    version: 1,
    id: 'event-complete-T1',
    type: 'task.completed',
    taskId: 'T1',
    createdAt: '2026-08-01T00:05:00.000Z',
    source: 'tool',
    summary: 'Evidence gate is satisfied',
    evidenceIds: ['E1'],
    ...overrides,
  };
}

function expectCompletionRejected(state, pattern) {
  assert.throws(() => reduceTaskState(state, completedEvent()), pattern);
  assert.notEqual(state.tasks.T1.status, 'done');
}

function createPersistence(entries = []) {
  const branch = structuredClone(entries);
  let sequence = branch.length;
  return {
    branch,
    appendEntry(customType, data) {
      sequence += 1;
      branch.push({
        id: `cursor-${sequence}`,
        parentId: branch.at(-1)?.id ?? null,
        type: 'custom',
        customType,
        data: structuredClone(data),
      });
    },
    getBranch() {
      return branch;
    },
  };
}

function snapshotEvent(store, id = 'snapshot-legacy') {
  const { events: _events, ...state } = store.getState();
  return {
    version: 1,
    id,
    type: 'task.snapshot',
    taskId: 'T1',
    createdAt: '2026-08-01T00:10:00.000Z',
    source: 'system',
    state,
    resume: {
      currentStepLineage: [],
      evidenceIds: [],
      criterionIds: [],
      allowedActions: [],
      nextAllowedActions: [],
      verificationGaps: [],
      blockers: [],
      decisions: [],
      warnings: [],
      resumeInstruction: 'resume',
    },
    reason: 'compaction',
  };
}

test('Evidence Gate 拒绝未完成 Step', () => {
  const state = completableState();
  state.tasks.T1.planSteps[0].status = 'active';
  expectCompletionRejected(state, /Plan step T1-S1 is not complete/);
});

test('Evidence Gate 拒绝缺少 Evidence', () => {
  const state = completableState();
  state.tasks.T1.evidence = [];
  expectCompletionRejected(state, /Task T1 has no evidence/);
});

test('Evidence Gate 拒绝 failed Evidence', () => {
  const state = completableState();
  state.tasks.T1.evidence[0].passed = false;
  expectCompletionRejected(state, /failing evidence E1|did not pass/);
});

test('Evidence Gate 拒绝 passed 缺失的 unknown Evidence', () => {
  const state = completableState();
  delete state.tasks.T1.evidence[0].passed;
  expectCompletionRejected(state, /failing evidence E1|did not pass/);
});

test('Evidence Gate 拒绝 passed=null 的 unknown Evidence', () => {
  const state = completableState();
  state.tasks.T1.evidence[0].passed = null;
  expectCompletionRejected(state, /failing evidence E1|did not pass/);
});

test('Evidence Gate 拒绝 passed=unknown 的 Evidence', () => {
  const state = completableState();
  state.tasks.T1.evidence[0].passed = 'unknown';
  expectCompletionRejected(state, /failing evidence E1|did not pass/);
});

test('Evidence Gate 拒绝不可复现的 Criterion Evidence', () => {
  const state = completableState();
  const criterionEvidence = state.tasks.T1.evidence[0];
  criterionEvidence.quality.reproducible = false;
  const completionEvidence = passingEvidence({ id: 'E2' });
  state.tasks.T1.evidence.push(completionEvidence);
  state.tasks.T1.planSteps[0].evidenceIds = [completionEvidence.id];

  assert.throws(
    () => reduceTaskState(state, completedEvent({ evidenceIds: [completionEvidence.id] })),
    /Evidence E1 failed quality gate: evidence must be reproducible/,
  );
  assert.notEqual(state.tasks.T1.status, 'done');
});

test('Evidence Gate 拒绝未解决 Blocker', () => {
  const state = completableState();
  state.tasks.T1.blockers.push({
    id: 'T1-B1',
    taskId: 'T1',
    reason: 'External approval missing',
    since: CREATED_AT,
  });
  expectCompletionRejected(state, /unresolved blockers/);
});

test('Evidence Gate 拒绝未满足 Criterion', () => {
  const state = completableState();
  state.tasks.T1.acceptanceCriteria[0].status = 'pending';
  expectCompletionRejected(state, /Criterion T1-AC1 is not satisfied/);
});

test('Evidence Gate 在 Step、Evidence、Blocker、Criterion 全部通过时允许完成', () => {
  const completed = reduceTaskState(completableState(), completedEvent());
  assert.equal(completed.tasks.T1.status, 'done');
  assert.equal(completed.tasks.T1.progress, 100);
  assert.equal(completed.tasks.T1.confidence, 90);
});

test('task_complete 静态 schema 与 runtime contract 均拒绝 force 参数', async () => {
  const tools = new Map();
  const pi = { registerTool: (tool) => tools.set(tool.name, tool) };
  const store = createTaskRuntimeStore();
  registerTaskTools(pi, store);
  const taskComplete = tools.get('task_complete');

  assert.equal(taskComplete.parameters.additionalProperties, false);
  assert.equal(Object.hasOwn(taskComplete.parameters.properties, 'force_with_reason'), false);
  assert.equal(Object.hasOwn(taskComplete.parameters.properties, 'forceWithReason'), false);
  assert.equal(JSON.stringify(taskComplete.promptGuidelines).includes('force'), false);
  assert.deepEqual(
    PI_TASK_EVENT_V2_SCHEMA.oneOf[0].properties.event.not.anyOf,
    [{ required: ['forceWithReason'] }, { required: ['force_with_reason'] }],
  );
  assert.throws(
    () => assertMutationRequest({
      version: 1,
      requestId: 'force-runtime-contract',
      command: 'task_complete',
      expectedRevision: 0,
      expectedCursor: null,
      input: { task_id: 'T1', force_with_reason: 'bypass' },
    }),
    (error) => error.code === 'FORCE_COMPLETION_FORBIDDEN',
  );

  const result = await taskComplete.execute(
    'force-tool-call',
    {
      task_id: 'T1',
      summary: 'bypass',
      evidence_ids: [],
      force_with_reason: 'bypass',
    },
    undefined,
    undefined,
    {},
  );
  assert.equal(result.isError, true);
  assert.equal(result.details.code, 'FORCE_COMPLETION_FORBIDDEN');
});

test('v1 raw forced completion 迁移为只读审计记录且不恢复可信 done', () => {
  const forced = completedEvent({
    id: 'legacy-force-event',
    evidenceIds: [],
    forceWithReason: 'legacy emergency bypass',
  });
  const entries = [createdEvent(), forced].map((event, index) => ({
    id: `legacy-${index + 1}`,
    type: 'custom',
    customType: TASK_EVENT_CUSTOM_TYPE,
    data: event,
  }));
  const store = createTaskRuntimeStore();
  const replay = store.replay(entries);
  const audit = replay.metadata.legacyForcedCompletions[0];

  assert.notEqual(replay.state.tasks.T1.status, 'done');
  assert.equal(replay.state.tasks.T1.evidence.length, 0);
  assert.equal(replay.metadata.integrity.length, 0);
  assert.equal(audit.code, PI_TASK_LEGACY_FORCED_COMPLETION_CODE);
  assert.equal(audit.trusted, false);
  assert.equal(audit.source, 'v1_event');
  assert.equal(audit.reason, 'legacy emergency bypass');

  const persistence = createPersistence(entries);
  const checkpoint = store.checkpoint(snapshotEvent(store), persistence);
  assert.equal(JSON.stringify(checkpoint.envelope).includes('forceWithReason'), false);
  assert.equal(JSON.stringify(checkpoint.envelope).includes('force_with_reason'), false);
  const compacted = createTaskRuntimeStore().replay([persistence.branch.at(-1)]);
  assert.notEqual(compacted.state.tasks.T1.status, 'done');
  assert.equal(compacted.metadata.legacyForcedCompletions[0].code, PI_TASK_LEGACY_FORCED_COMPLETION_CODE);
});

test('旧 v1 snapshot forced done 迁移为 review 与 machine-readable audit', () => {
  const oldState = completableState();
  const task = oldState.tasks.T1;
  task.status = 'done';
  task.progress = 100;
  task.completedAt = '2026-08-01T00:04:00.000Z';
  task.completionSummary = 'Legacy untrusted completion';
  task.evidence = [];
  task.warnings = ['Forced completion: legacy snapshot bypass'];
  const oldSnapshot = {
    version: 1,
    id: 'legacy-v1-snapshot',
    type: 'task.snapshot',
    taskId: 'T1',
    createdAt: '2026-08-01T00:06:00.000Z',
    source: 'system',
    state: oldState,
    resume: {},
    reason: 'legacy-compaction',
  };
  const replay = createTaskRuntimeStore().replay([{
    id: 'legacy-snapshot-entry',
    type: 'custom',
    customType: TASK_EVENT_CUSTOM_TYPE,
    data: oldSnapshot,
  }]);
  const migrated = replay.state.tasks.T1;
  const audit = replay.metadata.legacyForcedCompletions[0];

  assert.equal(migrated.status, 'review');
  assert.ok(migrated.progress < 100);
  assert.equal(migrated.completedAt, undefined);
  assert.equal(migrated.completionSummary, undefined);
  assert.equal(migrated.evidence.length, 0);
  assert.equal(audit.code, PI_TASK_LEGACY_FORCED_COMPLETION_CODE);
  assert.equal(audit.source, 'v1_snapshot');
  assert.equal(audit.trusted, false);
});
