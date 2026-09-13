const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const source = fs.readFileSync(path.join(path.dirname(require.resolve('dingtalk-stream')), 'client.cjs'), 'utf8');
const sockets = [];
const unhandled = [];
process.on('unhandledRejection', error => { unhandled.push(error); process.exitCode = 1; console.error(error); });
process.on('uncaughtException', error => { unhandled.push(error); process.exitCode = 1; console.error(error); });
class MockSocket extends EventEmitter {
  static CONNECTING = 0; static OPEN = 1; static CLOSED = 3;
  readyState = MockSocket.CONNECTING;
  sent = [];
  constructor() { super(); sockets.push(this); }
  terminate() {
    const connecting = this.readyState === MockSocket.CONNECTING;
    this.readyState = MockSocket.CLOSED;
    setImmediate(() => { if (connecting) this.emit('error', new Error('Mock handshake terminated')); this.emit('close'); });
  }
  open() { this.readyState = MockSocket.OPEN; this.emit('open'); }
  send(data, cb) { this.sent.push(JSON.parse(data)); cb?.(); }
  ping() {}
  close() { this.terminate(); }
}
const exportsObject = {};
vm.runInNewContext(source, {
  exports: exportsObject,
  require: name => {
    if (name === 'ws') return MockSocket;
    if (name === 'axios') return async () => ({ data: { endpoint: 'wss://mock.invalid', ticket: 'fixture' } });
    if (name === 'events') return EventEmitter;
    if (name === 'node:async_hooks' || name === 'async_hooks') return { AsyncLocalStorage };
    if (name === './constants.cjs') return { GATEWAY_URL: 'https://mock.invalid/gateway' };
    throw new Error(`Unexpected dependency ${name}`);
  },
  console: { info() {}, warn() {}, error() {} }, AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
}, { filename: 'published-dingtalk-stream-2.1.7-beta.1.cjs' });
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async promise => {
  let timeout;
  try { await Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('connect did not settle')), 300); })]); }
  finally { clearTimeout(timeout); }
};
(async () => {
  const client = new exportsObject.DWClient({ clientId: 'fixture', clientSecret: 'fixture', subscriptions: [], debug: false });
  const connecting = client.connect();
  await tick();
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].readyState, MockSocket.CONNECTING);
  client.disconnect();
  await settle(connecting);
  await tick();
  assert.equal(client.connected, false);
  assert.equal(client.registered, false);
  assert.equal(client.reconnecting, false);
  assert.deepEqual(unhandled, []);
  console.log('PASS CONNECTING disconnect settles connect; no unhandled rejection/error');

  const firstConnection = client.connect(); await tick();
  const oldSocket = sockets.at(-1); oldSocket.open(); await firstConnection;
  let release;
  const accepted = new Promise(resolve => { release = resolve; });
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  client.registerCallbackListener('/v1.0/im/bot/messages/get', async frame => {
    await accepted;
    client.socketCallBackResponse(frame.headers.messageId, {});
    finish();
  });
  oldSocket.emit('message', Buffer.from(JSON.stringify({ type: 'CALLBACK', headers: { topic: '/v1.0/im/bot/messages/get', messageId: 'old-message' }, data: '{}' })));
  client.disconnect();
  const secondConnection = client.connect(); await tick();
  const newSocket = sockets.at(-1); newSocket.open(); await secondConnection;
  release(); await finished;
  assert.equal(oldSocket.sent.length, 0);
  assert.equal(newSocket.sent.length, 0);
  console.log('PASS deferred old-connection ACK is not sent through replacement connection');
  client.disconnect(); client.removeAllListeners(); await tick();
  assert.deepEqual(unhandled, []);
  console.log('PASS all lifecycle checks; mock transports only, no network');
})().catch(error => { console.error(error); process.exitCode = 1; });
