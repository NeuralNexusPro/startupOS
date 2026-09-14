'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const taskRuntime = require('../src/task-runtime');

const digest = 'a'.repeat(64);

function compatibility(overrides = {}) {
  return {
    ...taskRuntime.PI_TASK_COMPATIBILITY_REQUIREMENTS,
    runtimePatchHash: digest,
    taskExtensionFingerprint: digest,
    ...overrides,
  };
}

function command(overrides = {}) {
  return {
    version: 1,
    requestId: 'request-1',
    toolName: 'task_plan',
    scope: {
      sessionId: 'session-1',
      expectedCursor: null,
      expectedRevision: 0,
      bridgeEpoch: 3,
    },
    input: { objective: '验证 Task Runtime' },
    ...overrides,
  };
}

test('公共子路径、类型声明和 allowlist 保持显式', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  );
  assert.deepEqual(manifest.exports['./task-runtime'], {
    types: './task-runtime.d.ts',
    require: './task-runtime.js',
    default: './task-runtime.js',
  });
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'task-runtime.d.ts')), true);
  assert.equal(typeof taskRuntime.createPiTaskSessionHost, 'function');
  assert.deepEqual(taskRuntime.PI_TASK_READ_ONLY_TOOL_NAMES, [
    'task_next',
    'task_focus',
    'task_resume',
    'task_granularity_check',
    'task_list',
  ]);
  assert.equal(taskRuntime.isAllowedPiTaskTool('task_complete'), true);
  assert.equal(taskRuntime.isAllowedPiTaskTool('task_force_complete'), false);
  assert.throws(() => taskRuntime.assertAllowedPiTaskTool('read_file'), {
    code: 'TOOL_NOT_ALLOWED',
  });

  const declarations = fs.readFileSync(
    path.join(__dirname, '..', 'task-runtime.d.ts'),
    'utf8',
  );
  assert.match(declarations, /export function createPiTaskSessionHost\(/);
  for (const method of [
    'restore',
    'getSnapshot',
    'getScope',
    'getAgentTools',
    'invoke',
    'subscribeState',
    'checkpoint',
    'invalidate',
  ]) {
    assert.match(declarations, new RegExp(`\\b${method}\\(`));
  }
});

test('command canonical hash 与 compatibility guard 可重复且 fail closed', () => {
  const left = taskRuntime.normalizePiTaskCommand(command());
  const right = taskRuntime.normalizePiTaskCommand(command({
    input: { objective: '验证 Task Runtime' },
  }));
  assert.equal(left.inputHash, right.inputHash);
  assert.equal(taskRuntime.evaluatePiTaskCompatibility(compatibility(), compatibility()).compatible, true);
  const mismatch = taskRuntime.evaluatePiTaskCompatibility(
    compatibility({ runtimeVersion: '0.80.11' }),
    compatibility(),
  );
  assert.equal(mismatch.compatible, false);
  assert.deepEqual(mismatch.mismatches, ['runtimeVersion']);
  assert.throws(() => taskRuntime.normalizePiTaskCommand(command({
    input: { originos_command: { request_id: 'forged' } },
  })), { code: 'INVALID_COMMAND' });
});

test('敏感字段被裁剪且 oversized snapshot 有界', () => {
  const sanitized = taskRuntime.sanitizeTaskRuntimeValue({
    authorization: 'Bearer secret',
    nested: { apiKey: 'secret', value: 'ok' },
  });
  assert.deepEqual(sanitized, {
    authorization: '[REDACTED]',
    nested: { apiKey: '[REDACTED]', value: 'ok' },
  });

  const snapshot = taskRuntime.createBoundedPiTaskSnapshot({
    scope: { sessionId: 'session-1' },
    stateHash: digest,
    state: { output: 'x'.repeat(10000) },
  }, { maxSnapshotBytes: 512, maxStringLength: 10000 });
  assert.equal(snapshot.state.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot), 'utf8') <= 512);
});

test('companion extension 拒绝未知 task tool，gateway 绑定 epoch 与兼容矩阵', async () => {
  const handlers = new Map();
  const invocations = [];
  const stateHandlers = new Set();
  const bridge = taskRuntime.createPiTaskRuntimeBridge({
    sessionId: 'session-1',
    bridgeEpoch: 3,
    expectedCompatibility: compatibility(),
    getCompatibility: () => compatibility(),
    getCurrentScope: () => ({ sessionId: 'session-1', cursor: invocations.length === 0 ? null : 'cursor-1' }),
    abortHostInvocation: () => {},
    isCursorOnCurrentBranch: (cursor) => cursor === null || cursor === 'cursor-1',
    invokeRegisteredTool: async (request) => {
      invocations.push(request);
      const receipt = {
        version: 1,
        requestId: request.toolCallId,
        command: request.toolName,
        revisionBefore: 0,
        revisionAfter: 1,
        ledgerCursorBefore: null,
        ledgerCursorAfter: 'cursor-1',
        cursorBefore: null,
        cursorAfter: 'cursor-1',
        taskId: 'T1',
        eventId: 'event-1',
        eventType: 'task.created',
        stateHash: digest,
        payloadHash: taskRuntime.stableJsonHash({
          toolName: request.toolName,
          input: { objective: '验证 Task Runtime' },
        }),
        replayed: false,
      };
      for (const handler of stateHandlers) {
        handler({
          version: 2,
          reason: 'task_mutation',
          widgetId: 'pi-tasks',
          scope: { sessionId: 'session-1', cursor: 'cursor-1', revision: 1 },
          mutation: {
            requestId: request.toolCallId,
            command: request.toolName,
            eventId: 'event-1',
            receipt,
          },
          stateHash: digest,
          state: { tasks: { T1: { id: 'T1' } } },
        });
      }
      return {
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        isError: false,
        result: { details: { mutationReceipt: receipt } },
      };
    },
  });
  bridge.extension({
    on(name, handler) {
      handlers.set(name, handler);
    },
    events: {
      on(name, handler) {
        assert.equal(name, taskRuntime.PI_TASK_STATE_EVENT_NAME);
        stateHandlers.add(handler);
        return () => stateHandlers.delete(handler);
      },
    },
  });

  assert.equal(handlers.get('tool_call')({ toolName: 'task_plan' }), undefined);
  assert.equal(handlers.get('tool_call')({ toolName: 'task_force_complete' }).block, true);
  const result = await bridge.gateway.invoke(command());
  assert.equal(result.requestId, 'request-1');
  assert.equal(result.revisionAfter, 1);
  assert.equal(result.snapshot.scope.sessionId, 'session-1');
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].toolCallId, 'request-1');
  assert.deepEqual(invocations[0].input.originos_command, {
    version: 1,
    request_id: 'request-1',
    expected_revision: 0,
    expected_cursor: null,
  });

  bridge.invalidate();
  await assert.rejects(() => bridge.gateway.invoke(command()), {
    code: 'BRIDGE_EPOCH_STALE',
  });
});

test('runtime error mapping 不泄露 message、token 或路径', () => {
  const source = new Error('provider leaked text');
  source.code = 'SESSION_BUSY';
  source.details = {
    token: 'secret',
    filePath: 'C:\\Users\\secret\\task.json',
    safe: 'visible',
  };
  assert.deepEqual(taskRuntime.mapPiTaskRuntimeError(source), {
    version: 1,
    code: 'SESSION_BUSY',
    message: 'Task Runtime error: SESSION_BUSY',
    retryable: true,
    details: {
      filePath: '[REDACTED]',
      safe: 'visible',
      token: '[REDACTED]',
    },
  });
});

test('extension 安装失败回滚 public event listener 并允许重试', () => {
  const stateHandlers = new Set();
  let failInstall = true;
  const bridge = taskRuntime.createPiTaskRuntimeBridge({
    sessionId: 'session-1',
    bridgeEpoch: 1,
    expectedCompatibility: compatibility(),
    getCompatibility: () => compatibility(),
    getCurrentScope: () => ({ sessionId: 'session-1', cursor: null }),
    abortHostInvocation: () => {},
    isCursorOnCurrentBranch: (cursor) => cursor === null,
    invokeRegisteredTool: async () => {
      throw new Error('not used');
    },
  });
  const pi = {
    events: {
      on(_name, handler) {
        stateHandlers.add(handler);
        return () => stateHandlers.delete(handler);
      },
    },
    on() {
      if (failInstall) throw new Error('install failed');
    },
  };

  assert.throws(() => bridge.extension(pi), /install failed/);
  assert.equal(stateHandlers.size, 0);
  failInstall = false;
  bridge.extension(pi);
  assert.equal(stateHandlers.size, 1);
  bridge.invalidate();
  assert.equal(stateHandlers.size, 0);
});

test('idle bridge invalidate 不调用宿主 abort', async () => {
  let abortCalls = 0;
  const bridge = taskRuntime.createPiTaskRuntimeBridge({
    sessionId: 'session-1',
    bridgeEpoch: 1,
    expectedCompatibility: compatibility(),
    getCompatibility: () => compatibility(),
    getCurrentScope: () => ({ sessionId: 'session-1', cursor: null }),
    abortHostInvocation: () => {
      abortCalls += 1;
    },
    isCursorOnCurrentBranch: (cursor) => cursor === null,
    invokeRegisteredTool: async () => {
      throw new Error('not used');
    },
  });
  bridge.extension({
    events: { on: () => () => {} },
    on() {},
  });
  bridge.invalidate();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(abortCalls, 0);
});
