#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const asar = require('@electron/asar');
const {
  verifyAsarRuntime: verifyPiTaskAsarRuntime,
} = require('./verify-pi-task-runtime-package.js');

const desktopDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopDir, '..', '..');
const releaseDir = path.join(repoRoot, 'release');
const productName = 'OriginOS CE.app';
const bundledSkillEntries = fs
  .readdirSync(path.join(repoRoot, 'templates', 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `templates/skills/${entry.name}/SKILL.md`)
  .filter((entry) => fs.existsSync(path.join(repoRoot, entry)));
const candidateAppPaths = [
  path.join(releaseDir, 'mac-arm64', productName),
  path.join(releaseDir, 'mac', productName),
];

function fail(message) {
  console.error(`[verify-mac-package] ${message}`);
  process.exitCode = 1;
}

function normalizeAsarEntry(entry) {
  const normalized = entry
    .replace(/^(?:pack|unpack)\s*:\s*/, '')
    .replace(/\\/g, '/');
  return normalized.startsWith('/') ? normalized.slice(1) : normalized;
}

async function verifyApp(appPath) {
  const resourcesDir = path.join(appPath, 'Contents', 'Resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  if (!fs.existsSync(asarPath)) {
    fail(`app.asar missing: ${path.relative(repoRoot, asarPath)}`);
    return;
  }

  const entries = asar.listPackage(asarPath, { isPack: true }).map(normalizeAsarEntry);
  const requiredEntries = [
    'dist-electron/core/src/lib/integrations/pi-agent/core/agent.js',
    'dist-electron/core/src/lib/features/skills/service.js',
    'dist-electron/core/src/lib/features/services/launcher/skill.js',
    'dist-electron/desktop/src/main/main.js',
    'dist-electron/desktop/src/main/services/entry-export-service.js',
    'node_modules/@originos/pi-agent-adapter/index.js',
    'node_modules/@originos/pi-agent-adapter/ai.js',
    'node_modules/@originos/pi-agent-adapter/goal.js',
    'node_modules/@originos/pi-agent-adapter/dist/index.cjs',
    'node_modules/@originos/pi-agent-adapter/dist/ai.cjs',
    'node_modules/@originos/pi-agent-adapter/dist/goal.cjs',
    'node_modules/archiver/index.js',
  ];

  for (const entry of requiredEntries) {
    if (!entries.includes(entry)) {
      fail(`${path.relative(repoRoot, asarPath)} missing ${entry}`);
    }
  }
  if (process.exitCode) return;

  const smokeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-mac-asar-smoke-'));
  try {
    asar.extractAll(asarPath, smokeDir);
    const smokeRequire = createRequire(path.join(smokeDir, 'package.json'));
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
    smokeRequire.resolve(path.join(
      smokeDir,
      'dist-electron/core/src/lib/integrations/pi-agent/core/agent.js',
    ));
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
    for (const entry of bundledSkillEntries) {
      const skillPath = path.join(resourcesDir, entry);
      if (!fs.existsSync(skillPath)) {
        fail(`bundled skill resource missing: ${path.relative(repoRoot, skillPath)}`);
      }
    }
    const outputDirectory = path.basename(path.dirname(appPath));
    const piTaskReport = await verifyPiTaskAsarRuntime({
      asarPath,
      platform: outputDirectory === 'mac-arm64' ? 'macos-arm64' : 'macos-x64',
    });
    console.log('[verify-mac-package] pi task runtime ok', {
      hash: piTaskReport.hash,
      platform: piTaskReport.platform,
    });
    console.log('[verify-mac-package] app.asar runtime ok', {
      appPath: path.relative(repoRoot, appPath),
    });
  } finally {
    fs.rmSync(smokeDir, { recursive: true, force: true });
  }
}

async function main() {
  const appPaths = candidateAppPaths.filter((appPath) => fs.existsSync(appPath));
  if (appPaths.length === 0) {
    throw new Error(`No macOS app bundle found under ${releaseDir}/mac*.`);
  }

  for (const appPath of appPaths) {
    await verifyApp(appPath);
  }
}

main().catch((error) => {
  console.error('[verify-mac-package] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
