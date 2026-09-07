import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PI_TASK_CHECKPOINT_MAX_BYTES,
  PI_TASK_EVENT_V2_SCHEMA,
  PI_TASK_STATE_EVENT_V2_SCHEMA,
  createTaskRuntimeStore,
} from '../index.js';
import { registerTaskTools } from '../src/tools.js';
import { mutationPayloadHash, sha256 } from '../src/contracts.js';
import { TASK_EVENT_CUSTOM_TYPE } from '../src/model.js';

const CREATED_AT = '2026-08-01T00:00:00.000Z';

function taskCreated(eventId = 'event-create-T1') {
  return {
    version: 1,
    id: eventId,
    type: 'task.created',
    taskId: 'T1',
    createdAt: CREATED_AT,
    source: 'tool',
    title: 'Versioned ledger task',
    objective: 'Verify v2 mutation semantics',
    acceptanceCriteria: ['Ledger mutation is durable'],
    planSteps: [{
      text: 'Write one ledger event',
      expectedOutput: 'One accepted Session entry',
      allowedActions: ['mutate'],
      evidenceRequired: true,
      decompositionStatus: 'atomic',
      granularityCheck: {
        isAtomic: true,
        reason: 'One mutation has one observable entry',
        canBeDoneInOneAgentAction: true,
        hasSingleObservableOutput: true,
        hasSingleVerificationMethod: true,
        hasNoHiddenSubtasks: true,
      },
    }],
    activate: true,
  };
}

function taskUpdated(nextAction, eventId) {
  return {
    version: 1,
    id: eventId,
    type: 'task.updated',
    taskId: 'T1',
    createdAt: CREATED_AT,
    source: 'tool',
    nextAction,
  };
}

function taskSnapshot(store, eventId = 'snapshot-compaction') {
  return {
    version: 1,
    id: eventId,
    type: 'task.snapshot',
    taskId: 'T1',
    createdAt: '2026-08-01T00:01:00.000Z',
    source: 'system',
    state: (() => {
      const { events, ...snapshot } = store.getState();
      void events;
      return snapshot;
    })(),
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

function resignCheckpoint(entry) {
  const checkpoint = entry.data.checkpoint;
  checkpoint.receiptWindow.retainedCount = checkpoint.receipts.length;
  checkpoint.receiptWindow.minRevision = checkpoint.receipts[0]?.revisionAfter ?? null;
  checkpoint.receiptWindow.maxRevision = checkpoint.receipts.at(-1)?.revisionAfter ?? null;
  checkpoint.receiptHash = sha256(checkpoint.receipts);
  const { checkpointHash: _checkpointHash, ...unsigned } = checkpoint;
  checkpoint.checkpointHash = sha256({
    version: 2,
    kind: 'snapshot',
    revision: entry.data.revision,
    ledgerParentCursor: entry.data.ledgerParentCursor,
    parentCursor: entry.data.parentCursor,
    event: entry.data.event,
    checkpoint: unsigned,
  });
  return entry;
}

function mutationRequest(overrides = {}) {
  return {
    version: 1,
    requestId: 'request-create',
    command: 'task_plan',
    expectedRevision: 0,
    expectedCursor: null,
    input: { title: 'Versioned ledger task' },
    ...overrides,
  };
}

function createPersistence(entries = [], prefix = 'cursor') {
  const branch = structuredClone(entries);
  let sequence = branch.length;
  return {
    branch,
    appendCount: 0,
    appendEntry(customType, data) {
      sequence += 1;
      this.appendCount += 1;
      const parentId = branch.at(-1)?.id ?? null;
      branch.push({
        id: `${prefix}-${sequence}`,
        parentId,
        type: 'custom',
        customType,
        data: structuredClone(data),
      });
    },
    appendMessage(id = `${prefix}-message-${sequence + 1}`) {
      const parentId = branch.at(-1)?.id ?? null;
      sequence += 1;
      branch.push({ id, parentId, type: 'message', role: 'user' });
      return id;
    },
    getBranch() {
      return branch;
    },
  };
}

function createCountingPersistence(entries = [], prefix = 'counting') {
  const persistence = createPersistence(entries, prefix);
  let fullIterations = 0;
  let indexedReads = 0;
  const branch = new Proxy(persistence.branch, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) fullIterations += 1;
      if (typeof property === 'string' && /^\d+$/.test(property)) indexedReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  return {
    ...persistence,
    branch,
    getBranch() {
      return branch;
    },
    get fullIterations() {
      return fullIterations;
    },
    get indexedReads() {
      return indexedReads;
    },
  };
}

function mutateCreated(store, persistence, request = mutationRequest()) {
  return store.mutate(request, taskCreated(), persistence);
}

function createFakePi(sessionId = 'session-1') {
  const tools = new Map();
  const branch = [];
  const stateEvents = [];
  let cursor = 0;
  const pi = {
    tools,
    branch,
    stateEvents,
    events: {
      emit(name, data) {
        stateEvents.push({ name, data });
      },
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    appendEntry(customType, data) {
      cursor += 1;
      const parentId = branch.at(-1)?.id ?? null;
      branch.push({
        id: `session-entry-${cursor}`,
        parentId,
        type: 'custom',
        customType,
        data: structuredClone(data),
      });
    },
  };
  const ctx = {
    mode: 'rpc',
    sessionManager: {
      getBranch: () => branch,
      getSessionId: () => sessionId,
    },
    ui: {
      notify() {},
      setStatus() {},
      setWidget() {},
    },
  };
  return { pi, ctx };
}

function taskPlanParams(overrides = {}) {
  return {
    title: 'Tool path task',
    objective: 'Exercise the registered task_plan tool',
    acceptance_criteria: ['A v2 event is written'],
    plan_steps: [{
      text: 'Invoke task_plan once',
      expectedOutput: 'Task T1 exists',
      allowedActions: ['task_plan'],
      evidenceRequired: true,
      decompositionStatus: 'atomic',
      granularityCheck: {
        isAtomic: true,
        reason: 'Single tool call',
        canBeDoneInOneAgentAction: true,
        hasSingleObservableOutput: true,
        hasSingleVerificationMethod: true,
        hasNoHiddenSubtasks: true,
      },
    }],
    ...overrides,
  };
}

test('成功 mutation 写入 v2 envelope 并返回真实 Session cursor receipt', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  const result = mutateCreated(store, persistence);

  assert.equal(result.receipt.revisionBefore, 0);
  assert.equal(result.receipt.revisionAfter, 1);
  assert.equal(result.receipt.cursorBefore, null);
  assert.equal(result.receipt.cursorAfter, 'cursor-1');
  assert.equal(result.receipt.ledgerCursorBefore, null);
  assert.equal(result.receipt.ledgerCursorAfter, 'cursor-1');
  assert.equal(result.receipt.taskId, 'T1');
  assert.equal(result.receipt.replayed, false);
  assert.equal(persistence.branch[0].data.version, 2);
  assert.equal(persistence.branch[0].data.kind, 'mutation');
  assert.equal(persistence.branch[0].data.ledgerParentCursor, null);
  assert.equal(persistence.branch[0].data.parentCursor, null);
  assert.equal(persistence.branch[0].parentId, null);
  assert.equal(result.metadata.cursor, persistence.branch[0].id);
  assert.equal(result.state.tasks.T1.status, 'active');
});

test('store 禁止脱离 canonical Session branch 注入 initial state', () => {
  assert.throws(
    () => createTaskRuntimeStore({ tasks: { forged: {} } }),
    (error) => error.code === 'INITIAL_STATE_FORBIDDEN',
  );
});

test('提交后相同 requestId 与 payload 即使 CAS 已过期仍 replay 原 receipt', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  const first = mutateCreated(store, persistence);
  const replay = store.mutate(mutationRequest(), taskCreated('unused-replay-event'), persistence);

  assert.equal(replay.receipt.replayed, true);
  assert.equal(replay.receipt.eventId, first.receipt.eventId);
  assert.equal(replay.receipt.taskId, 'T1');
  assert.equal(persistence.appendCount, 1);
  assert.throws(
    () => store.mutate(
      mutationRequest({ input: { title: 'different' } }),
      taskCreated('conflict-event'),
      persistence,
    ),
    (error) => error.code === 'DUPLICATE_REQUEST_CONFLICT',
  );
  assert.equal(persistence.appendCount, 1);
});

test('同 requestId 不能跨到不包含原 receipt 的 sibling branch 复用', () => {
  const root = { id: 'message-root', parentId: null, type: 'message', role: 'user' };
  const store = createTaskRuntimeStore();
  const committedBranch = createPersistence([root], 'committed');
  const request = mutationRequest({ expectedCursor: 'message-root' });
  mutateCreated(store, committedBranch, request);
  const siblingBranch = createPersistence([root], 'sibling');

  assert.throws(
    () => store.mutate(request, taskCreated('cross-branch-retry'), siblingBranch),
    (error) => error.code === 'BRANCH_STATE_STALE',
  );
  assert.equal(siblingBranch.appendCount, 0);
});

test('expectedRevision 和 expectedCursor 冲突均不 reduce、不 append', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();

  assert.throws(
    () => mutateCreated(store, persistence, mutationRequest({ expectedRevision: 1 })),
    (error) => error.code === 'REVISION_CONFLICT',
  );
  assert.throws(
    () => mutateCreated(store, persistence, mutationRequest({ expectedCursor: 'stale' })),
    (error) => error.code === 'BRANCH_CONFLICT',
  );
  assert.equal(persistence.appendCount, 0);
  assert.deepEqual(store.getState().tasks, {});
});

test('重启 replay 重建相同 revision/cursor/request index 并保持幂等', () => {
  const firstStore = createTaskRuntimeStore();
  const persistence = createPersistence();
  const first = mutateCreated(firstStore, persistence);
  const restarted = createTaskRuntimeStore();
  const replay = restarted.replay(persistence.branch);

  assert.equal(replay.metadata.revision, 1);
  assert.equal(replay.metadata.cursor, first.receipt.cursorAfter);
  assert.equal(replay.metadata.requestCount, 1);
  assert.equal(replay.metadata.stateHash, first.metadata.stateHash);
  const idempotent = restarted.mutate(mutationRequest(), taskCreated('after-restart'), persistence);
  assert.equal(idempotent.receipt.replayed, true);
  assert.equal(persistence.appendCount, 1);
});

test('branch replay 只继承共同祖先，各自 revision/cursor 独立推进', () => {
  const rootStore = createTaskRuntimeStore();
  const rootPersistence = createPersistence([], 'root');
  mutateCreated(rootStore, rootPersistence);
  const common = structuredClone(rootPersistence.branch);

  const leftStore = createTaskRuntimeStore();
  leftStore.replay(common);
  const left = createPersistence(common, 'left');
  leftStore.mutate(
    mutationRequest({
      requestId: 'request-left',
      command: 'task_update',
      expectedRevision: 1,
      expectedCursor: 'root-1',
      input: { task_id: 'T1', next_action: 'left' },
    }),
    taskUpdated('left', 'event-left'),
    left,
  );

  const rightStore = createTaskRuntimeStore();
  rightStore.replay(common);
  const right = createPersistence(common, 'right');
  rightStore.mutate(
    mutationRequest({
      requestId: 'request-right',
      command: 'task_update',
      expectedRevision: 1,
      expectedCursor: 'root-1',
      input: { task_id: 'T1', next_action: 'right' },
    }),
    taskUpdated('right', 'event-right'),
    right,
  );

  assert.equal(leftStore.getMetadata().revision, 2);
  assert.equal(rightStore.getMetadata().revision, 2);
  assert.notEqual(leftStore.getMetadata().cursor, rightStore.getMetadata().cursor);
  assert.equal(leftStore.getState().tasks.T1.nextAction, 'left');
  assert.equal(rightStore.getState().tasks.T1.nextAction, 'right');
});

test('同 revision 的 stale store 不能在 sibling branch 写入或返回旧 receipt', () => {
  const rootStore = createTaskRuntimeStore();
  const rootPersistence = createPersistence([], 'root');
  mutateCreated(rootStore, rootPersistence);
  const common = structuredClone(rootPersistence.branch);

  const leftStore = createTaskRuntimeStore();
  leftStore.replay(common);
  const left = createPersistence(common, 'left');
  const leftRequest = mutationRequest({
    requestId: 'request-left-stale',
    command: 'task_update',
    expectedRevision: 1,
    expectedCursor: 'root-1',
    input: { task_id: 'T1', next_action: 'left' },
  });
  leftStore.mutate(leftRequest, taskUpdated('left', 'event-left-stale'), left);

  const rightStore = createTaskRuntimeStore();
  rightStore.replay(common);
  const right = createPersistence(common, 'right');
  rightStore.mutate(
    mutationRequest({
      requestId: 'request-right-current',
      command: 'task_update',
      expectedRevision: 1,
      expectedCursor: 'root-1',
      input: { task_id: 'T1', next_action: 'right' },
    }),
    taskUpdated('right', 'event-right-current'),
    right,
  );
  const appendCount = right.appendCount;

  assert.throws(
    () => leftStore.mutate(leftRequest, taskUpdated('unused', 'unused-left-replay'), right),
    (error) => error.code === 'BRANCH_STATE_STALE',
  );
  assert.throws(
    () => leftStore.mutate(
      mutationRequest({
        requestId: 'request-stale-new',
        command: 'task_update',
        expectedRevision: 2,
        expectedCursor: right.branch.at(-1).id,
        input: { task_id: 'T1', next_action: 'stale-new' },
      }),
      taskUpdated('stale-new', 'event-stale-new'),
      right,
    ),
    (error) => error.code === 'BRANCH_STATE_STALE',
  );
  assert.throws(
    () => leftStore.checkpoint(taskSnapshot(leftStore, 'snapshot-stale-branch'), right),
    (error) => error.code === 'BRANCH_STATE_STALE',
  );
  assert.equal(right.appendCount, appendCount);
  assert.equal(rightStore.getState().tasks.T1.nextAction, 'right');
});

test('Task entry 后普通 message 成为真实 leaf：旧 Task cursor 拒绝，当前 leaf 合法写入', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  mutateCreated(store, persistence);
  const messageLeaf = persistence.appendMessage('message-after-task');
  const updateInput = { task_id: 'T1', next_action: 'after-message' };

  assert.throws(
    () => store.mutate(
      mutationRequest({
        requestId: 'request-after-message-stale',
        command: 'task_update',
        expectedRevision: 1,
        expectedCursor: 'cursor-1',
        input: updateInput,
      }),
      taskUpdated('after-message', 'event-after-message-stale'),
      persistence,
    ),
    (error) => error.code === 'BRANCH_CONFLICT',
  );

  const result = store.mutate(
    mutationRequest({
      requestId: 'request-after-message',
      command: 'task_update',
      expectedRevision: 1,
      expectedCursor: messageLeaf,
      input: updateInput,
    }),
    taskUpdated('after-message', 'event-after-message'),
    persistence,
  );
  const entry = persistence.branch.at(-1);
  assert.equal(entry.parentId, messageLeaf);
  assert.equal(entry.data.parentCursor, messageLeaf);
  assert.equal(entry.data.ledgerParentCursor, 'cursor-1');
  assert.equal(result.receipt.cursorBefore, messageLeaf);
  assert.equal(result.receipt.cursorAfter, entry.id);
  assert.equal(result.receipt.ledgerCursorBefore, 'cursor-1');
  assert.equal(result.receipt.ledgerCursorAfter, entry.id);
  assert.equal(result.metadata.cursor, entry.id);
  assert.equal(result.metadata.branchLeaf, entry.id);
});

test('共享 Task ancestor 的 sibling branch 以各自真实 message leaf 做 CAS', () => {
  const rootStore = createTaskRuntimeStore();
  const rootPersistence = createPersistence([], 'root');
  mutateCreated(rootStore, rootPersistence);
  const sharedTaskBranch = structuredClone(rootPersistence.branch);
  const sibling = createPersistence(sharedTaskBranch, 'sibling');
  const siblingLeaf = sibling.appendMessage('sibling-message-leaf');
  const siblingStore = createTaskRuntimeStore();
  siblingStore.replay(sibling.branch);
  const requestBase = {
    requestId: 'request-sibling-update',
    command: 'task_update',
    expectedRevision: 1,
    input: { task_id: 'T1', next_action: 'sibling' },
  };

  assert.throws(
    () => siblingStore.mutate(
      mutationRequest({ ...requestBase, expectedCursor: 'root-1' }),
      taskUpdated('sibling', 'event-sibling-stale'),
      sibling,
    ),
    (error) => error.code === 'BRANCH_CONFLICT',
  );
  const result = siblingStore.mutate(
    mutationRequest({ ...requestBase, expectedCursor: siblingLeaf }),
    taskUpdated('sibling', 'event-sibling-valid'),
    sibling,
  );
  assert.equal(result.receipt.cursorBefore, siblingLeaf);
  assert.equal(result.receipt.ledgerCursorBefore, 'root-1');
  assert.equal(sibling.branch.at(-1).parentId, siblingLeaf);
});

test('重复 cursor 与乱序 envelope 被忽略，后续合法 entry 仍可 replay', () => {
  const sourceStore = createTaskRuntimeStore();
  const source = createPersistence();
  mutateCreated(sourceStore, source);
  sourceStore.mutate(
    mutationRequest({
      requestId: 'request-update',
      command: 'task_update',
      expectedRevision: 1,
      expectedCursor: 'cursor-1',
      input: { task_id: 'T1', next_action: 'accepted' },
    }),
    taskUpdated('accepted', 'event-update'),
    source,
  );
  const duplicate = structuredClone(source.branch[0]);
  const outOfOrder = structuredClone(source.branch[1]);
  outOfOrder.id = 'cursor-out-of-order';
  outOfOrder.data.revision = 4;
  const replayStore = createTaskRuntimeStore();
  const replay = replayStore.replay([
    source.branch[0],
    duplicate,
    outOfOrder,
    source.branch[1],
  ]);

  assert.equal(replay.metadata.revision, 2);
  assert.equal(replay.metadata.cursor, 'cursor-2');
  assert.equal(replay.state.tasks.T1.nextAction, 'accepted');
  assert.equal(replay.malformedEvents.length, 2);
  assert.match(replay.malformedEvents[0], /Duplicate task ledger cursor/);
  assert.match(replay.malformedEvents[1], /Out-of-order task event/);
});

test('compaction v2 snapshot 不递增 revision，并可单 entry 恢复 state 与 request receipt', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  const first = mutateCreated(store, persistence);
  const checkpointEvent = taskSnapshot(store);
  const checkpoint = store.checkpoint(checkpointEvent, persistence);
  const snapshotEntry = persistence.branch.at(-1);

  assert.equal(checkpoint.metadata.revision, 1);
  assert.equal(checkpoint.metadata.cursor, 'cursor-2');
  assert.equal(snapshotEntry.data.kind, 'snapshot');
  assert.equal(snapshotEntry.data.revision, 1);
  const compactedStore = createTaskRuntimeStore();
  const compactedPersistence = createPersistence([snapshotEntry], 'compacted');
  const replay = compactedStore.replay(compactedPersistence.branch);
  assert.equal(replay.metadata.revision, 1);
  assert.equal(replay.metadata.cursor, 'cursor-2');
  assert.equal(replay.metadata.requestCount, 1);
  assert.equal(replay.state.tasks.T1.title, 'Versioned ledger task');
  const idempotent = compactedStore.mutate(
    mutationRequest(),
    taskCreated('after-compaction'),
    compactedPersistence,
  );
  assert.equal(idempotent.receipt.replayed, true);
  assert.equal(idempotent.receipt.eventId, first.receipt.eventId);
  assert.equal(compactedPersistence.appendCount, 0);
});

test('checkpoint 拒绝伪造 receipt 的 revision、command/event 与重复 requestId', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  mutateCreated(store, persistence);
  store.checkpoint(taskSnapshot(store), persistence);
  const validSnapshot = persistence.branch.at(-1);

  const forgeries = [
    (entry) => {
      entry.data.checkpoint.receipts[0].revisionBefore = 8;
      entry.data.checkpoint.receipts[0].revisionAfter = 9;
    },
    (entry) => {
      entry.data.checkpoint.receipts[0].eventType = 'task.updated';
    },
    (entry) => {
      entry.data.checkpoint.receipts.push(structuredClone(entry.data.checkpoint.receipts[0]));
    },
  ];

  for (const forge of forgeries) {
    const entry = structuredClone(validSnapshot);
    forge(entry);
    resignCheckpoint(entry);
    const replay = createTaskRuntimeStore().replay([entry]);
    assert.equal(replay.metadata.revision, 0);
    assert.equal(replay.metadata.requestCount, 0);
    assert.equal(replay.malformedEvents.length, 1);
  }
});

test('checkpoint hash 覆盖 revision、parent、event 和 checkpoint 全包络', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  mutateCreated(store, persistence);
  store.checkpoint(taskSnapshot(store), persistence);
  const validSnapshot = persistence.branch.at(-1);
  const tamperCases = [
    (entry) => { entry.data.revision += 1; },
    (entry) => { entry.data.ledgerParentCursor = 'forged-ledger-parent'; },
    (entry) => { entry.data.parentCursor = 'forged-parent'; entry.parentId = 'forged-parent'; },
    (entry) => { entry.data.event.id = 'forged-snapshot-event'; },
  ];

  for (const tamper of tamperCases) {
    const entry = structuredClone(validSnapshot);
    tamper(entry);
    const replay = createTaskRuntimeStore().replay([entry]);
    assert.equal(replay.metadata.revision, 0);
    assert.equal(replay.metadata.requestCount, 0);
    assert.match(replay.malformedEvents[0], /checkpoint hash validation/);
  }
});

test('checkpoint receipt 必须与已 replay 的 request index 完全一致', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  mutateCreated(store, persistence);
  store.checkpoint(taskSnapshot(store), persistence);
  const mutationEntry = structuredClone(persistence.branch[0]);
  const forgedSnapshot = structuredClone(persistence.branch[1]);
  forgedSnapshot.data.checkpoint.receipts[0].payloadHash = 'a'.repeat(64);
  resignCheckpoint(forgedSnapshot);

  const replay = createTaskRuntimeStore().replay([mutationEntry, forgedSnapshot]);
  assert.equal(replay.metadata.revision, 1);
  assert.equal(replay.metadata.cursor, mutationEntry.id);
  assert.equal(replay.metadata.requestCount, 1);
  assert.match(replay.malformedEvents[0], /conflicts with replayed history/);
});

test('checkpoint 可位于相邻 mutation revision 之间而不破坏 receipt 校验', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  mutateCreated(store, persistence);
  store.checkpoint(taskSnapshot(store, 'snapshot-between-mutations'), persistence);
  store.mutate(
    mutationRequest({
      requestId: 'request-after-snapshot',
      command: 'task_update',
      expectedRevision: 1,
      expectedCursor: 'cursor-2',
      input: { task_id: 'T1', next_action: 'after-snapshot' },
    }),
    taskUpdated('after-snapshot', 'event-after-snapshot'),
    persistence,
  );
  store.checkpoint(taskSnapshot(store, 'snapshot-after-mutation'), persistence);
  const snapshotEntry = persistence.branch.at(-1);
  const replay = createTaskRuntimeStore().replay([snapshotEntry]);

  assert.equal(replay.metadata.revision, 2);
  assert.equal(replay.metadata.requestCount, 2);
  assert.equal(replay.state.tasks.T1.nextAction, 'after-snapshot');
  assert.equal(replay.malformedEvents.length, 0);
});

test('replay 诊断有界去重且不进入业务 state、snapshot 或 stateHash', () => {
  const sourceStore = createTaskRuntimeStore();
  const source = createPersistence();
  mutateCreated(sourceStore, source);
  sourceStore.mutate(
    mutationRequest({
      requestId: 'request-clean-update',
      command: 'task_update',
      expectedRevision: 1,
      expectedCursor: 'cursor-1',
      input: { task_id: 'T1', next_action: 'clean' },
    }),
    taskUpdated('clean', 'event-clean-update'),
    source,
  );
  const duplicate = structuredClone(source.branch[0]);
  const outOfOrder = structuredClone(source.branch[1]);
  outOfOrder.id = 'cursor-forged';
  outOfOrder.data.revision = 99;
  const dirtyEntries = [source.branch[0], duplicate, duplicate, outOfOrder, source.branch[1]];
  const cleanReplay = createTaskRuntimeStore().replay(source.branch);
  const dirtyStore = createTaskRuntimeStore();
  const dirtyReplay = dirtyStore.replay(dirtyEntries);
  const repeatedReplay = createTaskRuntimeStore().replay(dirtyEntries);

  assert.equal(dirtyReplay.metadata.stateHash, cleanReplay.metadata.stateHash);
  assert.deepEqual(dirtyReplay.state.warnings, cleanReplay.state.warnings);
  assert.equal(dirtyReplay.metadata.integrity.length, 2);
  assert.equal(dirtyReplay.metadata.integrity.every((item) => !('message' in item)), true);
  assert.equal(
    dirtyReplay.metadata.integrity.every((item) => /^[a-f0-9]{64}$/.test(item.eventHash)),
    true,
  );
  assert.deepEqual(dirtyReplay.metadata.integrity, repeatedReplay.metadata.integrity);
  assert.equal(dirtyReplay.metadata.stateHash, repeatedReplay.metadata.stateHash);

  const dirtyPersistence = createPersistence(dirtyEntries, 'dirty');
  dirtyStore.checkpoint(taskSnapshot(dirtyStore, 'snapshot-diagnostics'), dirtyPersistence);
  const snapshotEntry = dirtyPersistence.branch.at(-1);
  assert.equal(JSON.stringify(snapshotEntry.data.event.state).includes('DUPLICATE_CURSOR'), false);
  const compacted = createTaskRuntimeStore().replay([snapshotEntry]);
  assert.equal(compacted.metadata.stateHash, cleanReplay.metadata.stateHash);
  assert.deepEqual(compacted.state.warnings, cleanReplay.state.warnings);
});

test('replay 诊断只持久化分类与 event hash，并裁剪敏感兼容消息', () => {
  const secretTaskId = 'Authorization: Basic basic-secret; token=topsecret C:\\Users\\alice\\private';
  const invalidEvent = taskUpdated('invalid', 'event-sensitive-diagnostic');
  invalidEvent.taskId = secretTaskId;
  const envelope = {
    version: 2,
    kind: 'mutation',
    revision: 1,
    ledgerParentCursor: null,
    parentCursor: null,
    requestId: 'request-sensitive-diagnostic',
    command: 'task_update',
    payloadHash: sha256({ taskId: secretTaskId }),
    event: invalidEvent,
  };
  const entry = {
    id: 'C:\\Users\\alice\\private\\cursor-secret',
    parentId: null,
    type: 'custom',
    customType: TASK_EVENT_CUSTOM_TYPE,
    data: envelope,
  };
  const replay = createTaskRuntimeStore().replay([entry]);
  const serializedMetadata = JSON.stringify(replay.metadata.integrity);

  assert.equal(replay.metadata.integrity.length, 1);
  assert.equal(serializedMetadata.includes('topsecret'), false);
  assert.equal(serializedMetadata.includes('alice'), false);
  assert.equal(serializedMetadata.includes('private'), false);
  assert.equal(serializedMetadata.includes('message'), false);
  assert.equal(replay.malformedEvents[0].includes('topsecret'), false);
  assert.equal(replay.malformedEvents[0].includes('alice'), false);
  assert.equal(replay.malformedEvents[0].includes('private'), false);
  assert.ok(replay.malformedEvents[0].length <= 240);
});

test('branch 新增 malformed Task entry 时增量对齐刷新诊断后继续 checkpoint', () => {
  const store = createTaskRuntimeStore();
  const persistence = createPersistence();
  mutateCreated(store, persistence);
  persistence.appendEntry(TASK_EVENT_CUSTOM_TYPE, { invalid: 'tail-task-entry' });

  store.checkpoint(taskSnapshot(store, 'snapshot-after-malformed-tail'), persistence);

  assert.equal(store.getMetadata().integrity.length, 1);
  assert.equal(store.getMetadata().integrity[0].code, 'INVALID_ENVELOPE');
  assert.equal(persistence.branch.at(-1).data.kind, 'snapshot');
});

test('replay 诊断 metadata 最多保留 64 条', () => {
  const malformed = Array.from({ length: 100 }, (_, index) => ({
    id: `malformed-${index}`,
    parentId: index === 0 ? null : `malformed-${index - 1}`,
    type: 'custom',
    customType: TASK_EVENT_CUSTOM_TYPE,
    data: { invalid: index },
  }));
  const replay = createTaskRuntimeStore().replay(malformed);
  assert.equal(replay.metadata.integrity.length, 64);
  assert.equal(replay.malformedEvents.length, 64);
  assert.equal(replay.metadata.stateHash, createTaskRuntimeStore().getMetadata().stateHash);
});

test('200+ requests 的 checkpoint 保持 64KB 内并保留近期幂等窗口', () => {
  const store = createTaskRuntimeStore();
  const persistence = createCountingPersistence();
  mutateCreated(store, persistence);
  let latestRequest;
  for (let index = 1; index <= 220; index += 1) {
    latestRequest = mutationRequest({
      requestId: `request-update-${index}`,
      command: 'task_update',
      expectedRevision: store.getMetadata().revision,
      expectedCursor: persistence.branch.at(-1).id,
      input: { task_id: 'T1', next_action: `bounded-${index}` },
    });
    store.mutate(latestRequest, taskUpdated(`bounded-${index}`, `event-update-${index}`), persistence);
  }
  store.checkpoint(taskSnapshot(store, 'snapshot-bounded'), persistence);
  const snapshotEntry = persistence.branch.at(-1);
  const snapshotBytes = Buffer.byteLength(JSON.stringify(snapshotEntry.data), 'utf8');
  assert.ok(snapshotBytes <= PI_TASK_CHECKPOINT_MAX_BYTES, `${snapshotBytes} exceeds checkpoint limit`);
  assert.equal(snapshotEntry.data.checkpoint.receiptWindow.policy, 'latest_revision_window');
  assert.ok(snapshotEntry.data.checkpoint.receiptWindow.omittedCount > 0);

  const compactedPersistence = createPersistence([snapshotEntry], 'bounded');
  const compactedStore = createTaskRuntimeStore();
  const replay = compactedStore.replay(compactedPersistence.branch);
  assert.equal(replay.metadata.revision, 221);
  assert.ok(replay.receipts.length <= 128);
  assert.equal(replay.receipts.some((receipt) => receipt.requestId === 'request-create'), false);
  assert.equal(replay.receipts.some((receipt) => receipt.requestId === latestRequest.requestId), true);
  const retry = compactedStore.mutate(
    latestRequest,
    taskUpdated('unused', 'unused-after-compaction'),
    compactedPersistence,
  );
  assert.equal(retry.receipt.replayed, true);
  assert.equal(compactedPersistence.appendCount, 0);

  assert.equal(persistence.fullIterations, 0, 'hot mutation path must not replay the full branch');
  assert.ok(persistence.indexedReads < 3000, `hot path performed ${persistence.indexedReads} indexed reads`);
  const fullBranchPersistence = createPersistence([...persistence.branch], 'full-branch');
  const fullBranchStore = createTaskRuntimeStore();
  const fullReplay = fullBranchStore.replay(fullBranchPersistence.branch);
  assert.equal(fullReplay.metadata.revision, 221);
  assert.equal(fullReplay.receipts.some((receipt) => receipt.requestId === 'request-create'), true);
  const oldestRetry = fullBranchStore.mutate(
    mutationRequest(),
    taskCreated('unused-full-branch-retry'),
    fullBranchPersistence,
  );
  assert.equal(oldestRetry.receipt.replayed, true);
  assert.equal(fullBranchPersistence.appendCount, 0);
});

test('schema snapshot 固定 v2 envelope/state event 和 7 个 mutation tool reserved 参数', async () => {
  const { pi } = createFakePi();
  registerTaskTools(pi, createTaskRuntimeStore());
  const mutationNames = [
    'task_plan',
    'task_checkpoint',
    'task_decompose',
    'task_update',
    'task_evidence',
    'task_decision',
    'task_complete',
  ];
  const reservedSchemas = mutationNames.map((name) => pi.tools.get(name).parameters.properties.originos_command);
  for (const schema of reservedSchemas.slice(1)) assert.deepEqual(schema, reservedSchemas[0]);
  const actual = {
    eventEnvelope: {
      id: PI_TASK_EVENT_V2_SCHEMA.$id,
      kinds: PI_TASK_EVENT_V2_SCHEMA.oneOf.map((schema) => schema.properties.kind.const),
      mutationRequired: PI_TASK_EVENT_V2_SCHEMA.oneOf[0].required,
      mutationEventNot: PI_TASK_EVENT_V2_SCHEMA.oneOf[0].properties.event.not,
      snapshotRequired: PI_TASK_EVENT_V2_SCHEMA.oneOf[1].required,
      checkpointRequired: PI_TASK_EVENT_V2_SCHEMA.oneOf[1].properties.checkpoint.required,
      checkpointLegacyForcedCompletions: PI_TASK_EVENT_V2_SCHEMA.oneOf[1]
        .properties.checkpoint.properties.legacyForcedCompletions,
      receiptWindow: PI_TASK_EVENT_V2_SCHEMA.oneOf[1]
        .properties.checkpoint.properties.receiptWindow,
    },
    stateEvent: {
      id: PI_TASK_STATE_EVENT_V2_SCHEMA.$id,
      required: PI_TASK_STATE_EVENT_V2_SCHEMA.required,
      reasons: PI_TASK_STATE_EVENT_V2_SCHEMA.properties.reason.enum,
      sessionIdType: PI_TASK_STATE_EVENT_V2_SCHEMA.properties.scope.properties.sessionId.type,
    },
    originosCommand: reservedSchemas[0],
  };
  const expected = JSON.parse(await readFile(
    new URL('./snapshots/versioned-ledger-schema.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(actual, expected);
});

test('普通模型路径用 toolCallId；宿主 scope 路径执行 CAS 且 replay 返回原 receipt 中性提示', async () => {
  const modelRuntime = createFakePi('model-session');
  const modelStore = createTaskRuntimeStore();
  registerTaskTools(modelRuntime.pi, modelStore);
  const modelResult = await modelRuntime.pi.tools.get('task_plan').execute(
    'model-tool-call-1',
    taskPlanParams(),
    undefined,
    undefined,
    modelRuntime.ctx,
  );
  assert.equal(modelResult.isError, undefined);
  assert.equal(modelResult.details.mutationReceipt.requestId, 'model-tool-call-1');
  assert.equal(modelRuntime.pi.branch[0].data.version, 2);
  assert.equal(modelRuntime.pi.stateEvents[0].data.version, 2);
  assert.equal(modelRuntime.pi.stateEvents[0].data.scope.sessionId, 'model-session');
  assert.equal(
    modelRuntime.pi.stateEvents[0].data.stateHash,
    modelResult.details.mutationReceipt.stateHash,
  );

  const hostRuntime = createFakePi('host-session');
  const hostStore = createTaskRuntimeStore();
  registerTaskTools(hostRuntime.pi, hostStore);
  const hostParams = taskPlanParams({
    originos_command: {
      version: 1,
      request_id: 'host-request-1',
      expected_revision: 0,
      expected_cursor: null,
    },
  });
  const first = await hostRuntime.pi.tools.get('task_plan').execute(
    'host-request-1',
    hostParams,
    undefined,
    undefined,
    hostRuntime.ctx,
  );
  const replay = await hostRuntime.pi.tools.get('task_plan').execute(
    'host-request-1',
    hostParams,
    undefined,
    undefined,
    hostRuntime.ctx,
  );
  assert.equal(first.details.mutationReceipt.taskId, 'T1');
  const { originos_command: _reserved, ...businessInput } = hostParams;
  assert.equal(
    hostRuntime.pi.branch[0].data.payloadHash,
    mutationPayloadHash('task_plan', businessInput),
  );
  assert.notEqual(
    hostRuntime.pi.branch[0].data.payloadHash,
    mutationPayloadHash('task_plan', hostParams),
  );
  assert.equal(replay.details.mutationReceipt.replayed, true);
  assert.equal(replay.details.mutationReceipt.taskId, 'T1');
  assert.match(replay.content[0].text, /already committed task\.created for task T1/);
  assert.doesNotMatch(replay.content[0].text, /Created task T2/);
  assert.equal(hostRuntime.pi.branch.length, 1);
  assert.equal(hostRuntime.pi.stateEvents.at(-1).data.mutation, undefined);
});

test('task_evidence reserved replay 不走语义 duplicate 快速返回', async () => {
  const runtime = createFakePi('evidence-session');
  const store = createTaskRuntimeStore();
  registerTaskTools(runtime.pi, store);
  await runtime.pi.tools.get('task_plan').execute(
    'model-plan',
    taskPlanParams(),
    undefined,
    undefined,
    runtime.ctx,
  );
  const evidenceParams = {
    originos_command: {
      version: 1,
      request_id: 'host-evidence-1',
      expected_revision: 1,
      expected_cursor: 'session-entry-1',
    },
    task_id: 'T1',
    type: 'test',
    level: 'unit_test',
    summary: 'Ledger tests pass',
    passed: 'true',
    references: ['versioned-ledger.test.js'],
    criterion_ids: ['T1-AC1'],
    step_ids: ['T1-S1'],
    quality: {
      source: 'node:test',
      reproducible: true,
      verifier: 'tool',
      artifactRefs: ['versioned-ledger.test.js'],
      observedOutput: '12 tests passed',
    },
  };
  const first = await runtime.pi.tools.get('task_evidence').execute(
    'host-evidence-1',
    evidenceParams,
    undefined,
    undefined,
    runtime.ctx,
  );
  assert.equal(first.isError, undefined, first.content[0].text);
  const replay = await runtime.pi.tools.get('task_evidence').execute(
    'host-evidence-1',
    evidenceParams,
    undefined,
    undefined,
    runtime.ctx,
  );
  assert.equal(first.details.mutationReceipt.replayed, false);
  assert.equal(replay.details.mutationReceipt.replayed, true);
  assert.equal(replay.details.mutationReceipt.eventId, first.details.mutationReceipt.eventId);
  assert.equal(runtime.pi.branch.length, 2);
  assert.match(replay.content[0].text, /Idempotent replay/);
});

test('宿主 reserved scope 缺 cursor 或 ExtensionContext 缺 Session id 时 fail closed', async () => {
  const missingCursorRuntime = createFakePi();
  const missingCursorStore = createTaskRuntimeStore();
  registerTaskTools(missingCursorRuntime.pi, missingCursorStore);
  const missingCursor = await missingCursorRuntime.pi.tools.get('task_plan').execute(
    'host-missing-cursor',
    taskPlanParams({
      originos_command: {
        version: 1,
        request_id: 'host-missing-cursor',
        expected_revision: 0,
      },
    }),
    undefined,
    undefined,
    missingCursorRuntime.ctx,
  );
  assert.equal(missingCursor.isError, true);
  assert.equal(missingCursor.details.code, 'INVALID_EXPECTED_CURSOR');
  assert.match(missingCursor.content[0].text, /expectedCursor must be a string or null/);
  assert.equal(missingCursorRuntime.pi.branch.length, 0);

  const wrongVersionRuntime = createFakePi();
  const wrongVersionStore = createTaskRuntimeStore();
  registerTaskTools(wrongVersionRuntime.pi, wrongVersionStore);
  const wrongVersion = await wrongVersionRuntime.pi.tools.get('task_plan').execute(
    'host-wrong-version',
    taskPlanParams({
      originos_command: {
        version: 2,
        request_id: 'host-wrong-version',
        expected_revision: 0,
        expected_cursor: null,
      },
    }),
    undefined,
    undefined,
    wrongVersionRuntime.ctx,
  );
  assert.equal(wrongVersion.isError, true);
  assert.equal(wrongVersion.details.code, 'UNSUPPORTED_REQUEST_VERSION');
  assert.equal(wrongVersionRuntime.pi.branch.length, 0);

  const mismatchedRequestRuntime = createFakePi();
  const mismatchedRequestStore = createTaskRuntimeStore();
  registerTaskTools(mismatchedRequestRuntime.pi, mismatchedRequestStore);
  const mismatchedRequest = await mismatchedRequestRuntime.pi.tools.get('task_plan').execute(
    'runtime-tool-call-id',
    taskPlanParams({
      originos_command: {
        version: 1,
        request_id: 'different-request-id',
        expected_revision: 0,
        expected_cursor: null,
      },
    }),
    undefined,
    undefined,
    mismatchedRequestRuntime.ctx,
  );
  assert.equal(mismatchedRequest.isError, true);
  assert.equal(mismatchedRequest.details.code, 'INVALID_REQUEST_ID');
  assert.equal(mismatchedRequestRuntime.pi.branch.length, 0);

  const missingSessionRuntime = createFakePi();
  delete missingSessionRuntime.ctx.sessionManager.getSessionId;
  const missingSessionStore = createTaskRuntimeStore();
  registerTaskTools(missingSessionRuntime.pi, missingSessionStore);
  const missingSession = await missingSessionRuntime.pi.tools.get('task_plan').execute(
    'model-without-session',
    taskPlanParams(),
    undefined,
    undefined,
    missingSessionRuntime.ctx,
  );
  assert.equal(missingSession.isError, true);
  assert.match(missingSession.content[0].text, /requires a non-empty public Session id/);
  assert.equal(missingSessionRuntime.pi.branch.length, 0);
});
