// Run after pnpm --filter @originos/perception-plugin-wecom build.
// A bounded fresh process catches SDK default-console output and leaked timers.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['-e', `
const assert = require('node:assert/strict');
const { WeComPerceptionPlugin } = require('./dist/perception-plugins/wecom/src/index.js');
const settings = { botId: 'fixture', secretRef: 'fixture', websocketUrl: 'invalid-websocket-url' };
const secret = 'fixture';
const records = [];
const sdkLogger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace'].map(level => [level, (...args) => records.push({ level, args })]));
const context = { pluginId: 'originos.wecom', connectorId: 'real-sdk-check', settings, ports: {
  log: { write: record => records.push(record), sdkLogger },
  credentials: { resolve: async () => secret }, events: { submit: async () => [] }, health: { report: async () => {} },
} };
(async () => {
  const plugin = new WeComPerceptionPlugin();
  try { await plugin.start(context); } finally { await plugin.stop(context); }
  assert(records.some(record => record.level === 'error' && record.args?.includes('Failed to create WebSocket connection:')));
  assert(records.some(record => record.stage === 'connection.error'));
  process.stdout.write('sdk-logging-ok');
})().catch(error => { process.stderr.write(String(error)); process.exitCode = 1; });
`], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000 });
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stderr, '', 'SDK must not emit default console diagnostics');
assert.equal(result.stdout, 'sdk-logging-ok', 'SDK must not emit default console diagnostics');
process.stdout.write('wecom: real SDK logger routing passed\n');
