import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SafeStorageJevCredentialAdapter } from '../safe-storage-credential-adapter';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function root(): string { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-jev-secret-')); roots.push(value); return value; }
const reversible = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')), decryptString: (value: Buffer) => value.toString().split('').reverse().join('') };

describe('SafeStorageJevCredentialAdapter', () => {
  it('saves, overwrites, survives restart, uses 0600, and clears', async () => {
    const dataRoot = root(); const adapter = new SafeStorageJevCredentialAdapter(dataRoot, reversible);
    const ref = await adapter.save('first-marker'); await adapter.save('second-marker');
    const file = path.join(dataRoot, 'model-providers', 'secrets', 'jev.json');
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/first-marker|second-marker/);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(await new SafeStorageJevCredentialAdapter(dataRoot, reversible).resolve(ref)).toBe('second-marker');
    await adapter.remove(ref); expect(fs.existsSync(file)).toBe(false);
  });

  it('rejects writes without secure storage', async () => {
    const adapter = new SafeStorageJevCredentialAdapter(root(), { ...reversible, isEncryptionAvailable: () => false });
    await expect(adapter.save('secret')).rejects.toMatchObject({ code: 'SECURE_STORAGE_UNAVAILABLE' });
    const plaintext = new SafeStorageJevCredentialAdapter(root(), { ...reversible, getSelectedStorageBackend: () => 'basic_text' });
    await expect(plaintext.save('secret')).rejects.toMatchObject({ code: 'SECURE_STORAGE_UNAVAILABLE' });
  });
});
