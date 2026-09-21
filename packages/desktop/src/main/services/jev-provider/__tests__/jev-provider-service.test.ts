import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JevProviderConfigService } from '../../../../../../core/src/lib/features/perception';
import { IPC_CHANNELS } from '../../../ipc-protocol';

const mocks = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle }, safeStorage: {} }));
import { JevProviderService } from '../jev-provider-service';

type Handler = (event?: unknown, input?: unknown) => Promise<{ success: boolean; data?: unknown; error?: { code: string } }>;
let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-ipc-')); mocks.handle.mockClear(); });
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
function handler(channel: string): Handler { return mocks.handle.mock.calls.find(([value]) => value === channel)![1] as Handler; }

describe('JevProviderService', () => {
  it('returns summaries without credentials or refs', async () => {
    let secret = '';
    const provider = new JevProviderConfigService(directory, { credentials: {
      save: async (value) => { secret = value; return 'secret://model-provider/jev'; }, resolve: async () => secret, remove: async () => { secret = ''; },
    } });
    new JevProviderService(directory, provider);
    const marker = 'ipc-secret-marker';
    const saved = await handler(IPC_CHANNELS.JEV_PROVIDER_UPDATE)(undefined, { enabled: true, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', apiKey: marker });
    const read = await handler(IPC_CHANNELS.JEV_PROVIDER_GET)();
    expect(saved.success).toBe(true); expect(read.success).toBe(true);
    expect(JSON.stringify([saved, read])).not.toMatch(new RegExp(`${marker}|secretRef|ciphertext`, 'i'));
  });

  it('maps unavailable secure storage to a safe code', async () => {
    new JevProviderService(directory, new JevProviderConfigService(directory));
    const result = await handler(IPC_CHANNELS.JEV_PROVIDER_UPDATE)(undefined, { enabled: true, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', apiKey: 'secret' });
    expect(result).toMatchObject({ success: false, error: { code: 'SECURE_STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
