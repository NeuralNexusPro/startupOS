'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const taskRuntime = require('../src/task-runtime');

function taskPlanInput() {
  return {
    title: 'OriginOS product Session host',
    objective: '验证产品 Session host 使用 canonical pi-tasks entries',
    acceptance_criteria: ['真实 extension entry 已持久化并可 replay'],
    plan_steps: [{
      text: '执行 task_plan 并保存 canonical entry',
      expectedOutput: 'Task T1 可从 branch replay',
      allowedActions: ['task_plan'],
      evidenceRequired: true,
      decompositionStatus: 'atomic',
      granularityCheck: {
        isAtomic: true,
        reason: '单次公开工具调用产生单一可观察 entry',
        canBeDoneInOneAgentAction: true,
        hasSingleObservableOutput: true,
        hasSingleVerificationMethod: true,
        hasNoHiddenSubtasks: true,
      },
    }],
  };
}

function command(scope, overrides = {}) {
  return {
    version: 1,
    requestId: 'session-host-request-1',
    toolName: 'task_plan',
    scope: {
      sessionId: scope.sessionId,
      expectedCursor: scope.cursor,
      expectedRevision: scope.revision,
      bridgeEpoch: scope.bridgeEpoch,
    },
    input: taskPlanInput(),
    ...overrides,
  };
}

function cloneEntries(entries) {
  return structuredClone(entries);
}

async function createHost(options = {}) {
  let persistedEntries = cloneEntries(options.entries ?? []);
  const persistenceCalls = [];
  const host = await taskRuntime.createPiTaskSessionHost({
    sessionId: 'product-session-1',
    bridgeEpoch: options.bridgeEpoch ?? 11,
    entries: persistedEntries,
    expectedCompatibility: options.expectedCompatibility,
    getCompatibility: options.getCompatibility,
    createEntryId({ sequence }) {
      return `product-entry-${sequence}`;
    },
    async persistEntries(entries, context) {
      if (options.persistenceError) throw new Error('disk unavailable');
      persistedEntries = cloneEntries(entries);
      persistenceCalls.push({
        entries: cloneEntries(entries),
        context: structuredClone(context),
      });
    },
  });
  return {
    host,
    persistenceCalls,
    persistedEntries: () => cloneEntries(persistedEntries),
  };
}

test('产品 Session host 冻结公共 API 并暴露真实 read-only/mutation Agent tools', async () => {
  const { host } = await createHost();
  assert.equal(typeof taskRuntime.createPiTaskSessionHost, 'function');
  assert.deepEqual(
    host.getAgentTools().map((tool) => tool.name),
    [...taskRuntime.PI_TASK_AGENT_TOOL_NAMES],
  );
  assert.deepEqual(
    host.getAgentTools().filter((tool) => !tool.mutation).map((tool) => tool.name),
    [...taskRuntime.PI_TASK_READ_ONLY_TOOL_NAMES],
  );
  assert.equal(host.getAgentTools().find((tool) => tool.name === 'task_plan').mutation, true);
  assert.equal(host.getAgentTools().find((tool) => tool.name === 'task_focus').mutation, false);
  assert.equal(host.getScope().revision, 0);
  assert.equal(host.getSnapshot().state.activeTaskId, undefined);
  assert.throws(() => {
    host.getSnapshot().state.tasks = { forged: true };
  }, TypeError);
  host.invalidate();
});

test('mutation wrapper 使用真实 extension、actual entry persistence 与 canonical snapshot', async () => {
  const { host, persistenceCalls, persistedEntries } = await createHost();
  const states = [];
  const unsubscribe = host.subscribeState((state) => states.push(state));
  const planTool = host.getAgentTools().find((tool) => tool.name === 'task_plan');
  const result = await planTool.execute('agent-tool-plan-1', taskPlanInput());

  assert.equal(result.isError, false);
  assert.equal(result.details.taskRuntime.taskId, 'T1');
  assert.equal(host.getScope().revision, 1);
  assert.equal(host.getSnapshot().state.activeTaskId, 'T1');
  assert.equal(persistenceCalls.length, 1);
  assert.equal(persistenceCalls[0].context.reason, 'mutation');
  assert.equal(persistenceCalls[0].context.appendedEntries.length, 1);
  assert.equal(persistedEntries().length, 1);
  assert.equal(persistedEntries()[0].customType, 'pi-tasks:event');
  assert.equal(states.at(-1).reason, 'mutation');

  const focusTool = host.getAgentTools().find((tool) => tool.name === 'task_focus');
  const focus = await focusTool.execute('agent-tool-focus-1', {});
  assert.notEqual(focus.isError, true);
  assert.match(focus.content[0].text, /T1/);
  assert.equal(persistenceCalls.length, 1);
  unsubscribe();
  host.invalidate();
});

test('task_decompose mutation wrapper accepts a valid atomic child plan', async () => {
  const { host } = await createHost();
  const planTool = host.getAgentTools().find((tool) => tool.name === 'task_plan');
  await planTool.execute('decompose-plan-1', taskPlanInput());
  const decomposeTool = host.getAgentTools().find((tool) => tool.name === 'task_decompose');
  const result = await decomposeTool.execute('decompose-1', {
    task_id: 'T1',
    step_id: 'T1-S1',
    reason: '拆分为两个可独立验证的步骤',
    child_steps: [
      {
        text: '收集并整理项目资料与来源清单',
        expectedOutput: '一份带来源标注的项目资料清单',
        allowedActions: ['read_file'],
        evidenceRequired: true,
        decompositionStatus: 'atomic',
        granularityCheck: {
          isAtomic: true,
          reason: '单一收集动作',
          canBeDoneInOneAgentAction: true,
          hasSingleObservableOutput: true,
          hasSingleVerificationMethod: true,
          hasNoHiddenSubtasks: true,
        },
      },
      {
        text: '核对资料完整性并记录验证结果',
        expectedOutput: '一份包含核对结论和缺口的验证记录',
        allowedActions: ['read_file', 'task_evidence'],
        evidenceRequired: true,
        decompositionStatus: 'atomic',
        granularityCheck: {
          isAtomic: true,
          reason: '单一验证动作',
          canBeDoneInOneAgentAction: true,
          hasSingleObservableOutput: true,
          hasSingleVerificationMethod: true,
          hasNoHiddenSubtasks: true,
        },
      },
    ],
  });
  assert.equal(result.isError, false);
  assert.equal(host.getScope().revision, 2);
  host.invalidate();
});

test('invoke 保持 request 幂等并拒绝 stale revision/cursor/epoch', async () => {
  const { host, persistenceCalls } = await createHost();
  const initialScope = host.getScope();
  const first = await host.invoke(command(initialScope));
  const replay = await host.invoke(command(host.getScope()));

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.eventId, first.eventId);
  assert.equal(persistenceCalls.length, 1);

  await assert.rejects(() => host.invoke(command({
    ...host.getScope(),
    revision: 0,
  }, { requestId: 'stale-revision' })), { code: 'REVISION_CONFLICT' });
  await assert.rejects(() => host.invoke(command({
    ...host.getScope(),
    cursor: 'stale-cursor',
  }, { requestId: 'stale-cursor' })), { code: 'BRANCH_CONFLICT' });
  await assert.rejects(() => host.invoke(command({
    ...host.getScope(),
    bridgeEpoch: host.getScope().bridgeEpoch - 1,
  }, { requestId: 'stale-epoch' })), { code: 'BRIDGE_EPOCH_STALE' });
  host.invalidate();
});

test('compaction checkpoint 持久化 snapshot entry，reload replay 并淘汰旧 epoch', async () => {
  const { host, persistenceCalls, persistedEntries } = await createHost();
  const first = await host.invoke(command(host.getScope()));
  const preCheckpointScope = host.getScope();
  const checkpoint = await host.checkpoint({
    expectedScope: {
      sessionId: preCheckpointScope.sessionId,
      expectedCursor: preCheckpointScope.cursor,
      expectedRevision: preCheckpointScope.revision,
      bridgeEpoch: preCheckpointScope.bridgeEpoch,
    },
    reason: 'contract test compaction',
  });

  assert.equal(checkpoint.reason, 'compaction');
  assert.equal(checkpoint.scope.revision, first.revisionAfter);
  assert.equal(persistenceCalls.length, 2);
  assert.equal(persistenceCalls[1].context.reason, 'compaction');
  assert.equal(persistedEntries().at(-1).data.kind, 'snapshot');

  const oldScope = host.getScope();
  const restored = await host.restore(persistedEntries());
  assert.equal(restored.scope.revision, 1);
  assert.equal(restored.snapshot.state.activeTaskId, 'T1');
  assert.equal(restored.scope.bridgeEpoch, oldScope.bridgeEpoch + 1);
  await assert.rejects(
    () => host.invoke(command(oldScope, { requestId: 'old-epoch-after-restore' })),
    { code: 'BRIDGE_EPOCH_STALE' },
  );
  host.invalidate();
});

test('恢复损坏 entry、持久化失败与 compatibility mismatch 均 fail closed', async () => {
  await assert.rejects(() => taskRuntime.createPiTaskSessionHost({
    sessionId: 'product-session-1',
    persistEntries: async () => {},
    entries: [{ id: 'duplicate', parentId: null, type: 'custom' }, {
      id: 'duplicate', parentId: 'duplicate', type: 'custom',
    }],
  }), { code: 'INVALID_BRANCH_ENTRY' });

  const mismatch = {
    ...taskRuntime.PI_TASK_SESSION_HOST_COMPATIBILITY,
    runtimeVersion: '0.80.11',
  };
  await assert.rejects(() => taskRuntime.createPiTaskSessionHost({
    sessionId: 'product-session-1',
    persistEntries: async () => {},
    getCompatibility: () => mismatch,
  }), { code: 'INCOMPATIBLE_RUNTIME' });

  const { host } = await createHost({ persistenceError: true });
  await assert.rejects(() => host.invoke(command(host.getScope())), {
    code: 'PERSISTENCE_FAILED',
  });
  assert.throws(() => host.getScope(), { code: 'BRIDGE_EPOCH_STALE' });
  host.invalidate();
});

test('Agent mutation wrapper 尊重已中止 signal 且不写 canonical entry', async () => {
  const { host, persistenceCalls } = await createHost();
  const controller = new AbortController();
  controller.abort(new Error('user stopped task'));
  const planTool = host.getAgentTools().find((tool) => tool.name === 'task_plan');
  const result = await planTool.execute(
    'aborted-agent-plan',
    taskPlanInput(),
    controller.signal,
  );
  assert.equal(result.isError, true);
  assert.equal(result.details.code, 'ABORTED');
  assert.equal(host.getScope().revision, 0);
  assert.equal(persistenceCalls.length, 0);
  host.invalidate();
});

test('产品 Session host 不访问 pi-tasks 私有 reducer/store/source 子路径', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'task-runtime', 'session-host.js'),
    'utf8',
  );
  assert.doesNotMatch(source, /@originos\/pi-tasks\/(?:store|src|reducer)/);
  assert.match(source, /import\('@originos\/pi-tasks'\)/);
});
