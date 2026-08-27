import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import asar from '@electron/asar';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..', '..', '..');
const {
  assertRuntimeResolutionBoundary,
  verifyAsarRuntime,
  verifyRuntimeLayout,
} = require('../verify-pi-task-runtime-package.js');
const temporaryDirectories = [];
const runtimePatchFiles = [
  'patches/@earendil-works__pi-agent-core@0.80.10.patch',
  'patches/@earendil-works__pi-coding-agent@0.80.10.patch',
];

const taskRuntimeExports = [
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
];

function temporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writePackage(root, packageName, manifest, source) {
  const directory = path.join(root, 'node_modules', ...packageName.split('/'));
  writeJson(path.join(directory, 'package.json'), manifest);
  fs.writeFileSync(path.join(directory, 'index.cjs'), source);
  return directory;
}

function withLineEnding(value, lineEnding) {
  return value.replace(/\r\n?/g, '\n').replace(/\n/g, lineEnding);
}

function rewriteTreeLineEndings(root, lineEnding) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) rewriteTreeLineEndings(entryPath, lineEnding);
    else if (entry.isFile()) {
      fs.writeFileSync(entryPath, withLineEnding(fs.readFileSync(entryPath, 'utf8'), lineEnding));
    }
  }
}

function writePatchRepository(lineEnding = '\n') {
  const root = temporaryDirectory('originos-pi-task-repository-');
  for (const patchFile of runtimePatchFiles) {
    const source = path.join(repositoryRoot, patchFile);
    const target = path.join(root, patchFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, withLineEnding(fs.readFileSync(source, 'utf8'), lineEnding));
  }
  return root;
}

function taskRuntimeSource() {
  const functions = taskRuntimeExports.filter((name) => ![
    'DEFAULT_SANITIZE_LIMITS', 'PI_TASK_COMPATIBILITY_REQUIREMENTS',
    'PI_TASK_CONTRACT_VERSION', 'PI_TASK_SNAPSHOT_VERSION', 'PI_TASK_STATE_EVENT_NAME',
    'PI_TASK_STATE_EVENT_VERSION', 'PI_TASK_TOOL_NAMES',
  ].includes(name));
  return [
    "const compatibility = { adapterContractVersion: 1, runtimePackage: '@earendil-works/pi-coding-agent', runtimeVersion: '0.80.10', runtimeHostInvokeContractVersion: 1, taskExtensionPackage: '@originos/pi-tasks', taskExtensionVersion: '0.2.0-originos.1', taskExtensionContractVersion: 2, taskLedgerEventVersion: 2, taskStateEventVersion: 2 };",
    `module.exports = { DEFAULT_SANITIZE_LIMITS: {}, PI_TASK_COMPATIBILITY_REQUIREMENTS: compatibility, PI_TASK_CONTRACT_VERSION: 1, PI_TASK_SNAPSHOT_VERSION: 1, PI_TASK_STATE_EVENT_NAME: 'pi-tasks:state', PI_TASK_STATE_EVENT_VERSION: 2, PI_TASK_TOOL_NAMES: [], ${functions.map((name) => `${name}: function ${name}() {}`).join(', ')} };`,
    '',
  ].join('\n');
}

function writeFixture(options = {}) {
  const root = temporaryDirectory('originos-pi-task-layout-');
  writeJson(path.join(root, 'package.json'), { name: 'runtime-fixture', private: true });
  const adapterDirectory = writePackage(root, '@originos/pi-agent-adapter', {
    name: '@originos/pi-agent-adapter',
    version: '0.80.10',
    main: './index.cjs',
    exports: {
      '.': './index.cjs',
      './task-runtime': './task-runtime.js',
    },
    dependencies: {
      '@earendil-works/pi-agent-core': '0.80.10',
      '@earendil-works/pi-coding-agent': '0.80.10',
      '@originos/pi-tasks': '0.2.0-originos.1',
      ...(options.missingTransitive ? { 'missing-runtime-dependency': '1.0.0' } : {}),
    },
  }, 'module.exports = { Agent: class Agent {} };\n');
  fs.writeFileSync(
    path.join(adapterDirectory, 'task-runtime.js'),
    "module.exports = require('./dist/task-runtime.cjs');\n",
  );
  fs.mkdirSync(path.join(adapterDirectory, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(adapterDirectory, 'dist', 'task-runtime.cjs'),
    options.badTaskRuntime ? 'module.exports = {};\n' : taskRuntimeSource(),
  );

  writePackage(root, '@earendil-works/pi-agent-core', {
    name: '@earendil-works/pi-agent-core', version: '0.80.10', main: './index.cjs',
  }, 'exports.invokeRegisteredToolCall = function invokeRegisteredToolCall() {};\n');
  writePackage(root, '@earendil-works/pi-coding-agent', {
    name: '@earendil-works/pi-coding-agent', version: '0.80.10', main: './index.cjs',
  }, 'exports.AgentSession = class AgentSession { invokeRegisteredTool() {} };\n');

  if (!options.missingControlledPackage) {
    const controlledSource = path.join(repositoryRoot, 'packages', 'pi-tasks');
    const controlledDirectory = path.join(root, 'node_modules', '@originos', 'pi-tasks');
    fs.cpSync(controlledSource, controlledDirectory, {
      recursive: true,
      filter(source) {
        const relativeEntries = path.relative(controlledSource, source).split(path.sep);
        const relativePath = path.relative(controlledSource, source);
        const isPackagingPrunedFile = options.packagingPruned && (
          relativePath === 'README.md' || relativePath.endsWith('.d.ts')
        );
        return !relativeEntries.includes('node_modules') &&
          relativeEntries[0] !== 'test' &&
          !isPackagingPrunedFile;
      },
    });
    if (options.packagingPruned) {
      const manifestPath = path.join(controlledDirectory, 'package.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      delete manifest.description;
      delete manifest.files;
      delete manifest.scripts;
      delete manifest.devDependencies;
      delete manifest.license;
      writeJson(manifestPath, manifest);
    }
    if (options.windowsLineEndings) rewriteTreeLineEndings(controlledDirectory, '\r\n');
    if (options.controlledVersion) {
      const manifestPath = path.join(controlledDirectory, 'package.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.version = options.controlledVersion;
      writeJson(manifestPath, manifest);
    }
    if (options.controlledRuntimeDrift) {
      fs.appendFileSync(path.join(controlledDirectory, 'src', 'store.js'), '\n// drift\n');
    }
  }
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Pi Task Runtime package verification', () => {
  it('验证 development public export、两个 patch、受控 package 和依赖闭包', async () => {
    const report = await verifyRuntimeLayout({
      baseDir: writeFixture(),
      repositoryRoot,
      platform: 'development-test',
    });
    expect(report).toMatchObject({
      schemaVersion: 2,
      source: 'development',
      platform: 'development-test',
      result: 'passed',
      adapter: { publicExport: '@originos/pi-agent-adapter/task-runtime' },
      controlledTaskPackage: {
        version: '0.2.0-originos.1',
        eventVersion: 2,
        stateEventVersion: 2,
      },
      runtimePatchSet: { version: 1 },
    });
    expect(report.runtimePatchSet.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(report.transitiveDependencies).toMatchObject({ count: 3 });
    expect(report.transitiveDependencies.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('允许布局根目录使用指向真实路径的别名', async () => {
    const layout = writeFixture();
    const aliasRoot = temporaryDirectory('originos-pi-task-alias-');
    const aliasPath = path.join(aliasRoot, 'runtime-layout');
    fs.symlinkSync(layout, aliasPath, process.platform === 'win32' ? 'junction' : 'dir');

    const report = await verifyRuntimeLayout({
      baseDir: aliasPath,
      repositoryRoot,
      platform: 'path-alias-test',
    });

    expect(report).toMatchObject({
      source: 'development',
      platform: 'path-alias-test',
      result: 'passed',
    });
  });

  it('允许打包器裁剪受控 package 的非运行时文档和类型声明', async () => {
    const report = await verifyRuntimeLayout({
      baseDir: writeFixture({ packagingPruned: true }),
      repositoryRoot,
      platform: 'windows-x64',
    });

    expect(report).toMatchObject({
      result: 'passed',
      controlledTaskPackage: {
        fingerprint: '4a80ab2874d1e39a6cf981f8c4baacddb8121dad4d853d8568b30cdcaf007d28',
      },
    });
  });

  it('将 Windows CRLF 文本规范化为稳定指纹', async () => {
    const report = await verifyRuntimeLayout({
      baseDir: writeFixture({ windowsLineEndings: true }),
      repositoryRoot: writePatchRepository('\r\n'),
      platform: 'windows-crlf-test',
    });

    expect(report).toMatchObject({
      source: 'development',
      platform: 'windows-crlf-test',
      result: 'passed',
    });
  });

  it('不将裸 CR 文本视为等价指纹', async () => {
    await expect(verifyRuntimeLayout({
      baseDir: writeFixture(),
      repositoryRoot: writePatchRepository('\r'),
      platform: 'bare-cr-test',
    })).rejects.toMatchObject({ code: 'PATCH_MISMATCH' });
  });

  it('拒绝真实路径位于布局外的依赖', () => {
    const layout = writeFixture();
    const externalRoot = temporaryDirectory('originos-pi-task-external-');
    const externalPackage = writePackage(externalRoot, '@earendil-works/pi-agent-core', {
      name: '@earendil-works/pi-agent-core', version: '0.80.10', main: './index.cjs',
    }, 'exports.invokeRegisteredToolCall = function invokeRegisteredToolCall() {};\n');

    let error;
    try {
      assertRuntimeResolutionBoundary(
        path.join(externalPackage, 'package.json'),
        layout,
        repositoryRoot,
        'development',
      );
    } catch (caughtError) {
      error = caughtError;
    }
    expect(error).toMatchObject({
      code: 'MODULE_OUTSIDE_LAYOUT',
      details: { modulePath: fs.realpathSync(path.join(externalPackage, 'package.json')) },
    });
  });

  it('通过真实模块解析拒绝链接外逃依赖', async () => {
    const layout = writeFixture();
    const externalRoot = temporaryDirectory('originos-pi-task-symlink-external-');
    const externalPackage = writePackage(externalRoot, '@earendil-works/pi-agent-core', {
      name: '@earendil-works/pi-agent-core', version: '0.80.10', main: './index.cjs',
    }, 'exports.invokeRegisteredToolCall = function invokeRegisteredToolCall() {};\n');
    const linkedPackage = path.join(layout, 'node_modules', '@earendil-works', 'pi-agent-core');
    fs.rmSync(linkedPackage, { recursive: true, force: true });
    fs.symlinkSync(
      externalPackage,
      linkedPackage,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(verifyRuntimeLayout({ baseDir: layout, repositoryRoot }))
      .rejects.toMatchObject({ code: 'MODULE_OUTSIDE_LAYOUT' });
  });

  it('将悬空布局别名报告为结构化布局错误', async () => {
    const aliasRoot = temporaryDirectory('originos-pi-task-dangling-');
    const missingLayout = path.join(aliasRoot, 'missing-layout');
    const aliasPath = path.join(aliasRoot, 'runtime-layout');
    fs.symlinkSync(missingLayout, aliasPath, process.platform === 'win32' ? 'junction' : 'dir');

    await expect(verifyRuntimeLayout({ baseDir: aliasPath, repositoryRoot }))
      .rejects.toMatchObject({
        code: 'LAYOUT_INVALID',
        details: { targetPath: aliasPath },
      });
  });

  it('验证 ASAR inventory 和提取后的真实模块加载', async () => {
    const layout = writeFixture({ packagingPruned: true });
    expect(fs.existsSync(path.join(
      layout,
      'node_modules',
      '@originos',
      'pi-tasks',
      'node_modules',
    ))).toBe(false);
    const asarPath = path.join(temporaryDirectory('originos-pi-task-asar-'), 'app.asar');
    await asar.createPackage(layout, asarPath);
    const entries = asar.listPackage(asarPath, { isPack: true })
      .map((entry) => entry.replace(/\\/g, '/'));
    expect(entries.some((entry) => (
      entry.includes('node_modules/@originos/pi-tasks/node_modules/')
    ))).toBe(false);
    const report = await verifyAsarRuntime({ asarPath, platform: 'windows-x64', repositoryRoot });
    expect(report).toMatchObject({ source: 'asar', platform: 'windows-x64', result: 'passed' });
  });

  it('拒绝 ASAR 中受控任务包的嵌套 workspace 依赖', async () => {
    const layout = writeFixture();
    writeJson(path.join(
      layout,
      'node_modules',
      '@originos',
      'pi-tasks',
      'src',
      'Node_Modules',
      'unexpected-runtime',
      'package.json',
    ), { name: 'unexpected-runtime', version: '1.0.0' });
    const asarPath = path.join(temporaryDirectory('originos-pi-task-nested-asar-'), 'app.asar');
    await asar.createPackage(layout, asarPath);

    await expect(verifyAsarRuntime({ asarPath, platform: 'windows-x64', repositoryRoot }))
      .rejects.toMatchObject({ code: 'LAYOUT_INVALID' });
  });

  it('缺少受控 package 时 fail closed', async () => {
    await expect(verifyRuntimeLayout({
      baseDir: writeFixture({ missingControlledPackage: true }), repositoryRoot,
    })).rejects.toMatchObject({ code: 'MODULE_OUTSIDE_LAYOUT' });
  });

  it('拒绝受控 package 版本漂移', async () => {
    await expect(verifyRuntimeLayout({
      baseDir: writeFixture({ controlledVersion: '0.2.0-originos.2' }), repositoryRoot,
    })).rejects.toMatchObject({
      code: 'VERSION_MISMATCH',
      details: { module: '@originos/pi-tasks', expectedVersion: '0.2.0-originos.1' },
    });
  });

  it('拒绝受控 package 的可执行运行时漂移', async () => {
    await expect(verifyRuntimeLayout({
      baseDir: writeFixture({ controlledRuntimeDrift: true }), repositoryRoot,
    })).rejects.toMatchObject({ code: 'PACKAGE_FINGERPRINT_MISMATCH' });
  });

  it('拒绝 Adapter public export 漂移', async () => {
    await expect(verifyRuntimeLayout({
      baseDir: writeFixture({ badTaskRuntime: true }), repositoryRoot,
    })).rejects.toMatchObject({ code: 'EXPORT_MISMATCH' });
  });

  it('缺少任意 transitive dependency 时 fail closed', async () => {
    await expect(verifyRuntimeLayout({
      baseDir: writeFixture({ missingTransitive: true }), repositoryRoot,
    })).rejects.toMatchObject({ code: 'MODULE_MISSING' });
  });
});
