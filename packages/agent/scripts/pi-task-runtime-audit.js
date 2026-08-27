'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ADAPTER_VERSION = '0.80.10';
const CONTROLLED_TASK_PACKAGE = '@originos/pi-tasks';
const CONTROLLED_TASK_VERSION = '0.2.0-originos.1';
const TASK_PACKAGE_FINGERPRINT =
  'c900eb1fc776fd0c2ed28d076374a0253d6cb01963590f0930591725b9bb99e0';
const TASK_SCHEMA_FINGERPRINT =
  'originos-pi-tasks/v1:event-v2:cas:receipt:evidence-gate-no-force';
const RUNTIME_PATCHES = Object.freeze([
  {
    name: '@earendil-works/pi-agent-core',
    file: 'patches/@earendil-works__pi-agent-core@0.80.10.patch',
    sha256: '10bda90bbb3ff426f6057312464e2cdb470fe61acd4f9e37ffc8436755e644a6',
  },
  {
    name: '@earendil-works/pi-coding-agent',
    file: 'patches/@earendil-works__pi-coding-agent@0.80.10.patch',
    sha256: '7d70e7b71db29280df41ddf1f8701c9ae56c98e9e48b85ee11700c4ca66c11b4',
  },
]);
const RUNTIME_PATCH_SET_SHA256 =
  '213b1f2db610720ca0dde1853abbe02975185ad37c95eb517031844631371674';
const EXPECTED_TASK_EXPORTS = [
  'ORIGINOS_PI_TASKS_VERSION',
  'PI_TASK_CHECKPOINT_MAX_BYTES',
  'PI_TASK_CHECKPOINT_RECEIPT_LIMIT',
  'PI_TASK_DIAGNOSTIC_LIMIT',
  'PI_TASK_EVENT_V2_SCHEMA',
  'PI_TASK_EVENT_VERSION',
  'PI_TASK_LEGACY_FORCED_COMPLETION_CODE',
  'PI_TASK_PUBLIC_API_VERSION',
  'PI_TASK_SCHEMA_FINGERPRINT',
  'PI_TASK_STATE_EVENT_V2_SCHEMA',
  'PI_TASK_STATE_EVENT_VERSION',
  'PI_TASKS_UPSTREAM_ENTRY_SHA256',
  'PI_TASKS_UPSTREAM_REDUCER_SHA256',
  'TASK_STATE_EVENT',
  'TASK_WIDGET_ID',
  'UPSTREAM_PI_TASKS_VERSION',
  'createTaskRuntimeStore',
  'default',
  'replayBranchEntries',
  'snapshotState',
].sort();
const EXPECTED_TASK_RUNTIME_EXPORTS = [
  'DEFAULT_SANITIZE_LIMITS',
  'PI_TASK_COMPATIBILITY_REQUIREMENTS',
  'PI_TASK_CONTRACT_VERSION',
  'PI_TASK_AGENT_TOOL_NAMES',
  'PI_TASK_READ_ONLY_TOOL_NAMES',
  'PI_TASK_SESSION_HOST_COMPATIBILITY',
  'PI_TASK_SNAPSHOT_VERSION',
  'PI_TASK_STATE_EVENT_NAME',
  'PI_TASK_STATE_EVENT_VERSION',
  'PI_TASK_TOOL_NAMES',
  'assertAllowedPiTaskTool',
  'assertPiTaskCompatibility',
  'createBoundedPiTaskSnapshot',
  'createPiTaskCompatibilityGuard',
  'createPiTaskRuntimeBridge',
  'createPiTaskSessionHost',
  'evaluatePiTaskCompatibility',
  'isAllowedPiTaskTool',
  'mapPiTaskRuntimeError',
  'normalizePiTaskCommand',
  'sanitizeTaskRuntimeValue',
  'stableJsonHash',
  'stableJsonStringify',
].sort();
const EXPECTED_TASK_TOOLS = [
  'task_checkpoint',
  'task_complete',
  'task_decision',
  'task_decompose',
  'task_evidence',
  'task_focus',
  'task_granularity_check',
  'task_list',
  'task_next',
  'task_plan',
  'task_resume',
  'task_update',
];
const TASK_PACKAGE_FILES = [
  'LICENSE',
  'README.md',
  'UPSTREAM.md',
  'index.d.ts',
  'index.js',
  'package.json',
  'src/commands.d.ts',
  'src/commands.js',
  'src/contracts.d.ts',
  'src/contracts.js',
  'src/ids.d.ts',
  'src/ids.js',
  'src/model.d.ts',
  'src/model.js',
  'src/pi-types.d.ts',
  'src/pi-types.js',
  'src/reducer.d.ts',
  'src/reducer.js',
  'src/render.d.ts',
  'src/render.js',
  'src/schema.d.ts',
  'src/schema.js',
  'src/state-events.d.ts',
  'src/state-events.js',
  'src/store.d.ts',
  'src/store.js',
  'src/tools.d.ts',
  'src/tools.js',
  'src/widget.d.ts',
  'src/widget.js',
  'upstream/index.js',
  'upstream/reducer.js',
];

function sortStrings(values) {
  return [...values].sort();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fingerprintFiles(packageDir) {
  const manifest = TASK_PACKAGE_FILES.map((file) => {
    const filePath = path.join(packageDir, file);
    assert.equal(fs.existsSync(filePath), true, `controlled package file missing: ${file}`);
    return `${sha256(fs.readFileSync(filePath))}  ${file}\n`;
  }).join('');
  return sha256(manifest);
}

function readRepositoryEvidence() {
  const packageDir = path.join(__dirname, '..');
  const repositoryDir = path.join(packageDir, '..', '..');
  const manifestPath = path.join(packageDir, 'package.json');
  const rootManifestPath = path.join(repositoryDir, 'package.json');
  const lockfilePath = path.join(repositoryDir, 'pnpm-lock.yaml');
  const controlledPackageDir = path.join(repositoryDir, 'packages', 'pi-tasks');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rootManifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf8'));
  const lockfileText = fs.readFileSync(lockfilePath, 'utf8');
  const controlledManifest = JSON.parse(
    fs.readFileSync(path.join(controlledPackageDir, 'package.json'), 'utf8'),
  );

  assert.equal(rootManifest.packageManager, 'pnpm@9.15.9');
  assert.equal(manifest.name, '@originos/pi-agent-adapter');
  assert.equal(manifest.version, ADAPTER_VERSION);
  assert.equal(manifest.dependencies[CONTROLLED_TASK_PACKAGE], 'workspace:0.2.0-originos.1');
  assert.equal(Object.hasOwn(manifest.dependencies, 'pi-tasks'), false);
  assert.equal(controlledManifest.name, CONTROLLED_TASK_PACKAGE);
  assert.equal(controlledManifest.version, CONTROLLED_TASK_VERSION);
  assert.deepEqual(controlledManifest.dependencies || {}, {});
  assert.match(
    lockfileText,
    /'@originos\/pi-tasks':\s*\n\s+specifier: workspace:0\.2\.0-originos\.1\s*\n\s+version: link:\.\.\/pi-tasks/,
  );
  assert.match(lockfileText, /\n\s+packages\/pi-tasks:\s*\n/);
  assert.equal(/\n\s+pi-tasks@0\.2\.0:/.test(lockfileText), false);

  const patchHashes = RUNTIME_PATCHES.map((patch) => {
    const actualSha256 = sha256(fs.readFileSync(path.join(repositoryDir, patch.file)));
    assert.equal(actualSha256, patch.sha256, `${patch.name} patch hash mismatch`);
    return { ...patch, actualSha256 };
  });
  const patchManifest = patchHashes
    .map((patch) => `${patch.name.endsWith('pi-agent-core') ? 'core' : 'coding-agent'}:${patch.actualSha256}\n`)
    .join('');
  assert.equal(sha256(patchManifest), RUNTIME_PATCH_SET_SHA256);
  assert.equal(fingerprintFiles(controlledPackageDir), TASK_PACKAGE_FINGERPRINT);

  return {
    adapter: { name: manifest.name, version: manifest.version },
    controlledTaskPackage: {
      fileCount: TASK_PACKAGE_FILES.length,
      fingerprint: TASK_PACKAGE_FINGERPRINT,
      runtimeDependencies: [],
      version: controlledManifest.version,
    },
    lockfile: { sha256: sha256(lockfileText) },
    packageManager: rootManifest.packageManager,
    runtimePatchSet: {
      fingerprint: RUNTIME_PATCH_SET_SHA256,
      patches: patchHashes,
      version: 1,
    },
  };
}

function createExtensionProbe() {
  const commands = new Map();
  const emittedEvents = [];
  const handlers = new Map();
  const tools = new Map();
  const api = {
    appendEntry() {},
    events: {
      emit(name, payload) {
        emittedEvents.push({ name, payload });
      },
    },
    on(name, handler) {
      const currentHandlers = handlers.get(name) ?? [];
      currentHandlers.push(handler);
      handlers.set(name, currentHandlers);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  };
  const context = {
    cwd: process.cwd(),
    hasUI: false,
    sessionManager: {
      getBranch() {
        return [];
      },
      getSessionId() {
        return 'audit-session';
      },
    },
    ui: {
      notify() {},
      setStatus() {},
      setWidget() {},
    },
  };
  return { api, commands, context, emittedEvents, handlers, tools };
}

async function emitLifecycle(probe, name) {
  for (const handler of probe.handlers.get(name) ?? []) {
    await handler({}, probe.context);
  }
}

function inspectStateEvents(piTasks, probe) {
  const stateEvents = probe.emittedEvents.filter(
    ({ name }) => name === piTasks.TASK_STATE_EVENT,
  );
  assert.equal(stateEvents.length, 2);
  for (const { payload } of stateEvents) {
    assert.equal(payload.version, 2);
    assert.equal(payload.widgetId, 'pi-tasks');
    assert.equal(payload.scope.sessionId, 'audit-session');
    assert.equal(payload.scope.revision, 0);
    assert.equal(payload.scope.cursor, null);
    assert.match(payload.stateHash, /^[a-f0-9]{64}$/);
  }
  return {
    eventName: piTasks.TASK_STATE_EVENT,
    observedReasons: sortStrings(stateEvents.map(({ payload }) => payload.reason)),
    schemaId: piTasks.PI_TASK_STATE_EVENT_V2_SCHEMA.$id,
    version: piTasks.PI_TASK_STATE_EVENT_VERSION,
  };
}

async function runAudit() {
  const repository = readRepositoryEvidence();
  const piTasks = await import(CONTROLLED_TASK_PACKAGE);
  const taskRuntime = require('@originos/pi-agent-adapter/task-runtime');
  const runtimeCore = await import('@earendil-works/pi-agent-core');
  const runtimeHost = await import('@earendil-works/pi-coding-agent');

  assert.deepEqual(sortStrings(Object.keys(piTasks)), EXPECTED_TASK_EXPORTS);
  assert.deepEqual(sortStrings(Object.keys(taskRuntime)), EXPECTED_TASK_RUNTIME_EXPORTS);
  assert.equal(typeof piTasks.default, 'function');
  assert.equal(typeof piTasks.createTaskRuntimeStore, 'function');
  assert.equal(typeof piTasks.replayBranchEntries, 'function');
  assert.equal(typeof runtimeCore.invokeRegisteredToolCall, 'function');
  assert.equal(typeof runtimeHost.AgentSession.prototype.invokeRegisteredTool, 'function');
  assert.equal(piTasks.ORIGINOS_PI_TASKS_VERSION, CONTROLLED_TASK_VERSION);
  assert.equal(piTasks.UPSTREAM_PI_TASKS_VERSION, '0.2.0');
  assert.equal(piTasks.PI_TASK_PUBLIC_API_VERSION, 1);
  assert.equal(piTasks.PI_TASK_EVENT_VERSION, 2);
  assert.equal(piTasks.PI_TASK_STATE_EVENT_VERSION, 2);
  assert.equal(piTasks.PI_TASK_SCHEMA_FINGERPRINT, TASK_SCHEMA_FINGERPRINT);
  assert.equal(piTasks.PI_TASK_EVENT_V2_SCHEMA.$id, 'originos.pi-tasks.event-envelope.v2');
  assert.equal(piTasks.PI_TASK_STATE_EVENT_V2_SCHEMA.$id, 'originos.pi-tasks.state-event.v2');
  assert.deepEqual(taskRuntime.PI_TASK_COMPATIBILITY_REQUIREMENTS, {
    adapterContractVersion: 1,
    runtimePackage: '@earendil-works/pi-coding-agent',
    runtimeVersion: '0.80.10',
    runtimeHostInvokeContractVersion: 1,
    taskExtensionPackage: CONTROLLED_TASK_PACKAGE,
    taskExtensionVersion: CONTROLLED_TASK_VERSION,
    taskExtensionContractVersion: 2,
    taskLedgerEventVersion: 2,
    taskStateEventVersion: 2,
  });

  const probe = createExtensionProbe();
  piTasks.default(probe.api);
  assert.deepEqual(sortStrings(probe.tools.keys()), EXPECTED_TASK_TOOLS);
  assert.deepEqual(sortStrings(probe.commands.keys()), ['tasks']);
  await emitLifecycle(probe, 'session_start');
  await emitLifecycle(probe, 'session_tree');

  const report = {
    auditSchemaVersion: 2,
    adapter: {
      contractVersion: taskRuntime.PI_TASK_CONTRACT_VERSION,
      publicExports: sortStrings(Object.keys(taskRuntime)),
    },
    capabilities: {
      hostToolInvocation: { result: 'supported' },
      publicMutationCommandApi: { result: 'supported' },
      stableRevision: { result: 'supported' },
    },
    piTasks: {
      commands: sortStrings(probe.commands.keys()),
      eventSchemaId: piTasks.PI_TASK_EVENT_V2_SCHEMA.$id,
      publicExports: sortStrings(Object.keys(piTasks)),
      schemaFingerprint: piTasks.PI_TASK_SCHEMA_FINGERPRINT,
      stateEvent: inspectStateEvents(piTasks, probe),
      tools: sortStrings(probe.tools.keys()),
    },
    repository,
    runtime: {
      coreHostInvoke: 'invokeRegisteredToolCall',
      sessionHostInvoke: 'AgentSession.invokeRegisteredTool',
    },
  };
  return { ...report, reportSha256: sha256(JSON.stringify(report)) };
}

async function main() {
  const report = await runAudit();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log(
    `[pi-task-runtime-audit] verified ${CONTROLLED_TASK_PACKAGE}@${CONTROLLED_TASK_VERSION} (${report.reportSha256})`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[pi-task-runtime-audit] failed', error);
    process.exitCode = 1;
  });
}

module.exports = {
  CONTROLLED_TASK_PACKAGE,
  CONTROLLED_TASK_VERSION,
  EXPECTED_TASK_EXPORTS,
  EXPECTED_TASK_RUNTIME_EXPORTS,
  RUNTIME_PATCHES,
  RUNTIME_PATCH_SET_SHA256,
  TASK_PACKAGE_FILES,
  TASK_PACKAGE_FINGERPRINT,
  runAudit,
};
