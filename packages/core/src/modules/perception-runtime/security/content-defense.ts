import type { JsonValue } from '../protocol/types';

const SENSITIVE_KEY = /^(authorization|proxy-authorization|access[_-]?token|refresh[_-]?token|token|secret|app[_-]?secret|client[_-]?secret|session[_-]?webhook|webhook[_-]?(url|key)|password|passwd|cookie|set-cookie|api[_-]?key)$/i;

export const REDACTED_VALUE = '[REDACTED]';

export function redactSensitiveContent(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveContent);
  }
  if (value !== null && typeof value === 'object') {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY.test(key) ? REDACTED_VALUE : redactSensitiveContent(nested);
    }
    return result;
  }
  return value;
}

export function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}
