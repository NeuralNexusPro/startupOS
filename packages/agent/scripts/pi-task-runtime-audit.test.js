'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  CONTROLLED_TASK_PACKAGE,
  CONTROLLED_TASK_VERSION,
  RUNTIME_PATCH_SET_SHA256,
  TASK_PACKAGE_FINGERPRINT,
  runAudit,
} = require('./pi-task-runtime-audit');

test('受控 Task package 与公共 Adapter audit 生成稳定的机器可读契约', async () => {
  const report = await runAudit();
  const repeatedReport = await runAudit();

  assert.equal(report.auditSchemaVersion, 2);
  assert.equal(report.repository.adapter.version, '0.80.10');
  assert.equal(report.repository.controlledTaskPackage.version, CONTROLLED_TASK_VERSION);
  assert.equal(report.repository.controlledTaskPackage.fileCount, 32);
  assert.equal(
    report.repository.controlledTaskPackage.fingerprint,
    TASK_PACKAGE_FINGERPRINT,
  );
  assert.deepEqual(report.repository.controlledTaskPackage.runtimeDependencies, []);
  assert.equal(report.repository.runtimePatchSet.patches.length, 2);
  assert.equal(report.repository.runtimePatchSet.fingerprint, RUNTIME_PATCH_SET_SHA256);
  assert.equal(report.adapter.contractVersion, 1);
  assert.equal(report.piTasks.stateEvent.version, 2);
  assert.deepEqual(report.piTasks.stateEvent.observedReasons, [
    'session_start',
    'session_tree',
  ]);
  assert.equal(report.capabilities.hostToolInvocation.result, 'supported');
  assert.equal(report.capabilities.publicMutationCommandApi.result, 'supported');
  assert.equal(report.capabilities.stableRevision.result, 'supported');
  assert.equal(report.runtime.coreHostInvoke, 'invokeRegisteredToolCall');
  assert.equal(report.runtime.sessionHostInvoke, 'AgentSession.invokeRegisteredTool');
  assert.match(report.reportSha256, /^[a-f0-9]{64}$/);
  assert.equal(repeatedReport.reportSha256, report.reportSha256);
});

test('审计只使用受控 package 公共根导出且不解析 Session 文件', () => {
  const sourcePath = path.join(__dirname, 'pi-task-runtime-audit.js');
  const source = fs.readFileSync(sourcePath, 'utf8');

  assert.equal(source.includes("import('pi-tasks')"), false);
  assert.equal(
    /(?:from\s+|require\s*\(|import\s*\()[\"']@originos\/pi-tasks\//.test(source),
    false,
  );
  assert.equal(/session(?:Data|File|Path)|sessions?[\\/].*\.json/i.test(source), false);
  assert.equal(source.includes("'pi-tasks:event'"), false);
  assert.equal(source.includes(CONTROLLED_TASK_PACKAGE), true);
});

test('受控 package 未公开的私有路径不能解析', () => {
  assert.throws(
    () => require.resolve('@originos/pi-tasks/private-runtime'),
    (error) =>
      error instanceof Error &&
      ['ERR_PACKAGE_PATH_NOT_EXPORTED', 'MODULE_NOT_FOUND'].includes(error.code),
  );
});
