import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JevProviderConfigService, type JevCredentialPort } from '../jev-provider-config';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function root(): string { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-jev-provider-')); roots.push(value); return value; }

function credentials(): JevCredentialPort {
  let value = '';
  return {
    save: async (next) => { value = next; return 'secret://model-provider/jev'; },
    resolve: async () => value,
    remove: async () => { value = ''; },
  };
}

describe('JevProviderConfigService', () => {
  it('returns only a non-sensitive summary and preserves an empty credential update', async () => {
    const dataRoot = root(); const secret = credentials(); const service = new JevProviderConfigService(dataRoot, { credentials: secret });
    await service.update({ enabled: true, baseUrl: 'https://api.typesafe.ai/', model: 'jev-latest', apiKey: 'marker-secret' });
    await service.update({ enabled: true, baseUrl: 'https://api.typesafe.ai', model: 'jev-next', apiKey: '  ' });
    const summary = service.getSummary();
    expect(summary).toMatchObject({ enabled: true, model: 'jev-next', credentialConfigured: true, credentialSource: 'secure-store' });
    expect(JSON.stringify(summary)).not.toMatch(/marker-secret|secretRef|ciphertext/i);
    expect(await service.resolveApiKey()).toBe('marker-secret');
    const stored = fs.readFileSync(path.join(dataRoot, 'model-providers', 'jev.json'), 'utf8');
    expect(stored).not.toContain('marker-secret');
  });

  it('clears secure credentials explicitly', async () => {
    const dataRoot = root(); const secret = credentials(); const service = new JevProviderConfigService(dataRoot, { credentials: secret });
    await service.update({ enabled: true, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', apiKey: 'stored' });
    expect((await service.clearCredential()).enabled).toBe(false);
    expect(service.getSummary().credentialConfigured).toBe(false);
  });

  it('fails closed when a page credential has no secure provider', async () => {
    const service = new JevProviderConfigService(root());
    await expect(service.update({ enabled: true, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', apiKey: 'secret' }))
      .rejects.toMatchObject({ code: 'SECURE_STORAGE_UNAVAILABLE' });
    await expect(service.update({ enabled: false, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', apiKey: 1 } as never))
      .rejects.toMatchObject({ code: 'INVALID_PROVIDER_CONFIG' });
  });
});
