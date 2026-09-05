import { createHash } from 'node:crypto';
import type { JsonValue, MailConnectorSettings } from '../../../../types/perception';

const CREDENTIAL_KEY = /(^|[-_.])(password|passcode|secret|token|credential|authorization)([-_.]|$)/i;

export function validateMailConnectorSettings(value: unknown): MailConnectorSettings {
  if (!isRecord(value)) throw new Error('Invalid Mail profile');
  assertNoCredentialFields(value);
  const { host, port, secure, username, authMode, mailbox, pollIntervalSeconds } = value;
  if (typeof host !== 'string' || host.length < 1 || host.length > 253 || /\s/.test(host)) throw new Error('Invalid Mail host');
  if (!Number.isSafeInteger(port) || Number(port) < 1 || Number(port) > 65_535) throw new Error('Invalid Mail port');
  if (typeof secure !== 'boolean') throw new Error('Invalid Mail TLS mode');
  if (typeof username !== 'string' || username.length < 1 || username.length > 320) throw new Error('Invalid Mail username');
  if (authMode !== 'password' && authMode !== 'oauth2-token') throw new Error('Invalid Mail auth mode');
  if (typeof mailbox !== 'string' || mailbox.length < 1 || mailbox.length > 255) throw new Error('Invalid Mail mailbox');
  if (!Number.isSafeInteger(pollIntervalSeconds) || Number(pollIntervalSeconds) < 15 || Number(pollIntervalSeconds) > 3_600) throw new Error('Invalid Mail poll interval');
  return { host, port: Number(port), secure, username, authMode, mailbox, pollIntervalSeconds: Number(pollIntervalSeconds) };
}

export function assertNoCredentialFields(value: JsonValue | Record<string, unknown>, path = 'settings'): void {
  if (Array.isArray(value)) { value.forEach((item, index) => { if (item && typeof item === 'object') assertNoCredentialFields(item as JsonValue, `${path}[${index}]`); }); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (CREDENTIAL_KEY.test(key)) throw new Error(`Credential-shaped field is forbidden at ${path}.${key}`);
    if (child && typeof child === 'object') assertNoCredentialFields(child as JsonValue, `${path}.${key}`);
  }
}

export function fingerprintMailProfile(profile: MailConnectorSettings): string {
  return createHash('sha256').update(JSON.stringify(profile)).digest('hex');
}

export function validateMailActivation(settings: Record<string, JsonValue>): void {
  const profile = validateMailConnectorSettings(settings);
  const receipt = settings['testReceipt'];
  if (!isRecord(receipt) || receipt['profileFingerprint'] !== fingerprintMailProfile(profile) || typeof receipt['verifiedAt'] !== 'string') {
    throw new Error('Mail connector must be successfully tested before activation');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
