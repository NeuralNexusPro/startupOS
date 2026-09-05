import fs from 'node:fs';
import path from 'node:path';
import { AtomicDataFileStore, resolvePerceptionPath } from '../../../../../core/src/modules/perception-runtime';
import type { WeComBotCredentialPort, WeComBotSecret, WeComBotSecretInput } from '../../../../../core/src/types/perception';

interface SafeStorageLike { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
interface CipherRecord { connectorId: string; ciphertextBase64: string }

export class SafeStorageWeComCredentialAdapter implements WeComBotCredentialPort {
  constructor(private readonly dataRoot: string, private readonly safeStorage: SafeStorageLike) {}
  async bind(connectorId: string, secret: WeComBotSecretInput): Promise<string> {
    validateId(connectorId);
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
    if (!secret.value || secret.value.length > 16_384) throw new Error('INVALID_SECRET');
    const encrypted = this.safeStorage.encryptString(JSON.stringify(secret));
    const store = this.store(connectorId);
    store.write({ connectorId, ciphertextBase64: encrypted.toString('base64') });
    fs.chmodSync(store.filePath, 0o600);
    return `secret://perception/wecom/${connectorId}`;
  }
  async resolve(secretRef: string): Promise<WeComBotSecret> {
    const connectorId = parseRef(secretRef);
    if (!this.safeStorage.isEncryptionAvailable()) throw new Error('SECURE_STORAGE_UNAVAILABLE');
    const record = this.store(connectorId).read().data;
    const parsed = JSON.parse(this.safeStorage.decryptString(Buffer.from(record.ciphertextBase64, 'base64'))) as WeComBotSecret;
    if (!parsed.value) throw new Error('INVALID_SECRET');
    return parsed;
  }
  async remove(secretRef: string): Promise<void> {
    const store = this.store(parseRef(secretRef));
    if (fs.existsSync(store.filePath)) fs.unlinkSync(store.filePath);
    if (fs.existsSync(store.recoveryPath)) fs.unlinkSync(store.recoveryPath);
  }
  private store(id: string): AtomicDataFileStore<CipherRecord> { return new AtomicDataFileStore(path.join(resolvePerceptionPath(this.dataRoot, 'secrets', 'wecom'), `${id}.json`)); }
}
function validateId(value: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new Error('INVALID_CONNECTOR_ID'); }
function parseRef(value: string): string { const match = /^secret:\/\/perception\/wecom\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(value); if (!match?.[1]) throw new Error('INVALID_SECRET_REF'); return match[1]; }
