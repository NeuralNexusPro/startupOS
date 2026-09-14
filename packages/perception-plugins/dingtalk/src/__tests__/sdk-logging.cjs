const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
// Child output proves isolation without replacing the process-wide console.
if (!process.env.DINGTALK_LOG_CHILD) {
  const result = spawnSync(process.execPath, [__filename], { env: { ...process.env, DINGTALK_LOG_CHILD: '1' }, encoding: 'utf8', timeout: 4000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  process.stdout.write('PASS SDK CJS/ESM logging\n');
} else (async () => {
  const esm = await import(pathToFileURL(path.join(path.dirname(require.resolve('dingtalk-stream')), 'index.mjs')).href);
  for (const { DWClient } of [require('dingtalk-stream'), esm]) {
    const records = [];
    const logger = Object.fromEntries(['info', 'warn', 'error'].map(level => [level, (...args) => records.push({ level, args })]));
    assert.throws(() => new DWClient({ clientId: '', clientSecret: '', logger }), /clientId/);
    const client = new DWClient({ clientId: 'fixture', clientSecret: 'fixture', debug: false, autoReconnect: false, logger });
    const failure = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
    client.getEndpoint = async () => { throw failure; };
    await client.connect();
    assert(records.some(record => record.args[0] === 'Connect failed' && record.args[1] === failure));
    client.onDownStream('invalid json PRIVATE_BODY');
    client.registerCallbackListener('topic', () => { throw failure; });
    client.onCallback({ headers: { topic: 'topic', messageId: 'message' } });
    assert.throws(() => client.send('', {}), /messageId/);
    client.disconnect();
    assert(records.some(record => record.level === 'info'));
    assert(records.some(record => record.level === 'warn'));
    assert(records.some(record => record.level === 'error'));
    const before = records.length;
    client.printDebug('PRIVATE_BODY');
    assert.equal(records.length, before);
    client.removeAllListeners();
  }
})().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
