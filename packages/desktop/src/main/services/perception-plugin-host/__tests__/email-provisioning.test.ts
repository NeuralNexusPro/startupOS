import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerceptionConnectorConfigStore } from '../../../../../../core/src/modules/perception-runtime';
import type { ChannelMessageIngress } from '../../../../../../core/src/modules/channel-runtime';
import { IPC_CHANNELS } from '../../../ipc-protocol';
import { PerceptionPluginHostService } from '../perception-plugin-host-service';

const mocks = vi.hoisted(() => ({ handle: vi.fn(), connect: vi.fn(), mailboxOpen: vi.fn(), encrypt: vi.fn() }));
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: mocks.encrypt },
}));
vi.mock('imapflow', () => ({ ImapFlow: class {
  usable = true;
  connect = mocks.connect;
  mailboxOpen = mocks.mailboxOpen;
  logout = vi.fn();
  close = vi.fn();
} }));
vi.mock('@originos/perception-plugin-email', async () => vi.importActual('../../../../../../perception-plugins/email/src/plugin'));
vi.mock('@originos/perception-plugin-wecom', () => ({ weComPlugin: { manifest: { id: 'originos.wecom', source: 'wecom' } } }));
vi.mock('@originos/perception-plugin-feishu', () => ({ feishuPlugin: { manifest: { id: 'originos.feishu', source: 'feishu' } } }));
vi.mock('@originos/perception-plugin-dingtalk', async () => vi.importActual('../../../../../../perception-plugins/dingtalk/src/plugin'));

const settings = { host: 'imap.example.test', port: 993, secure: true, username: 'test@example.test', authMode: 'password', mailbox: 'INBOX', pollIntervalSeconds: 60 };
const request = { pluginId: 'originos.email', connectorId: 'email-test', settings, secrets: { secret: 'test-only-secret' } };
type Provision = (event: unknown, input: typeof request) => Promise<{ success: boolean }>;
let directory: string;
let store: PerceptionConnectorConfigStore;
let provision: Provision;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'email-provision-'));
  mocks.connect.mockResolvedValue(undefined);
  mocks.mailboxOpen.mockResolvedValue({});
  mocks.encrypt.mockReturnValue(Buffer.from('encrypted-test-value'));
  new PerceptionPluginHostService({} as ChannelMessageIngress, directory);
  store = new PerceptionConnectorConfigStore(directory);
  provision = mocks.handle.mock.calls.find(([channel]) => channel === IPC_CHANNELS.PERCEPTION_PLUGIN_PROVISION)![1] as Provision;
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('Email plugin activation', () => {
  it('enables a profile after real plugin provisioning and read-only mailbox verification', async () => {
    expect(await provision(undefined, request)).toMatchObject({ success: true });
    expect(mocks.mailboxOpen).toHaveBeenCalledWith('INBOX', { readOnly: true });
    expect(store.setEnabled(request.connectorId, true).enabled).toBe(true);
    expect(JSON.stringify(store.get(request.connectorId))).not.toContain(request.secrets.secret);
  });
  it.each(['connect', 'mailboxOpen'] as const)('does not save a profile or bind credentials if %s fails', async (step) => {
    mocks[step].mockRejectedValue(new Error('TEST_CONNECTION_FAILED'));
    expect(await provision(undefined, request)).toMatchObject({ success: false });
    expect(store.get(request.connectorId)).toBeNull();
    expect(mocks.encrypt).not.toHaveBeenCalled();
  });
  it.each(['host', 'username'] as const)('rejects a changed %s despite a previous successful verification', async (field) => {
    await provision(undefined, request);
    const saved = store.get(request.connectorId)!;
    store.save({ ...saved, settings: { ...saved.settings, [field]: 'changed.example.test' } });
    expect(() => store.setEnabled(request.connectorId, true)).toThrow('successfully tested');
  });
  it('requires reprovisioning an older profile without a receipt', async () => {
    const now = new Date().toISOString();
    store.save({ id: request.connectorId, source: 'email', mode: 'email-poll', enabled: false, settings, createdAt: now, updatedAt: now });
    expect(() => store.setEnabled(request.connectorId, true)).toThrow('successfully tested');
    await provision(undefined, request);
    expect(store.setEnabled(request.connectorId, true).enabled).toBe(true);
  });
  it('leaves the saved profile unchanged after a failed rebind', async () => {
    await provision(undefined, request);
    const saved = store.get(request.connectorId);
    mocks.connect.mockRejectedValue(new Error('TEST_CONNECTION_FAILED'));
    expect(await provision(undefined, request)).toMatchObject({ success: false });
    expect(store.get(request.connectorId)).toEqual(saved);
  });
  it('does not add email verification records to other plugins', async () => {
    expect(await provision(undefined, { ...request, pluginId: 'originos.dingtalk', connectorId: 'dingtalk-test' })).toMatchObject({ success: true });
    expect(store.get('dingtalk-test')?.settings).not.toHaveProperty('testReceipt');
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
