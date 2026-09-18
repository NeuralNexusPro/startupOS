import { afterEach, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DWClient } from 'dingtalk-stream';
import type { PerceptionPluginRuntimeContext, PluginLogRecord } from '@originos/core/modules/perception-runtime/plugins';
import { DingTalkPerceptionPlugin } from '../plugin';

afterEach(() => { vi.restoreAllMocks(); });
it('installed SDK CJS and ESM route logs without writing stdout or stderr', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./sdk-logging.cjs', import.meta.url))], { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
  expect(output).toBe('PASS SDK CJS/ESM logging\n');
});
it.each([false, true])('default factory keeps connection handling safe with throwing sink=%s', async throwing => {
  const clients: DWClient[] = [];
  const failure = Object.assign(new Error('ENOTFOUND secret=PRIVATE'), { code: 'ENOTFOUND' });
  vi.spyOn(DWClient.prototype, 'getEndpoint').mockImplementation(async function (this: DWClient) { clients.push(this); throw failure; });
  const records: PluginLogRecord[] = [];
  const warn = vi.fn(() => { if (throwing) throw new Error('sink unavailable'); });
  const context: PerceptionPluginRuntimeContext = { pluginId: 'originos.dingtalk', connectorId: 'test', settings: { appId: 'app', robotCode: 'robot', secretRef: 'ref' }, ports: {
    credentials: { resolve: vi.fn(async () => 'secret'), bind: vi.fn(), remove: vi.fn() },
    events: { submit: vi.fn(async () => []) }, replies: { register: vi.fn() },
    schedule: { every: vi.fn(), cancel: vi.fn() }, health: { report: vi.fn() },
    log: { write: record => { records.push(record); }, sdkLogger: { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn } },
  } };
  const plugin = new DingTalkPerceptionPlugin();
  try {
    await expect(plugin.start(context)).resolves.toBeUndefined();
    expect(clients).toHaveLength(1);
    expect(clients[0].getConfig()).toMatchObject({ debug: false, logger: { warn: expect.any(Function) } });
    expect(warn).toHaveBeenCalledWith('Connect failed', failure);
    expect(context.ports.health?.report).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'disconnected' }));
    clients[0].onDownStream(JSON.stringify({ type: 'UNKNOWN', data: 'PRIVATE_CHAT_BODY' }));
    expect(context.ports.log?.sdkLogger?.info).not.toHaveBeenCalled();
  } finally { await plugin.stop(context); }
  expect(records).toEqual([]);
});
