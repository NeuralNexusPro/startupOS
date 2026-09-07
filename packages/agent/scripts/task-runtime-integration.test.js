'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const taskRuntime = require('../src/task-runtime');

const digest = 'a'.repeat(64);

function compatibility() {
  return {
    ...taskRuntime.PI_TASK_COMPATIBILITY_REQUIREMENTS,
    runtimePatchHash: digest,
    taskExtensionFingerprint: digest,
  };
}

function taskPlanInput() {
  return {
    title: 'OriginOS Task Runtime integration',
    objective: '验证同 Session current branch 上的受控任务写入',
    acceptance_criteria: ['current branch 包含一个受控 task event'],
    plan_steps: [{
      text: '执行一次 task_plan',
      expectedOutput: 'Task T1 被创建',
      allowedActions: ['task_plan'],
      evidenceRequired: true,
      decompositionStatus: 'atomic',
      granularityCheck: {
        isAtomic: true,
        reason: '单次工具调用产生单一可观察输出',
        canBeDoneInOneAgentAction: true,
        hasSingleObservableOutput: true,
        hasSingleVerificationMethod: true,
        hasNoHiddenSubtasks: true,
      },
    }],
  };
}

function command(overrides = {}) {
  return {
    version: 1,
    requestId: 'integration-request-1',
    toolName: 'task_plan',
    scope: {
      sessionId: 'integration-session',
      expectedCursor: null,
      expectedRevision: 0,
      bridgeEpoch: 7,
    },
    input: taskPlanInput(),
    ...overrides,
  };
}

function createEventBus() {
  const handlers = new Map();
  const muted = new Set();
  return {
    muted,
    emit(channel, data) {
      if (muted.has(channel)) return;
      for (const handler of handlers.get(channel) ?? []) handler(data);
    },
    on(channel, handler) {
      const channelHandlers = handlers.get(channel) ?? new Set();
      channelHandlers.add(handler);
      handlers.set(channel, channelHandlers);
      return () => {
        channelHandlers.delete(handler);
        if (channelHandlers.size === 0) handlers.delete(channel);
      };
    },
    listenerCount(channel) {
      return handlers.get(channel)?.size ?? 0;
    },
  };
}

async function createHarness(options = {}) {
  const moduleUrl = pathToFileURL(
    path.join(__dirname, '..', '..', 'pi-tasks', 'index.js'),
  ).href;
  const piTasks = await import(moduleUrl);
  const tools = new Map();
  const lifecycleHandlers = new Map();
  const branch = [];
  const messages = [];
  const events = createEventBus();
  let cursorSequence = 0;
  let busy = false;

  const pi = {
    events,
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand() {},
    on(name, handler) {
      const handlers = lifecycleHandlers.get(name) ?? [];
      handlers.push(handler);
      lifecycleHandlers.set(name, handlers);
    },
    appendEntry(customType, data) {
      cursorSequence += 1;
      branch.push({
        id: `integration-cursor-${cursorSequence}`,
        parentId: branch.at(-1)?.id ?? null,
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
      getSessionId: () => 'integration-session',
    },
    ui: {
      notify() {},
      setStatus() {},
      setWidget() {},
    },
  };

  piTasks.default(pi);

  const host = {
    messages,
    setBusy(value) {
      busy = value;
    },
    async invokeRegisteredTool(request) {
      if (busy) {
        const error = new Error('AgentSession is busy');
        error.code = 'SESSION_BUSY';
        throw error;
      }
      const tool = tools.get(request.toolName);
      if (!tool) {
        const error = new Error('Registered tool is not active');
        error.code = 'TOOL_NOT_ACTIVE';
        throw error;
      }
      if (options.hostNeverSettles) return new Promise(() => {});
      if (options.hostErrorDetails) {
        return {
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          isError: true,
          result: {
            isError: true,
            content: [],
            details: options.hostErrorDetails,
          },
        };
      }
      for (const handler of lifecycleHandlers.get('tool_call') ?? []) {
        const decision = await handler({
          toolName: request.toolName,
          input: request.input,
        }, ctx);
        if (decision?.block) {
          return {
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            isError: true,
            result: {
              isError: true,
              details: { code: 'PERMISSION_DENIED' },
              content: [{ type: 'text', text: decision.reason }],
            },
          };
        }
      }
      if (typeof options.beforeToolExecute === 'function') {
        await options.beforeToolExecute({ branch, events, pi, request });
      }
      const result = await tool.execute(
        request.toolCallId,
        request.input,
        undefined,
        () => {},
        ctx,
      );
      if (typeof options.afterToolExecute === 'function') {
        await options.afterToolExecute({ branch, pi });
      }
      return {
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        result,
        isError: result.isError === true,
      };
    },
  };
  const bridge = taskRuntime.createPiTaskRuntimeBridge({
    sessionId: 'integration-session',
    bridgeEpoch: options.bridgeEpoch ?? 7,
    stateEventTimeoutMs: options.stateEventTimeoutMs ?? 50,
    expectedCompatibility: compatibility(),
    getCompatibility: () => compatibility(),
    getCurrentScope: () => ({
      sessionId: 'integration-session',
      cursor: branch.at(-1)?.id ?? null,
    }),
    abortHostInvocation: () => options.onAbort?.(),
    isCursorOnCurrentBranch: (cursor) => (
      cursor === null ? branch.length === 0 : branch.some((entry) => entry.id === cursor)
    ),
    invokeRegisteredTool: host.invokeRegisteredTool.bind(host),
  });
  bridge.extension(pi);

  return { branch, bridge, events, host, messages, piTasks };
}

test('真实受控 extension 在原 Session/current branch mutation，且不产生孤立消息', async () => {
  const harness = await createHarness();
  const messagesBefore = harness.messages.length;
  const result = await harness.bridge.gateway.invoke(command());

  assert.equal(result.isError, false);
  assert.equal(result.requestId, 'integration-request-1');
  assert.equal(result.taskId, 'T1');
  assert.equal(result.revisionBefore, 0);
  assert.equal(result.revisionAfter, 1);
  assert.equal(result.cursorBefore, null);
  assert.equal(result.cursorAfter, 'integration-cursor-1');
  assert.equal(result.snapshot.scope.sessionId, 'integration-session');
  assert.equal(result.snapshot.scope.cursor, 'integration-cursor-1');
  assert.equal(harness.branch.length, 1);
  assert.equal(harness.branch[0].customType, 'pi-tasks:event');
  assert.equal(harness.branch[0].data.requestId, 'integration-request-1');
  assert.equal(harness.messages.length, messagesBefore);
});

test('相同 requestId 从 canonical ledger 幂等重放且不追加 branch entry', async () => {
  const harness = await createHarness();
  const first = await harness.bridge.gateway.invoke(command());
  const replay = await harness.bridge.gateway.invoke(command({
    scope: {
      sessionId: 'integration-session',
      expectedCursor: first.cursorAfter,
      expectedRevision: first.revisionAfter,
      bridgeEpoch: 7,
    },
  }));

  assert.equal(replay.replayed, true);
  assert.equal(replay.eventId, first.eventId);
  assert.equal(replay.revisionAfter, first.revisionAfter);
  assert.equal(harness.branch.length, 1);
  assert.equal(replay.snapshot.mutation, undefined);
});

test('后续 mutation 推进 state 后仍可重放较早 requestId 并返回当前 snapshot', async () => {
  const harness = await createHarness();
  const first = await harness.bridge.gateway.invoke(command());
  const second = await harness.bridge.gateway.invoke(command({
    requestId: 'integration-request-2',
    toolName: 'task_update',
    scope: {
      sessionId: 'integration-session',
      expectedCursor: first.cursorAfter,
      expectedRevision: first.revisionAfter,
      bridgeEpoch: 7,
    },
    input: {
      task_id: 'T1',
      next_action: '执行证据验证',
    },
  }));
  const replay = await harness.bridge.gateway.invoke(command({
    scope: {
      sessionId: 'integration-session',
      expectedCursor: second.cursorAfter,
      expectedRevision: second.revisionAfter,
      bridgeEpoch: 7,
    },
  }));

  assert.equal(replay.replayed, true);
  assert.equal(replay.eventId, first.eventId);
  assert.equal(replay.revisionAfter, first.revisionAfter);
  assert.equal(replay.snapshot.scope.revision, second.revisionAfter);
  assert.equal(replay.snapshot.scope.cursor, second.cursorAfter);
  assert.equal(harness.branch.length, 2);
});

test('普通 Session message 成为 leaf 后 replay 仍接受 branch 内旧 task cursor', async () => {
  const harness = await createHarness();
  const first = await harness.bridge.gateway.invoke(command());
  harness.branch.push({
    id: 'message-leaf-1',
    parentId: first.cursorAfter,
    type: 'message',
    role: 'user',
  });
  const replay = await harness.bridge.gateway.invoke(command({
    scope: {
      sessionId: 'integration-session',
      expectedCursor: 'message-leaf-1',
      expectedRevision: first.revisionAfter,
      bridgeEpoch: 7,
    },
  }));
  assert.equal(replay.replayed, true);
  assert.equal(replay.snapshot.scope.cursor, first.cursorAfter);
  assert.equal(harness.branch.at(-1).id, 'message-leaf-1');
});

test('迟到的同 requestId stale event 不会阻断后续有效同步 event', async () => {
  const harness = await createHarness({
    beforeToolExecute({ events, request }) {
      events.emit(taskRuntime.PI_TASK_STATE_EVENT_NAME, {
        version: 2,
        reason: 'task_mutation',
        widgetId: 'pi-tasks',
        scope: { sessionId: 'integration-session', cursor: null, revision: 0 },
        mutation: {
          requestId: request.toolCallId,
          command: request.toolName,
          eventId: 'stale-event',
        },
        stateHash: digest,
        state: {},
      });
    },
  });
  const result = await harness.bridge.gateway.invoke(command());
  assert.equal(result.revisionAfter, 1);
});

test('同 Session/revision 但不属于 current branch 的 replay event 被忽略', async () => {
  const harness = await createHarness({
    beforeToolExecute({ events }) {
      events.emit(taskRuntime.PI_TASK_STATE_EVENT_NAME, {
        version: 2,
        reason: 'task_mutation',
        widgetId: 'pi-tasks',
        scope: {
          sessionId: 'integration-session',
          cursor: 'sibling-branch-cursor',
          revision: 1,
        },
        stateHash: digest,
        state: { tasks: { sibling: true } },
      });
    },
  });
  const result = await harness.bridge.gateway.invoke(command());
  assert.equal(result.snapshot.scope.cursor, 'integration-cursor-1');
  assert.equal(result.snapshot.state.tasks.sibling, undefined);
});

test('stale Session/branch scope 与 busy Session 均 fail closed', async () => {
  const sessionHarness = await createHarness();
  await assert.rejects(
    () => sessionHarness.bridge.gateway.invoke(command({
      scope: {
        sessionId: 'another-session',
        expectedCursor: null,
        expectedRevision: 0,
        bridgeEpoch: 7,
      },
    })),
    { code: 'SESSION_MISMATCH' },
  );
  assert.equal(sessionHarness.branch.length, 0);

  const branchHarness = await createHarness();
  await assert.rejects(
    () => branchHarness.bridge.gateway.invoke(command({
      scope: {
        sessionId: 'integration-session',
        expectedCursor: 'stale-cursor',
        expectedRevision: 0,
        bridgeEpoch: 7,
      },
    })),
    { code: 'BRANCH_CONFLICT' },
  );
  assert.equal(branchHarness.branch.length, 0);

  const busyHarness = await createHarness();
  busyHarness.host.setBusy(true);
  await assert.rejects(() => busyHarness.bridge.gateway.invoke(command()), {
    code: 'SESSION_BUSY',
  });
  assert.equal(busyHarness.branch.length, 0);
});

test('public state event 超时后清理 waiter，不把已写入 mutation 确认为成功', async () => {
  const harness = await createHarness({ stateEventTimeoutMs: 20 });
  harness.events.muted.add(taskRuntime.PI_TASK_STATE_EVENT_NAME);
  await assert.rejects(() => harness.bridge.gateway.invoke(command()), {
    code: 'STATE_EVENT_TIMEOUT',
  });
  assert.equal(harness.branch.length, 1);
  assert.equal(harness.events.listenerCount(taskRuntime.PI_TASK_STATE_EVENT_NAME), 1);
  harness.events.muted.delete(taskRuntime.PI_TASK_STATE_EVENT_NAME);
  const recovered = await harness.bridge.gateway.invoke(command({
    scope: {
      sessionId: 'integration-session',
      expectedCursor: 'integration-cursor-1',
      expectedRevision: 1,
      bridgeEpoch: 7,
    },
  }));
  assert.equal(recovered.replayed, true);
  assert.equal(harness.branch.length, 1);
  harness.bridge.invalidate();
  assert.equal(harness.events.listenerCount(taskRuntime.PI_TASK_STATE_EVENT_NAME), 0);
});

test('tool 执行期间 current branch 改变时拒绝确认 mutation', async () => {
  const harness = await createHarness({
    afterToolExecute({ branch }) {
      branch.push({
        id: 'unexpected-branch-entry',
        parentId: branch.at(-1)?.id ?? null,
        type: 'custom',
        customType: 'other-extension:event',
        data: {},
      });
    },
  });
  await assert.rejects(() => harness.bridge.gateway.invoke(command()), {
    code: 'CONTRACT_VIOLATION',
  });
  assert.equal(harness.branch.length, 2);
});

test('reload 后旧 bridge epoch 失效，新 bridge 继续使用同一 Session scope', async () => {
  const oldHarness = await createHarness();
  oldHarness.bridge.invalidate();
  await assert.rejects(() => oldHarness.bridge.gateway.invoke(command()), {
    code: 'BRIDGE_EPOCH_STALE',
  });

  const newHarness = await createHarness({ bridgeEpoch: 8 });
  const result = await newHarness.bridge.gateway.invoke(command({
    scope: {
      sessionId: 'integration-session',
      expectedCursor: null,
      expectedRevision: 0,
      bridgeEpoch: 8,
    },
  }));
  assert.equal(result.revisionAfter, 1);
});

test('invalidate 立即终止未返回的 host invocation，并调用宿主 abort', async () => {
  let abortCalls = 0;
  const harness = await createHarness({
    hostNeverSettles: true,
    onAbort() {
      abortCalls += 1;
    },
  });
  const invocation = harness.bridge.gateway.invoke(command());
  await new Promise((resolve) => setImmediate(resolve));
  harness.bridge.invalidate();
  await assert.rejects(
    Promise.race([
      invocation,
      new Promise((_, reject) => setTimeout(() => reject(new Error('invoke remained pending')), 100)),
    ]),
    { code: 'BRIDGE_EPOCH_STALE' },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(abortCalls, 1);
});

test('错误 tool result 的敏感 details 在 public error 边界被裁剪', async () => {
  const harness = await createHarness({
    hostErrorDetails: {
      code: 'PERMISSION_DENIED',
      token: 'secret-token',
      filePath: 'C:\\Users\\secret\\task.json',
      safe: 'visible',
    },
  });
  const error = await harness.bridge.gateway.invoke(command()).catch((caught) => caught);
  assert.equal(error.code, 'PERMISSION_DENIED');
  assert.deepEqual(error.details, {
    code: 'PERMISSION_DENIED',
    filePath: '[REDACTED]',
    safe: 'visible',
    token: '[REDACTED]',
  });
});
