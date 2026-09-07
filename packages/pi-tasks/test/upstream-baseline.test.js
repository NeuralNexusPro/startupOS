import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ORIGINOS_PI_TASKS_VERSION,
  PI_TASKS_UPSTREAM_ENTRY_SHA256,
  PI_TASKS_UPSTREAM_REDUCER_SHA256,
  UPSTREAM_PI_TASKS_VERSION,
  createTaskRuntimeStore,
} from '../index.js';

async function fileSha256(relativeUrl) {
  const content = await readFile(new URL(relativeUrl, import.meta.url));
  return createHash('sha256').update(content).digest('hex');
}

test('受控 package 保留可审计的 pi-tasks 0.2.0 上游 fingerprint', async () => {
  assert.equal(ORIGINOS_PI_TASKS_VERSION, '0.2.0-originos.1');
  assert.equal(UPSTREAM_PI_TASKS_VERSION, '0.2.0');
  assert.equal(
    await fileSha256('../upstream/index.js'),
    PI_TASKS_UPSTREAM_ENTRY_SHA256,
  );
  assert.equal(
    await fileSha256('../upstream/reducer.js'),
    PI_TASKS_UPSTREAM_REDUCER_SHA256,
  );
});

test('v1 task ledger 通过上游 reducer 正常 replay', () => {
  const event = {
    version: 1,
    id: 'event-1',
    type: 'task.created',
    taskId: 'T1',
    createdAt: '2026-08-01T00:00:00.000Z',
    source: 'import',
    title: '验证受控 Task package',
    objective: '证明 v1 ledger 可以由上游 reducer 稳定重放',
    acceptanceCriteria: ['重放后存在一个 active task'],
    planSteps: [{
      text: '执行单次 v1 ledger 重放',
      expectedOutput: '状态中出现 T1 active task',
      allowedActions: ['调用 replay'],
      evidenceRequired: true,
      decompositionStatus: 'atomic',
      granularityCheck: {
        isAtomic: true,
        reason: '单次 reducer 调用产生一个可观察状态',
        canBeDoneInOneAgentAction: true,
        hasSingleObservableOutput: true,
        hasSingleVerificationMethod: true,
        hasNoHiddenSubtasks: true,
      },
    }],
    activate: true,
  };
  const store = createTaskRuntimeStore();
  const replay = store.replay([{
    id: 'cursor-1',
    type: 'custom',
    customType: 'pi-tasks:event',
    data: event,
  }]);
  assert.deepEqual(replay.malformedEvents, []);
  assert.equal(replay.state.activeTaskId, 'T1');
  assert.equal(replay.state.tasks.T1.status, 'active');
});
