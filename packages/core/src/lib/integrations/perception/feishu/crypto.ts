import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';

export class FeishuCryptoError extends Error {
  readonly code = 'FEISHU_CRYPTO_ERROR';
}

export function createFeishuSignature(timestamp: string, nonce: string, encryptKey: string, rawBody: string): string {
  return createHash('sha256').update(`${timestamp}${nonce}${encryptKey}${rawBody}`).digest('hex');
}

export function verifyFeishuSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = Buffer.from(createFeishuSignature(timestamp, nonce, encryptKey, rawBody), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function decryptFeishuPayload(encrypted: string, encryptKey: string): string {
  const value = Buffer.from(encrypted, 'base64');
  if (value.length <= 16 || (value.length - 16) % 16 !== 0) throw new FeishuCryptoError('Invalid Feishu ciphertext');
  const key = createHash('sha256').update(encryptKey).digest();
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, value.subarray(0, 16));
    return Buffer.concat([decipher.update(value.subarray(16)), decipher.final()]).toString('utf8');
  } catch {
    throw new FeishuCryptoError('Unable to decrypt Feishu callback');
  }
}

export function secureStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
