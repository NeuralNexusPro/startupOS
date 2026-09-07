#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const asar = require('@electron/asar');
const {
  verifyAsarRuntime: verifyPiTaskAsarRuntime,
} = require('./verify-pi-task-runtime-package.js');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const releaseDir = path.join(repoRoot, 'release');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const resourcesDir = path.join(unpackedDir, 'resources');
const asarPath = path.join(resourcesDir, 'app.asar');
const desktopPackage = require(path.join(desktopDir, 'package.json'));
const zipPath = process.env.WINDOWS_ZIP_PATH
  ? path.resolve(process.env.WINDOWS_ZIP_PATH)
  : path.join(releaseDir, `OriginOS CE-${desktopPackage.version}-x64.zip`);
const verifyAsarRequiresScript = path.join(desktopDir, 'scripts', 'verify-asar-relative-requires.js');
const bundledSkillEntries = fs
  .readdirSync(path.join(repoRoot, 'templates', 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `templates/skills/${entry.name}/SKILL.md`)
  .filter((entry) => fs.existsSync(path.join(repoRoot, entry)));
const piAiRuntimeDependencies = [
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

function fail(message) {
  console.error(`[verify-windows-package] ${message}`);
  process.exitCode = 1;
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function requireFile(filePath) {
  if (!exists(filePath)) {
    fail(`missing required file: ${path.relative(repoRoot, filePath)}`);
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function verifyPiAiProviderImports(smokeDir) {
  const script = [
    "const { createRequire } = require('node:module');",
    "const { pathToFileURL } = require('node:url');",
    "const req = createRequire(process.cwd() + '/package.json');",
    `const deps = ${JSON.stringify(piAiRuntimeDependencies)};`,
    "(async () => {",
    "  for (const dep of deps) {",
    "    const entry = req.resolve(dep);",
    "    await import(pathToFileURL(entry).href);",
    "  }",
    "})().catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});",
  ].join('\n');

  run(process.execPath, ['-e', script], {
    cwd: smokeDir,
    env: {
      ...process.env,
      NODE_OPTIONS: '',
    },
  });
}

function normalizeAsarEntry(entry) {
  const normalized = entry
    .replace(/^(?:pack|unpack)\s*:\s*/, '')
    .replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized.slice(1) : normalized;
}

async function verifyAsar() {
  requireFile(asarPath);
  if (process.exitCode) return;

  const entries = asar.listPackage(asarPath, { isPack: true }).map(normalizeAsarEntry);
  const requiredEntries = [
    'dist-electron/core/src/lib/paths.js',
    'dist-electron/core/src/lib/integrations/pi-agent/display-content.js',
    'dist-electron/core/src/lib/integrations/pi-agent/core/agent.js',
    'dist-electron/core/src/lib/integrations/pi-agent/tools/index.js',
    'dist-electron/core/src/lib/integrations/pi-agent/tools/loop-detector.js',
    'dist-electron/core/src/lib/integrations/pi-agent/tools/schedule-tools.js',
    'dist-electron/core/src/lib/features/skills/service.js',
    'dist-electron/core/src/lib/features/services/launcher/skill.js',
    'dist-electron/core/src/lib/integrations/electron/workspace-paths.js',
    'dist-electron/desktop/src/main/services/workspace-service.js',
    'dist-electron/desktop/src/main/services/entry-export-service.js',
    'dist-electron/desktop/src/main/main.js',
    'node_modules/@originos/pi-agent-adapter/index.js',
    'node_modules/@originos/pi-agent-adapter/ai.js',
    'node_modules/@originos/pi-agent-adapter/goal.js',
    'node_modules/@originos/pi-agent-adapter/dist/index.cjs',
    'node_modules/@originos/pi-agent-adapter/dist/ai.cjs',
    'node_modules/@originos/pi-agent-adapter/dist/goal.cjs',
    'node_modules/archiver/index.js',
    ...piAiRuntimeDependencies.map((dependency) => `node_modules/${dependency}/package.json`),
  ];

  for (const entry of requiredEntries) {
    if (!entries.includes(entry)) {
      fail(`app.asar missing ${entry}`);
    }
  }
  if (process.exitCode) return;

  const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-win-asar-smoke-'));
  const modules = [
    'dist-electron/core/src/lib/integrations/pi-agent/core/agent.js',
    'dist-electron/core/src/lib/integrations/pi-agent/tools/loop-detector.js',
    'dist-electron/core/src/lib/integrations/pi-agent/tools/schedule-tools.js',
    'dist-electron/core/src/lib/features/skills/service.js',
    'dist-electron/core/src/lib/features/services/launcher/skill.js',
    'dist-electron/core/src/lib/integrations/electron/workspace-paths.js',
    'dist-electron/desktop/src/main/services/workspace-service.js',
    'dist-electron/desktop/src/main/services/entry-export-service.js',
  ];

  asar.extractAll(asarPath, smokeDir);

  const smokeRequire = createRequire(path.join(smokeDir, 'package.json'));
  for (const modulePath of modules) {
    smokeRequire.resolve(path.join(smokeDir, modulePath));
  }
  smokeRequire.resolve('@originos/pi-agent-adapter');
  const piAgentRuntime = smokeRequire('@originos/pi-agent-adapter');
  const piAiRuntime = smokeRequire('@originos/pi-agent-adapter/ai');
  const goalExtension = smokeRequire('@originos/pi-agent-adapter/goal');
  if (typeof piAgentRuntime.Agent !== 'function') {
    fail('pi-agent adapter does not expose Agent');
  }
  if (
    typeof piAiRuntime.streamSimple !== 'function' ||
    typeof piAiRuntime.completeSimple !== 'function'
  ) {
    fail('pi-agent AI adapter does not expose compatibility stream functions');
  }
  if (typeof goalExtension !== 'function') {
    fail('pi-agent goal adapter does not expose an extension function');
  }
  const archiverRuntime = smokeRequire('archiver');
  if (typeof archiverRuntime.ZipArchive !== 'function') {
    fail('archiver runtime does not expose ZipArchive');
  }
  for (const dependency of piAiRuntimeDependencies) {
    smokeRequire.resolve(dependency);
  }
  const launcherRuntimePath = path.join(
    smokeDir,
    'dist-electron/core/src/lib/features/services/launcher/skill.js',
  );
  const launcherRuntime = fs.readFileSync(launcherRuntimePath, 'utf8');
  if (!launcherRuntime.includes('getBundledSkillDirs')) {
    fail('SkillLauncher runtime does not scan all bundled skill directories');
  }
  const skillServiceRuntime = fs.readFileSync(
    path.join(smokeDir, 'dist-electron/core/src/lib/features/skills/service.js'),
    'utf8',
  );
  if (!skillServiceRuntime.includes('materializeBundledSkill')) {
    fail('SkillService runtime does not materialize bundled skills before content load');
  }
  if (!skillServiceRuntime.includes('loadSkillFromDirectory')) {
    fail('SkillService runtime does not load existing data skills by directory name');
  }
  const workspacePathsRuntime = smokeRequire(
    path.join(
      smokeDir,
      'dist-electron/core/src/lib/integrations/electron/workspace-paths.js',
    ),
  );
  const windowsDataRoot = 'C:\\Users\\admin\\AppData\\Roaming\\@originos\\desktop\\data';
  const resolvedAgentUploadDir = workspacePathsRuntime.resolveWorkspaceBasePath(
    'data/agents/release-smoke',
    {
      dataRoot: windowsDataRoot,
      monorepoRoot: 'K:\\originos\\OriginOS CE\\resources\\app.asar',
      pathImplementation: path.win32,
    },
  );
  if (resolvedAgentUploadDir !== `${windowsDataRoot}\\agents\\release-smoke`) {
    fail(`Workspace upload runtime resolved an invalid Windows path: ${resolvedAgentUploadDir}`);
  }
  verifyPiAiProviderImports(smokeDir);

  run(process.execPath, [verifyAsarRequiresScript], {
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      ORIGINOS_ASAR_PATH: asarPath,
    },
  });

  const piTaskReport = await verifyPiTaskAsarRuntime({
    asarPath,
    platform: 'windows-x64',
  });
  console.log('[verify-windows-package] pi task runtime ok', {
    hash: piTaskReport.hash,
    platform: piTaskReport.platform,
  });
  console.log('[verify-windows-package] app.asar module smoke ok');
}

function verifyResources() {
  const requiredFiles = [
    'web/packages/web/server.js',
    'web/packages/web/node_modules/next/dist/server/next.js',
    'web/packages/web/node_modules/styled-jsx/package.json',
    ...bundledSkillEntries,
    'agent-worker/agent-worker.mjs',
    'agent-worker/agent-worker-module-specifier.mjs',
    'agent-worker/core/lib/integrations/pi-agent/tools/loop-detector.js',
    'agent-worker/core/lib/integrations/pi-agent/tools/schedule-tools.js',
    'app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node',
    'app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll',
  ];

  for (const relativePath of requiredFiles) {
    requireFile(path.join(resourcesDir, relativePath));
  }

  console.log('[verify-windows-package] unpacked resources ok');
}

function verifyWindowsZip() {
  if (!exists(zipPath)) {
    console.warn(`[verify-windows-package] Windows zip not found, skipped: ${path.relative(repoRoot, zipPath)}`);
    return;
  }

  const names = listZipEntries(zipPath);
  const requiredSuffixes = [
    'resources/app.asar',
    'resources/web/packages/web/server.js',
    'resources/web/packages/web/node_modules/next/dist/server/next.js',
    'resources/web/packages/web/node_modules/styled-jsx/package.json',
    ...bundledSkillEntries.map((entry) => `resources/${entry}`),
    'resources/agent-worker/agent-worker.mjs',
    'resources/agent-worker/agent-worker-module-specifier.mjs',
    'resources/agent-worker/core/lib/integrations/pi-agent/tools/loop-detector.js',
    'resources/agent-worker/core/lib/integrations/pi-agent/tools/schedule-tools.js',
    'resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node',
    'resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll',
  ];
  const missing = requiredSuffixes.filter(
    (suffix) => !names.some((name) => name === suffix || name.endsWith(`/${suffix}`)),
  );
  if (missing.length > 0) {
    fail(`Windows zip missing ${missing.join(',')}`);
    return;
  }
  if (names.some((name) => name.includes('/.pnpm/'))) {
    fail('shortpath zip still contains .pnpm paths');
    return;
  }
  if (names.some((name) => name.startsWith('__MACOSX/'))) {
    fail('shortpath zip contains __MACOSX entries');
    return;
  }

  const longest = names.reduce((current, name) => (name.length > current.length ? name : current), '');
  console.log(`[verify-windows-package] Windows zip ok entries=${names.length} longest=${longest.length} ${longest}`);
}

function listZipEntries(filePath) {
  const buffer = fs.readFileSync(filePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > buffer.length) {
    throw new Error(`invalid ZIP central directory in ${path.relative(repoRoot, filePath)}`);
  }

  const names = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`invalid ZIP central directory header at offset ${offset}`);
    }
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    names.push(buffer.toString('utf8', fileNameStart, fileNameEnd).replace(/\\/g, '/'));
    offset = fileNameEnd + extraLength + commentLength;
  }

  return names;
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  throw new Error('ZIP end of central directory not found');
}

async function main() {
  await verifyAsar();
  verifyResources();
  verifyWindowsZip();

  if (!process.exitCode) {
    console.log('[verify-windows-package] verified Windows package runtime files');
  }
}

main().catch((error) => {
  console.error(
    '[verify-windows-package] failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
