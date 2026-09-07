import fs from 'node:fs';
import path from 'node:path';
import type { MailCredentialPort, MailSecret, MailSecretInput } from '../../../../../core/src/types/perception';
import { AtomicDataFileStore, resolvePerceptionPath } from '../../../../../core/src/modules/perception-runtime';

interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
interface CipherRecord { connectorId: string; ciphertextBase64: string }

export class SafeStorageMailCredentialAdapter implements MailCredentialPort {
  constructor(private readonly dataRoot: string, private readonly safeStorage: SafeStorageLike) {}

  async bind(connectorId: string, secret: MailSecretInput): Promise<string> {
    validateId(connectorId);
    if (!this.safeStorage.isEncryptionAvailable()) throw new MailCredentialError('SECURE_STORAGE_UNAVAILABLE');
    if ((secret.kind !== 'password' && secret.kind !== 'oauth2-token') || !secret.value || secret.value.length > 16_384) throw new MailCredentialError('INVALID_PROFILE');
    const secretRef = `secret://perception/mail/${connectorId}`;
    const encrypted = this.safeStorage.encryptString(JSON.stringify(secret));
    this.store(connectorId).write({ connectorId, ciphertextBase64: encrypted.toString('base64') });
    fs.chmodSync(this.store(connectorId).filePath, 0o600);
    return secretRef;
  }

  async resolve(secretRef: string): Promise<MailSecret> {
    const connectorId = parseRef(secretRef);
    if (!this.safeStorage.isEncryptionAvailable()) throw new MailCredentialError('SECURE_STORAGE_UNAVAILABLE');
    const record = this.store(connectorId).read().data;
    const parsed = JSON.parse(this.safeStorage.decryptString(Buffer.from(record.ciphertextBase64, 'base64'))) as MailSecret;
    if ((parsed.kind !== 'password' && parsed.kind !== 'oauth2-token') || typeof parsed.value !== 'string') throw new MailCredentialError('INVALID_PROFILE');
    return parsed;
  }

  async remove(secretRef: string): Promise<void> {
    const connectorId = parseRef(secretRef);
    const store = this.store(connectorId);
    if (fs.existsSync(store.filePath)) fs.unlinkSync(store.filePath);
    if (fs.existsSync(store.recoveryPath)) fs.unlinkSync(store.recoveryPath);
  }

  private store(connectorId: string): AtomicDataFileStore<CipherRecord> {
    return new AtomicDataFileStore<CipherRecord>(path.join(resolvePerceptionPath(this.dataRoot, 'secrets', 'mail'), `${connectorId}.json`));
  }
}

export class MailCredentialError extends Error { constructor(readonly code: 'SECURE_STORAGE_UNAVAILABLE' | 'INVALID_PROFILE') { super(code); } }
function validateId(value: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new MailCredentialError('INVALID_PROFILE'); }
function parseRef(value: string): string { const match = /^secret:\/\/perception\/mail\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(value); if (!match?.[1]) throw new MailCredentialError('INVALID_PROFILE'); return match[1]; }
