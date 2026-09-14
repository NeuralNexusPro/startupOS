import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import type { WeComSecrets, WeComUrlVerificationRequest } from './types';

const PKCS7_BLOCK_SIZE = 32;

export class WeComCryptoError extends Error {
  readonly code = 'WECOM_CRYPTO_ERROR';
}

export function createWeComSignature(token: string, timestamp: string, nonce: string, encrypted: string): string {
  return createHash('sha1').update([token, timestamp, nonce, encrypted].sort().join('')).digest('hex');
}

export function verifyWeComSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypted: string,
  signature: string,
): boolean {
  const expected = Buffer.from(createWeComSignature(token, timestamp, nonce, encrypted), 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function decryptWeComMessage(encrypted: string, encodingAesKey: string, receiveId: string): string {
  const key = decodeAesKey(encodingAesKey);
  let decrypted: Buffer;
  try {
    const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
    decipher.setAutoPadding(false);
    decrypted = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  } catch {
    throw new WeComCryptoError('Unable to decrypt WeCom callback');
  }
  const plaintext = removePkcs7Padding(decrypted);
  if (plaintext.length < 20) throw new WeComCryptoError('Invalid WeCom plaintext layout');
  const messageLength = plaintext.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageLength < 0 || messageEnd > plaintext.length) throw new WeComCryptoError('Invalid WeCom message length');
  const message = plaintext.subarray(20, messageEnd).toString('utf8');
  const actualReceiveId = plaintext.subarray(messageEnd);
  const expectedReceiveId = Buffer.from(receiveId, 'utf8');
  if (actualReceiveId.length !== expectedReceiveId.length || !timingSafeEqual(actualReceiveId, expectedReceiveId)) {
    throw new WeComCryptoError('WeCom receiveId mismatch');
  }
  return message;
}

export function verifyWeComUrl(
  secrets: WeComSecrets,
  request: WeComUrlVerificationRequest,
  nowMs = Date.now(),
  replayWindowMs = 5 * 60 * 1000,
): string {
  const echoStr = decodeURIComponent(request.echoStr);
  const signedAtMs = Number(request.timestamp) * 1000;
  if (!Number.isFinite(signedAtMs) || Math.abs(nowMs - signedAtMs) > replayWindowMs) {
    throw new WeComCryptoError('WeCom URL verification timestamp is outside the replay window');
  }
  if (!verifyWeComSignature(secrets.token, request.timestamp, request.nonce, echoStr, request.msgSignature)) {
    throw new WeComCryptoError('Invalid WeCom URL verification signature');
  }
  return decryptWeComMessage(echoStr, secrets.encodingAesKey, secrets.receiveId);
}

function decodeAesKey(encodingAesKey: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}$/.test(encodingAesKey)) throw new WeComCryptoError('Invalid WeCom EncodingAESKey');
  const key = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (key.length !== 32) throw new WeComCryptoError('Invalid WeCom EncodingAESKey');
  return key;
}

function removePkcs7Padding(value: Buffer): Buffer {
  if (value.length === 0) throw new WeComCryptoError('Invalid WeCom padding');
  const padding = value[value.length - 1] ?? 0;
  if (padding < 1 || padding > PKCS7_BLOCK_SIZE || padding > value.length) {
    throw new WeComCryptoError('Invalid WeCom padding');
  }
  for (let index = value.length - padding; index < value.length; index += 1) {
    if (value[index] !== padding) throw new WeComCryptoError('Invalid WeCom padding');
  }
  return value.subarray(0, value.length - padding);
}
