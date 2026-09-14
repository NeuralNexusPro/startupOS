import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { AtomicDataFileStore, resolvePerceptionPath } from '../../../../../core/src/modules/perception-runtime';
import type { PluginCredentialPort } from '../../../../../core/src/modules/perception-runtime/plugins';

interface SafeStorageLike { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
interface SecretRecord { connectorId: string; name: string; ciphertextBase64: string }

/** Generic credential port used by bundled plugins; secrets never share the WeCom adapter namespace. */
export class SafeStoragePerceptionCredentialAdapter implements PluginCredentialPort {
  constructor(private readonly dataRoot: string, private readonly storage: SafeStorageLike = safeStorage) {}
  async bind(connectorId: string, name: string, secret: string): Promise<string> {
    validatePart(connectorId); validatePart(name);
    if (!this.storage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
    if (!secret || secret.length > 16_384) throw new Error('INVALID_SECRET');
    const store = this.store(connectorId, name);
    const record: SecretRecord = { connectorId, name, ciphertextBase64: this.storage.encryptString(secret).toString('base64') };
    store.write(record); fs.chmodSync(store.filePath, 0o600);
    return `secret://perception/plugin/${connectorId}/${name}`;
  }
  async resolve(connectorId: string, secretRef: string): Promise<string> {
    const match = /^secret:\/\/perception\/plugin\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/.exec(secretRef);
    if (!match || match[1] !== connectorId) throw new Error('INVALID_SECRET_REF');
    const record = this.store(match[1]!, match[2]!).read().data;
    const value = this.storage.decryptString(Buffer.from(record.ciphertextBase64, 'base64'));
    if (!value) throw new Error('INVALID_SECRET');
    return value;
  }
  async remove(connectorId: string, secretRef: string): Promise<void> {
    const match = /^secret:\/\/perception\/plugin\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/.exec(secretRef);
    if (!match || match[1] !== connectorId) throw new Error('INVALID_SECRET_REF');
    const store = this.store(match[1]!, match[2]!);
    if (fs.existsSync(store.filePath)) fs.unlinkSync(store.filePath);
    if (fs.existsSync(store.recoveryPath)) fs.unlinkSync(store.recoveryPath);
  }
  private store(connectorId: string, name: string): AtomicDataFileStore<SecretRecord> { return new AtomicDataFileStore(path.join(resolvePerceptionPath(this.dataRoot, 'secrets', 'plugins'), connectorId, `${name}.json`)); }
}
function validatePart(value: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new Error('INVALID_SECRET_KEY'); }
