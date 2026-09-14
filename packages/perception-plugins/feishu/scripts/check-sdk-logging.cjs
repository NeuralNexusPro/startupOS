// Run after pnpm --filter @originos/perception-plugin-feishu build.
// A bounded fresh process catches SDK default-console output and leaked timers.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['-e', `
const assert = require('node:assert/strict');
const { FeishuPerceptionPlugin } = require('./dist/perception-plugins/feishu/src/index.js');
const sdk = require('@larksuiteoapi/node-sdk');
let requests = 0;
// Only the HTTP transport is stubbed; constructors, SDK error handling and logger remain real.
sdk.defaultHttpInstance.request = async () => {
  requests += 1;
  return { code: 100004, data: {}, msg: 'unauthorized' };
};
const settings = { appId: 'cli_0123456789abcdef', secretRef: 'fixture' };
const secret = JSON.stringify({ appSecret: 'fixture' });
let connectionFailed;
const failed = new Promise(resolve => { connectionFailed = resolve; });
const records = [];
const sdkLogger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace'].map(level => [level, (...args) => records.push({ level, args })]));
const context = { pluginId: 'originos.feishu', connectorId: 'real-sdk-check', settings, ports: {
  log: { write: record => records.push(record), sdkLogger },
  credentials: { resolve: async () => secret }, events: { submit: async () => [] }, health: { report: async health => { if (health.safeCode === 'FEISHU_AUTH_FAILED') connectionFailed(); } },
} };
(async () => {
  const plugin = new FeishuPerceptionPlugin();
  try { await plugin.start(context); await failed; } finally { await plugin.stop(context); }
  assert.equal(requests, 1);
  assert(records.some(record => record.level === 'error' && record.args?.flat(3).some(arg => typeof arg === 'string' && arg.includes('100004, unauthorized'))));
  assert(records.some(record => record.stage === 'connection.error'));
  process.stdout.write('sdk-logging-ok');
})().catch(error => { process.stderr.write(String(error)); process.exitCode = 1; });
`], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stderr, '', 'SDK must not emit default console diagnostics');
assert.equal(result.stdout, 'sdk-logging-ok', 'SDK must not emit default console diagnostics');
process.stdout.write('feishu: real SDK logger routing passed\n');
