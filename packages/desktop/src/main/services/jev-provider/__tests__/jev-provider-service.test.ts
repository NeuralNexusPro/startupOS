import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JevProviderConfigService } from '../../../../../../core/src/lib/features/perception';
import { IPC_CHANNELS } from '../../../ipc-protocol';
import type { JevDecisionAnswer } from '../../../../../../core/src/types/perception';

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

  it('freezes each request snapshot while the next request observes a hot update', async () => {
    let secret = '';
    const provider = new JevProviderConfigService(directory, { credentials: {
      save: async (value) => { secret = value; return 'secret://model-provider/jev'; }, resolve: async () => secret, remove: async () => { secret = ''; },
    } });
    await provider.update({ enabled: true, baseUrl: 'https://old.example.test', model: 'old-model', apiKey: 'old-key' });
    let finish!: () => void;
    const snapshots: Array<{ baseUrl: string; model: string; apiKey: string }> = [];
    const answer = (model: string): JevDecisionAnswer => ({
      providerModel: model,
      routeTarget: { choice: 'ignore', confidence: 1, probabilities: { ignore: 1 } },
      urgency: { score: 0, confidence: 1, probabilities: { low: 1, medium: 0, high: 0 } },
      risk: { score: 0, confidence: 1, probabilities: { low: 1, medium: 0, high: 0 } },
      needsHitl: 0, retainAsEvidence: 0,
    });
    const service = new JevProviderService(directory, provider, (snapshot) => {
      snapshots.push(snapshot);
      return { decide: async () => {
        if (snapshot.model === 'old-model') await new Promise<void>((resolve) => { finish = resolve; });
        return answer(snapshot.model);
      } };
    });
    const request = { state: {}, candidateKeys: ['ignore'], catalogVersion: '1.0' as const };
    const first = service.decisions.decide(request);
    await vi.waitFor(() => expect(snapshots).toHaveLength(1));
    await provider.update({ enabled: true, baseUrl: 'https://new.example.test', model: 'new-model', apiKey: 'new-key' });
    finish();
    expect((await first).providerModel).toBe('old-model');
    expect((await service.decisions.decide(request)).providerModel).toBe('new-model');
    expect(snapshots).toEqual([
      { baseUrl: 'https://old.example.test', model: 'old-model', apiKey: 'old-key' },
      { baseUrl: 'https://new.example.test', model: 'new-model', apiKey: 'new-key' },
    ]);
  });
});
