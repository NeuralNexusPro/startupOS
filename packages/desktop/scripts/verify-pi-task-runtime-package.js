#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const asar = require('@electron/asar');

const ADAPTER_PACKAGE = '@originos/pi-agent-adapter';
const ADAPTER_VERSION = '0.80.10';
const TASK_RUNTIME_EXPORT = '@originos/pi-agent-adapter/task-runtime';
const CONTROLLED_TASK_PACKAGE = '@originos/pi-tasks';
const CONTROLLED_TASK_VERSION = '0.2.0-originos.1';
const TASK_PACKAGE_FINGERPRINT =
  '4a80ab2874d1e39a6cf981f8c4baacddb8121dad4d853d8568b30cdcaf007d28';
const TASK_SCHEMA_FINGERPRINT =
  'originos-pi-tasks/v1:event-v2:cas:receipt:evidence-gate-no-force';
const PATCH_SET_FINGERPRINT =
  '213b1f2db610720ca0dde1853abbe02975185ad37c95eb517031844631371674';
const RUNTIME_PATCHES = [
  {
    label: 'core',
    packageName: '@earendil-works/pi-agent-core',
    file: 'patches/@earendil-works__pi-agent-core@0.80.10.patch',
    sha256: '10bda90bbb3ff426f6057312464e2cdb470fe61acd4f9e37ffc8436755e644a6',
  },
  {
    label: 'coding-agent',
    packageName: '@earendil-works/pi-coding-agent',
    file: 'patches/@earendil-works__pi-coding-agent@0.80.10.patch',
    sha256: '7d70e7b71db29280df41ddf1f8701c9ae56c98e9e48b85ee11700c4ca66c11b4',
  },
];
// electron-builder intentionally prunes documentation and TypeScript declarations and may
// normalize package manifests for production dependencies. Fingerprint executable files only;
// the manifest version, public exports, and loaded runtime contract are verified separately.
const TASK_PACKAGE_RUNTIME_FILES = [
  'index.js', 'src/commands.js', 'src/contracts.js', 'src/ids.js', 'src/model.js',
  'src/pi-types.js', 'src/reducer.js', 'src/render.js', 'src/schema.js',
  'src/state-events.js', 'src/store.js', 'src/tools.js', 'src/widget.js',
  'upstream/index.js', 'upstream/reducer.js',
];
const EXPECTED_TASK_RUNTIME_EXPORTS = [
  'DEFAULT_SANITIZE_LIMITS', 'PI_TASK_AGENT_TOOL_NAMES',
  'PI_TASK_COMPATIBILITY_REQUIREMENTS',
  'PI_TASK_CONTRACT_VERSION', 'PI_TASK_SNAPSHOT_VERSION', 'PI_TASK_STATE_EVENT_NAME',
  'PI_TASK_STATE_EVENT_VERSION', 'PI_TASK_READ_ONLY_TOOL_NAMES',
  'PI_TASK_SESSION_HOST_COMPATIBILITY', 'PI_TASK_TOOL_NAMES', 'assertAllowedPiTaskTool',
  'assertPiTaskCompatibility', 'createBoundedPiTaskSnapshot',
  'createPiTaskCompatibilityGuard', 'createPiTaskRuntimeBridge',
  'createPiTaskSessionHost',
  'evaluatePiTaskCompatibility', 'isAllowedPiTaskTool', 'mapPiTaskRuntimeError',
  'normalizePiTaskCommand', 'sanitizeTaskRuntimeValue', 'stableJsonHash',
  'stableJsonStringify',
].sort();
const MAX_ERROR_MESSAGE_LENGTH = 240;

class PiTaskRuntimeVerificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PiTaskRuntimeVerificationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new PiTaskRuntimeVerificationError(code, message, details);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256TextFile(filePath) {
  const normalizedText = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  return sha256(normalizedText);
}

function packageNameParts(packageName) {
  return packageName.startsWith('@') ? packageName.split('/').slice(0, 2) : [packageName];
}

function readPackageJson(packageJsonPath, packageName) {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return fail('PACKAGE_INVALID', `Runtime package metadata is invalid: ${packageName}`, {
      module: packageName,
    });
  }
}

function findPackageJson(packageName, fromRequire) {
  for (const lookupPath of fromRequire.resolve.paths(packageName) || []) {
    const candidate = path.join(lookupPath, ...packageNameParts(packageName), 'package.json');
    if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
  }
  return fail('MODULE_MISSING', `Required runtime module is missing: ${packageName}`, {
    module: packageName,
  });
}

function isPathWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRuntimePath(targetPath, label) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return fail('LAYOUT_INVALID', `Runtime ${label} cannot be resolved`, {
      targetPath,
    });
  }
}

function removeTemporaryDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.warn(
      `[verify-pi-task-runtime-package] temporary cleanup skipped: ${String(error?.code || 'unknown')}`,
    );
  }
}

function assertRuntimeResolutionBoundary(packageJsonPath, baseDir, repositoryRoot, source) {
  const resolvedBaseDir = resolveRuntimePath(baseDir, 'layout root');
  const resolvedRepositoryRoot = resolveRuntimePath(repositoryRoot, 'repository root');
  const resolvedPackageJsonPath = resolveRuntimePath(packageJsonPath, 'package path');
  const developmentRoot = source === 'development' && isPathWithin(resolvedRepositoryRoot, resolvedBaseDir)
    ? resolvedRepositoryRoot
    : resolvedBaseDir;
  if (!isPathWithin(developmentRoot, resolvedPackageJsonPath)) {
    fail('MODULE_OUTSIDE_LAYOUT', 'Runtime dependency resolved outside the verified layout', {
      modulePath: resolvedPackageJsonPath,
      source,
    });
  }
}

function assertVersion(packageName, actualVersion, expectedVersion) {
  if (actualVersion !== expectedVersion) {
    fail('VERSION_MISMATCH', `Runtime package version mismatch: ${packageName}`, {
      module: packageName,
      expectedVersion,
      actualVersion: actualVersion || 'missing',
    });
  }
}

function verifyPatchSet(repositoryRoot) {
  const patches = RUNTIME_PATCHES.map((patch) => {
    const patchPath = path.join(repositoryRoot, patch.file);
    if (!fs.existsSync(patchPath)) {
      fail('PATCH_MISSING', `Required runtime patch is missing: ${patch.packageName}`, {
        module: patch.packageName,
      });
    }
    const actual = sha256TextFile(patchPath);
    if (actual !== patch.sha256) {
      fail('PATCH_MISMATCH', `Runtime patch hash mismatch: ${patch.packageName}`, {
        module: patch.packageName,
        expectedSha256: patch.sha256,
        actualSha256: actual,
      });
    }
    return { ...patch, actualSha256: actual };
  });
  const composite = sha256(patches.map((patch) => `${patch.label}:${patch.actualSha256}\n`).join(''));
  if (composite !== PATCH_SET_FINGERPRINT) {
    fail('PATCH_SET_MISMATCH', 'Runtime patch set fingerprint mismatch');
  }
  return { fingerprint: composite, patches };
}

function verifyDependencyClosure(packageJsonPath, baseDir, repositoryRoot, source) {
  const queue = [packageJsonPath];
  const visited = new Set();
  const resolved = [];
  while (queue.length > 0) {
    const currentPath = fs.realpathSync(queue.shift());
    if (visited.has(currentPath)) continue;
    visited.add(currentPath);
    const manifest = readPackageJson(currentPath, currentPath);
    const packageRequire = createRequire(currentPath);
    const requiredDependencies = Object.keys(manifest.dependencies || {}).sort();
    const optionalDependencies = Object.keys(manifest.optionalDependencies || {})
      .filter((dependency) => !requiredDependencies.includes(dependency))
      .sort();
    for (const dependency of [...requiredDependencies, ...optionalDependencies]) {
      let dependencyPath;
      try {
        dependencyPath = findPackageJson(dependency, packageRequire);
      } catch (error) {
        if (
          optionalDependencies.includes(dependency) &&
          error instanceof PiTaskRuntimeVerificationError &&
          error.code === 'MODULE_MISSING'
        ) {
          resolved.push(`${manifest.name}->${dependency}@optional-not-installed`);
          continue;
        }
        throw error;
      }
      assertRuntimeResolutionBoundary(dependencyPath, baseDir, repositoryRoot, source);
      resolved.push(`${manifest.name}->${dependency}@${readPackageJson(dependencyPath, dependency).version}`);
      queue.push(dependencyPath);
    }
  }
  return [...new Set(resolved)].sort();
}

function verifyTaskPackageFingerprint(packageJsonPath) {
  const packageDir = path.dirname(packageJsonPath);
  const manifest = TASK_PACKAGE_RUNTIME_FILES.map((file) => {
    const filePath = path.join(packageDir, file);
    if (!fs.existsSync(filePath)) {
      fail('PACKAGE_FINGERPRINT_MISMATCH', `Controlled Task package file is missing: ${file}`);
    }
    return `${sha256TextFile(filePath)}  ${file}\n`;
  }).join('');
  const actual = sha256(manifest);
  if (actual !== TASK_PACKAGE_FINGERPRINT) {
    fail('PACKAGE_FINGERPRINT_MISMATCH', 'Controlled Task package fingerprint mismatch', {
      expectedSha256: TASK_PACKAGE_FINGERPRINT,
      actualSha256: actual,
    });
  }
  return actual;
}

function assertTaskRuntime(taskRuntime) {
  const exports = Object.keys(taskRuntime).sort();
  if (JSON.stringify(exports) !== JSON.stringify(EXPECTED_TASK_RUNTIME_EXPORTS)) {
    fail('EXPORT_MISMATCH', `Runtime package export mismatch: ${TASK_RUNTIME_EXPORT}`, {
      module: TASK_RUNTIME_EXPORT,
      actualExports: exports,
    });
  }
  const requirements = taskRuntime.PI_TASK_COMPATIBILITY_REQUIREMENTS;
  if (
    taskRuntime.PI_TASK_CONTRACT_VERSION !== 1 ||
    taskRuntime.PI_TASK_STATE_EVENT_NAME !== 'pi-tasks:state' ||
    taskRuntime.PI_TASK_STATE_EVENT_VERSION !== 2 ||
    requirements?.runtimeVersion !== '0.80.10' ||
    requirements?.taskExtensionPackage !== CONTROLLED_TASK_PACKAGE ||
    requirements?.taskExtensionVersion !== CONTROLLED_TASK_VERSION ||
    requirements?.taskLedgerEventVersion !== 2 ||
    requirements?.taskStateEventVersion !== 2
  ) {
    fail('CONTRACT_MISMATCH', 'Task Runtime adapter compatibility contract mismatch');
  }
  return exports;
}

function assertControlledTaskExports(runtime) {
  if (
    typeof runtime.default !== 'function' ||
    typeof runtime.createTaskRuntimeStore !== 'function' ||
    typeof runtime.replayBranchEntries !== 'function' ||
    runtime.ORIGINOS_PI_TASKS_VERSION !== CONTROLLED_TASK_VERSION ||
    runtime.UPSTREAM_PI_TASKS_VERSION !== '0.2.0' ||
    runtime.PI_TASK_PUBLIC_API_VERSION !== 1 ||
    runtime.PI_TASK_EVENT_VERSION !== 2 ||
    runtime.PI_TASK_STATE_EVENT_VERSION !== 2 ||
    runtime.TASK_STATE_EVENT !== 'pi-tasks:state' ||
    runtime.PI_TASK_SCHEMA_FINGERPRINT !== TASK_SCHEMA_FINGERPRINT ||
    runtime.PI_TASK_EVENT_V2_SCHEMA?.$id !== 'originos.pi-tasks.event-envelope.v2' ||
    runtime.PI_TASK_STATE_EVENT_V2_SCHEMA?.$id !== 'originos.pi-tasks.state-event.v2'
  ) {
    fail('CONTRACT_MISMATCH', `Controlled Task package contract mismatch: ${CONTROLLED_TASK_PACKAGE}`);
  }
  return Object.keys(runtime).sort();
}

async function importFromPackage(packageName, packageJsonPath) {
  try {
    const manifest = readPackageJson(packageJsonPath, packageName);
    const rootExport = manifest.exports?.['.'] ?? manifest.exports;
    const entry = typeof rootExport === 'string'
      ? rootExport
      : rootExport?.import ?? rootExport?.default ?? rootExport?.require ?? manifest.module ?? manifest.main;
    if (typeof entry !== 'string') {
      fail('EXPORT_MISMATCH', `Runtime package has no public root export: ${packageName}`);
    }
    return await import(pathToFileURL(path.resolve(path.dirname(packageJsonPath), entry)).href);
  } catch {
    return fail('ESM_LOAD_FAILED', `ESM runtime load failed: ${packageName}`, {
      module: packageName,
      packageJsonPath,
    });
  }
}

async function verifyRuntimeLayout(options) {
  const {
    baseDir,
    repositoryRoot = path.resolve(__dirname, '..', '..', '..'),
    source = 'development',
    platform = `${process.platform}-${process.arch}`,
  } = options;
  const resolvedBaseDir = resolveRuntimePath(baseDir, 'layout root');
  const resolvedRepositoryRoot = resolveRuntimePath(repositoryRoot, 'repository root');
  const basePackageJson = path.join(resolvedBaseDir, 'package.json');
  if (!fs.existsSync(basePackageJson)) fail('LAYOUT_INVALID', 'Runtime layout does not contain package.json');
  const baseRequire = createRequire(basePackageJson);
  const adapterPackageJsonPath = findPackageJson(ADAPTER_PACKAGE, baseRequire);
  assertRuntimeResolutionBoundary(adapterPackageJsonPath, resolvedBaseDir, resolvedRepositoryRoot, source);
  const adapterManifest = readPackageJson(adapterPackageJsonPath, ADAPTER_PACKAGE);
  assertVersion(ADAPTER_PACKAGE, adapterManifest.version, ADAPTER_VERSION);
  if (!adapterManifest.exports?.['./task-runtime']) {
    fail('EXPORT_MISMATCH', `Public package subpath is missing: ${TASK_RUNTIME_EXPORT}`);
  }

  let adapter;
  let taskRuntime;
  try {
    adapter = baseRequire(ADAPTER_PACKAGE);
    taskRuntime = baseRequire(TASK_RUNTIME_EXPORT);
  } catch {
    return fail('CJS_LOAD_FAILED', `CJS runtime load failed: ${ADAPTER_PACKAGE}`);
  }
  if (typeof adapter.Agent !== 'function') fail('EXPORT_MISMATCH', `Runtime package export mismatch: ${ADAPTER_PACKAGE}`);
  const taskRuntimeExports = assertTaskRuntime(taskRuntime);

  const adapterRequire = createRequire(adapterPackageJsonPath);
  const controlledPackageJsonPath = findPackageJson(CONTROLLED_TASK_PACKAGE, adapterRequire);
  assertRuntimeResolutionBoundary(controlledPackageJsonPath, resolvedBaseDir, resolvedRepositoryRoot, source);
  const controlledManifest = readPackageJson(controlledPackageJsonPath, CONTROLLED_TASK_PACKAGE);
  assertVersion(CONTROLLED_TASK_PACKAGE, controlledManifest.version, CONTROLLED_TASK_VERSION);
  const controlledRuntime = await importFromPackage(
    CONTROLLED_TASK_PACKAGE,
    controlledPackageJsonPath,
  );
  const controlledExports = assertControlledTaskExports(controlledRuntime);
  const patchSet = verifyPatchSet(repositoryRoot);
  const dependencyClosure = verifyDependencyClosure(
    adapterPackageJsonPath,
    resolvedBaseDir,
    resolvedRepositoryRoot,
    source,
  );
  const packageFingerprint = verifyTaskPackageFingerprint(controlledPackageJsonPath);

  const runtimeCore = await importFromPackage(
    '@earendil-works/pi-agent-core',
    findPackageJson('@earendil-works/pi-agent-core', adapterRequire),
  );
  const runtimeHost = await importFromPackage(
    '@earendil-works/pi-coding-agent',
    findPackageJson('@earendil-works/pi-coding-agent', adapterRequire),
  );
  if (
    typeof runtimeCore.invokeRegisteredToolCall !== 'function' ||
    typeof runtimeHost.AgentSession?.prototype.invokeRegisteredTool !== 'function'
  ) {
    fail('PATCH_CONTRACT_MISSING', 'Installed Runtime packages do not expose both patched host APIs');
  }

  const report = {
    schemaVersion: 2,
    source,
    platform,
    result: 'passed',
    adapter: { version: ADAPTER_VERSION, publicExport: TASK_RUNTIME_EXPORT, exports: taskRuntimeExports },
    controlledTaskPackage: {
      version: CONTROLLED_TASK_VERSION,
      exports: controlledExports,
      fingerprint: packageFingerprint,
      eventVersion: 2,
      stateEventVersion: 2,
    },
    runtimePatchSet: { version: 1, fingerprint: patchSet.fingerprint },
    transitiveDependencies: {
      count: dependencyClosure.length,
      sha256: sha256(`${dependencyClosure.join('\n')}\n`),
    },
  };
  return { ...report, hash: sha256(JSON.stringify(report)) };
}

function normalizeAsarEntry(entry) {
  const normalized = entry.replace(/^(?:pack|unpack)\s*:\s*/, '').replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized.slice(1) : normalized;
}

async function verifyAsarRuntime(options) {
  const { asarPath, platform, repositoryRoot } = options;
  if (!fs.existsSync(asarPath)) fail('ASAR_MISSING', 'Packaged runtime ASAR is missing');
  const entries = new Set(asar.listPackage(asarPath, { isPack: true }).map(normalizeAsarEntry));
  const nestedTaskDependency = [...entries].find((entry) => {
    const segments = entry.toLowerCase().split('/');
    return segments[0] === 'node_modules' &&
      segments[1] === '@originos' &&
      segments[2] === 'pi-tasks' &&
      segments.slice(3).includes('node_modules');
  });
  if (nestedTaskDependency) {
    fail('LAYOUT_INVALID', 'Packaged Task Runtime contains nested workspace dependencies', {
      entry: nestedTaskDependency,
    });
  }
  for (const entry of [
    'node_modules/@originos/pi-agent-adapter/package.json',
    'node_modules/@originos/pi-agent-adapter/task-runtime.js',
    'node_modules/@originos/pi-agent-adapter/dist/task-runtime.cjs',
    'node_modules/@originos/pi-tasks/package.json',
    'node_modules/@earendil-works/pi-agent-core/package.json',
    'node_modules/@earendil-works/pi-coding-agent/package.json',
  ]) {
    if (!entries.has(entry)) fail('MODULE_MISSING', `Packaged runtime module is missing: ${entry}`, { entry });
  }
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-pi-task-package-'));
  try {
    asar.extractAll(asarPath, extractDir);
    return await verifyRuntimeLayout({
      baseDir: extractDir,
      repositoryRoot,
      source: 'asar',
      platform,
    });
  } finally {
    removeTemporaryDirectory(extractDir);
  }
}

function boundedFailure(error) {
  const known = error instanceof PiTaskRuntimeVerificationError;
  return {
    schemaVersion: 2,
    result: 'failed',
    code: known ? error.code : 'UNEXPECTED_ERROR',
    message: (known ? error.message : 'Unexpected runtime verification failure').slice(0, MAX_ERROR_MESSAGE_LENGTH),
    details: known ? error.details : {},
  };
}

function parseArguments(argv) {
  const options = { mode: 'development', platform: `${process.platform}-${process.arch}` };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--development') options.mode = 'development';
    else if (argument === '--asar') {
      options.mode = 'asar';
      options.asarPath = path.resolve(argv[++index] || '');
    } else if (argument === '--platform') options.platform = argv[++index] || options.platform;
    else fail('ARGUMENT_INVALID', `Unknown verification argument: ${argument.slice(0, 80)}`);
  }
  if (options.mode === 'asar' && !options.asarPath) fail('ARGUMENT_INVALID', '--asar requires a path');
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const report = options.mode === 'asar'
    ? await verifyAsarRuntime(options)
    : await verifyRuntimeLayout({
        baseDir: path.resolve(__dirname, '..'),
        source: 'development',
        platform: options.platform,
      });
  console.log(`[verify-pi-task-runtime-package] ${JSON.stringify(report)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[verify-pi-task-runtime-package] ${JSON.stringify(boundedFailure(error))}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ADAPTER_PACKAGE,
  ADAPTER_VERSION,
  assertRuntimeResolutionBoundary,
  CONTROLLED_TASK_PACKAGE,
  CONTROLLED_TASK_VERSION,
  PiTaskRuntimeVerificationError,
  boundedFailure,
  verifyAsarRuntime,
  verifyRuntimeLayout,
};
