import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerceptionConnectorConfigStore } from '../../../../../../core/src/modules/perception-runtime';
import type { ChannelMessageIngress } from '../../../../../../core/src/modules/channel-runtime';
import { PerceptionPluginHostService } from '../perception-plugin-host-service';
const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, safeStorage: {} }));
vi.mock('@originos/perception-plugin-email', () => ({ emailPlugin: { manifest: { id: 'originos.email', source: 'email' } } }));
vi.mock('@originos/perception-plugin-wecom', () => ({ weComPlugin: { manifest: { id: 'originos.wecom', source: 'wecom' } } }));
vi.mock('@originos/perception-plugin-feishu', () => ({ feishuPlugin: { manifest: { id: 'originos.feishu', source: 'feishu' } } }));
vi.mock('@originos/perception-plugin-dingtalk', async () => {
  const { dingtalkPlugin } = await vi.importActual<typeof import('@originos/perception-plugin-dingtalk')>('../../../../../../perception-plugins/dingtalk/src/plugin');
  return { dingtalkPlugin: { manifest: dingtalkPlugin.manifest, start: mocks.start, stop: mocks.stop } };
});
let directory: string;
let store: PerceptionConnectorConfigStore;
let service: PerceptionPluginHostService;
const save = (revision = 'first', enabled = true): void => {
  store.save({ id: 'test', source: 'dingtalk', mode: 'stream', enabled, secretRef: 'secret://perception/plugin/test/dingtalk', settings: { appId: revision }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: new Date().toISOString() });
};
beforeEach(() => {
  vi.useFakeTimers();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'perception-live-'));
  store = new PerceptionConnectorConfigStore(directory);
  mocks.start.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue(undefined);
  service = new PerceptionPluginHostService({} as ChannelMessageIngress, directory, undefined, { every: vi.fn(), cancel: vi.fn() });
});
afterEach(async () => { service.stop(); await vi.advanceTimersByTimeAsync(0); vi.useRealTimers(); fs.rmSync(directory, { recursive: true, force: true }); });
describe('Live perception configuration', () => {
  it('starts a newly enabled connector within the next scan without an app restart', async () => {
    service.start(); save();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    store.setEnabled('test', false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });
  it('restarts after a rebind and re-enable between scans, even with the same secret reference', async () => {
    save(); service.start(); await vi.advanceTimersByTimeAsync(1);
    save('second', false); store.setEnabled('test', true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.start.mock.calls[1]?.[0].settings.appId).toBe('second');
  });
  it('reloads a credential-only rebind with unchanged settings and secret reference', async () => {
    save(); service.start(); await vi.advanceTimersByTimeAsync(1);
    save(); await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });
  it('serializes slow starts and cleans them up when the service stops', async () => {
    let finish!: () => void;
    mocks.start.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    save(); service.start(); await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    service.stop(); finish(); await vi.advanceTimersByTimeAsync(0);
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });
  it('retries a failed startup on the next scan', async () => {
    mocks.start.mockRejectedValueOnce(new Error('TEST_START_FAILURE'));
    save(); service.start(); await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });
  it('registers, replaces, and cancels plugin schedules through the injected runtime', async () => {
    const schedule = { every: vi.fn(), cancel: vi.fn() };
    await service.stop();
    service = new PerceptionPluginHostService({} as ChannelMessageIngress, directory, undefined, schedule);
    mocks.start.mockImplementation(async (context) => {
      context.ports.schedule?.every('connection-health', 5000, async () => undefined);
    });
    save(); service.start(); await vi.advanceTimersByTimeAsync(1);
    expect(schedule.every).toHaveBeenCalledWith('originos.dingtalk:test:connection-health', 5000, expect.any(Function));

    save('second'); await vi.advanceTimersByTimeAsync(5000);
    expect(schedule.cancel).toHaveBeenCalledWith('originos.dingtalk:test:connection-health');
    expect(schedule.every).toHaveBeenCalledTimes(2);

    store.setEnabled('test', false); await vi.advanceTimersByTimeAsync(5000);
    expect(schedule.cancel).toHaveBeenCalledTimes(2);
  });
});
