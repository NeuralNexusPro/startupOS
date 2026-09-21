import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';
import { AtomicDataFileStore } from '../../../../../core/src/modules/perception-runtime';
import { JevProviderConfigError, type JevCredentialPort } from '../../../../../core/src/lib/features/perception';

const SECRET_REF = 'secret://model-provider/jev';
interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
interface CipherRecord { ciphertextBase64: string }

export class SafeStorageJevCredentialAdapter implements JevCredentialPort {
  private readonly store: AtomicDataFileStore<CipherRecord>;

  constructor(dataRoot: string, private readonly storage: SafeStorageLike = safeStorage) {
    this.store = new AtomicDataFileStore(path.join(dataRoot, 'model-providers', 'secrets', 'jev.json'));
  }

  async save(apiKey: string): Promise<string> {
    if (!this.secureStorageAvailable()) throw new JevProviderConfigError('SECURE_STORAGE_UNAVAILABLE');
    if (!apiKey || apiKey.length > 16_384) throw new JevProviderConfigError('INVALID_PROVIDER_CONFIG');
    this.store.write({ ciphertextBase64: this.storage.encryptString(apiKey).toString('base64') });
    fs.chmodSync(this.store.filePath, 0o600);
    return SECRET_REF;
  }

  async resolve(secretRef: string): Promise<string> {
    if (secretRef !== SECRET_REF) throw new JevProviderConfigError('INVALID_PROVIDER_CONFIG');
    if (!this.secureStorageAvailable()) throw new JevProviderConfigError('SECURE_STORAGE_UNAVAILABLE');
    const value = this.storage.decryptString(Buffer.from(this.store.read().data.ciphertextBase64, 'base64'));
    if (!value) throw new JevProviderConfigError('JEV_NOT_CONFIGURED');
    return value;
  }

  async remove(secretRef: string): Promise<void> {
    if (secretRef !== SECRET_REF) throw new JevProviderConfigError('INVALID_PROVIDER_CONFIG');
    if (fs.existsSync(this.store.filePath)) fs.unlinkSync(this.store.filePath);
    if (fs.existsSync(this.store.recoveryPath)) fs.unlinkSync(this.store.recoveryPath);
  }

  private secureStorageAvailable(): boolean {
    return this.storage.isEncryptionAvailable() && this.storage.getSelectedStorageBackend?.() !== 'basic_text';
  }
}
