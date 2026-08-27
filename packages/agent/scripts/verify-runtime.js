'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXPECTED_VERSIONS = {
  '@earendil-works/pi-agent-core': '0.80.10',
  '@earendil-works/pi-ai': '0.80.10',
  '@earendil-works/pi-coding-agent': '0.80.10',
  '@earendil-works/pi-tui': '0.80.10',
  'pi-agent-goal': '2026.7.18',
  typebox: '1.1.38',
};

const PROVIDER_RUNTIME_DEPENDENCIES = [
  '@anthropic-ai/sdk',
  '@aws-sdk/client-bedrock-runtime',
  '@google/genai',
  '@mistralai/mistralai',
  '@opentelemetry/api',
  '@smithy/node-http-handler',
  'http-proxy-agent',
  'https-proxy-agent',
  'openai',
];

function verifyDependencyVersions() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  );
  for (const [name, expectedVersion] of Object.entries(EXPECTED_VERSIONS)) {
    assert.equal(
      manifest.dependencies[name],
      expectedVersion,
      `${name} must be pinned to ${expectedVersion}`,
    );
  }

  const lockfile = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'pnpm-lock.yaml'), 'utf8');
  assert.equal(lockfile.includes('@mariozechner/pi-agent-core'), false);
  assert.equal(lockfile.includes('@mariozechner/pi-ai'), false);
  assert.equal(lockfile.includes('@earendil-works/pi-agent-core@0.82'), false);
  assert.equal(lockfile.includes('@earendil-works/pi-ai@0.82'), false);

  for (const dependency of PROVIDER_RUNTIME_DEPENDENCIES) {
    assert.equal(
      typeof manifest.dependencies[dependency],
      'string',
      `${dependency} must be a direct adapter runtime dependency`,
    );
    assert.doesNotThrow(
      () => require.resolve(dependency, { paths: [path.join(__dirname, '..')] }),
      `${dependency} must resolve from the adapter boundary`,
    );
  }
}

async function main() {
  const startedAt = Date.now();
  verifyDependencyVersions();
  const core = require('@originos/pi-agent-adapter');
  const ai = require('@originos/pi-agent-adapter/ai');
  const goalExtension = require('@originos/pi-agent-adapter/goal');
  const taskRuntime = require('@originos/pi-agent-adapter/task-runtime');

  assert.equal(typeof core.Agent, 'function');
  assert.equal(typeof ai.streamSimple, 'function');
  assert.equal(typeof ai.completeSimple, 'function');
  assert.equal(typeof goalExtension, 'function');
  assert.equal(typeof taskRuntime.createPiTaskSessionHost, 'function');
  assert.equal(taskRuntime.PI_TASK_AGENT_TOOL_NAMES.includes('task_plan'), true);
  assert.equal(taskRuntime.PI_TASK_AGENT_TOOL_NAMES.includes('task_focus'), true);

  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  const branch = [];
  const api = {
    appendEntry(customType, data) {
      branch.push({ type: 'custom', customType, data });
    },
    getFlag() {
      return undefined;
    },
    on(event, handler) {
      const eventHandlers = handlers.get(event) ?? [];
      eventHandlers.push(handler);
      handlers.set(event, eventHandlers);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerFlag() {},
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    sendUserMessage() {},
  };

  goalExtension(api);

  assert.deepEqual(
    [...tools.keys()].sort(),
    ['complete_goal', 'create_goal', 'get_goal', 'propose_goal_draft', 'update_goal_progress'],
  );
  assert.equal(commands.has('goal'), true);
  assert.equal(handlers.has('session_start'), true);
  assert.equal(handlers.has('agent_settled'), true);

  const context = {
    hasUI: false,
    sessionManager: {
      getBranch() {
        return branch;
      },
    },
  };
  const signal = new AbortController().signal;
  const execute = (name, params) =>
    tools.get(name).execute(`verify-${name}`, params, signal, undefined, context);

  const created = await execute('create_goal', {
    objective: 'Pass Story 0.7 regression tests',
    explicit_request: true,
    acceptance_criteria: ['Runtime loads', 'Goal lifecycle persists'],
  });
  assert.equal(created.details.goal.status, 'active');
  assert.equal(created.details.goal.objective, 'Pass Story 0.7 regression tests');

  const loaded = await execute('get_goal', {});
  assert.equal(loaded.details.goal.goalId, created.details.goal.goalId);

  const updated = await execute('update_goal_progress', {
    done: ['Runtime loads'],
    current: 'Goal lifecycle persists',
    summary: 'Adapter and extension loaded',
  });
  assert.deepEqual(updated.details.goal.progress.done, ['Runtime loads']);
  assert.equal(updated.details.goal.progress.current, 'Goal lifecycle persists');

  const completed = await execute('complete_goal', {
    evidence: 'Lifecycle smoke test passed',
  });
  assert.equal(completed.details.goal.status, 'complete');

  branch.push({
    type: 'custom',
    customType: 'pi-agent-goal-state',
    data: { state: { invalid: true } },
  });
  const reloaded = await execute('get_goal', {});
  assert.equal(reloaded.details.goal.status, 'complete');
  assert.equal(reloaded.details.goal.goalId, created.details.goal.goalId);

  const esmGoal = await import('@originos/pi-agent-adapter/goal');
  assert.equal(typeof esmGoal.default, 'function');

  console.log(
    `[pi-agent-adapter] runtime and goal lifecycle verified in ${Date.now() - startedAt}ms`,
  );
}

main().catch((error) => {
  console.error('[pi-agent-adapter] runtime verification failed', error);
  process.exitCode = 1;
});
