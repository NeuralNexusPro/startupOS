import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SafeStorageMailCredentialAdapter } from '../safe-storage-credential-adapter';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function root(): string { const value = fs.mkdtempSync(path.join(os.tmpdir(), 'originos-mail-secret-')); roots.push(value); return value; }
const reversible = { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')), decryptString: (value: Buffer) => value.toString().split('').reverse().join('') };
describe('SafeStorageMailCredentialAdapter', () => {
  it('persists only ciphertext and resolves through safeStorage', async () => {
    const dataRoot = root(); const adapter = new SafeStorageMailCredentialAdapter(dataRoot, reversible); const marker = 'mail-secret-marker-492';
    const ref = await adapter.bind('mail-main', { kind: 'password', value: marker });
    expect(ref).toBe('secret://perception/mail/mail-main');
    expect(fs.readFileSync(path.join(dataRoot, 'perception', 'secrets', 'mail', 'mail-main.json'), 'utf8')).not.toContain(marker);
    expect(await adapter.resolve(ref)).toEqual({ kind: 'password', value: marker });
    await adapter.remove(ref); expect(fs.existsSync(path.join(dataRoot, 'perception', 'secrets', 'mail', 'mail-main.json'))).toBe(false);
  });
  it('fails closed without encryption', async () => {
    const adapter = new SafeStorageMailCredentialAdapter(root(), { ...reversible, isEncryptionAvailable: () => false });
    await expect(adapter.bind('mail-main', { kind: 'password', value: 'x' })).rejects.toMatchObject({ code: 'SECURE_STORAGE_UNAVAILABLE' });
  });
});
