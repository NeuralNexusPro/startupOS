import type { MailConnectorSettings } from './types';

export function validateMailConnectorSettings(
  value: Readonly<Record<string, unknown>>
): MailConnectorSettings {
  const {
    host,
    port,
    secure,
    username,
    authMode,
    mailbox,
    pollIntervalSeconds,
  } = value;
  if (
    typeof host !== 'string' ||
    host.length < 1 ||
    host.length > 253 ||
    /\s/.test(host)
  )
    throw new Error('INVALID_EMAIL_HOST');
  if (!Number.isSafeInteger(port) || Number(port) < 1 || Number(port) > 65_535)
    throw new Error('INVALID_EMAIL_PORT');
  if (typeof secure !== 'boolean') throw new Error('INVALID_EMAIL_TLS_MODE');
  if (
    typeof username !== 'string' ||
    username.length < 1 ||
    username.length > 320
  )
    throw new Error('INVALID_EMAIL_USERNAME');
  if (authMode !== 'password' && authMode !== 'oauth2-token')
    throw new Error('INVALID_EMAIL_AUTH_MODE');
  if (
    typeof mailbox !== 'string' ||
    mailbox.length < 1 ||
    mailbox.length > 255
  )
    throw new Error('INVALID_EMAIL_MAILBOX');
  if (
    !Number.isSafeInteger(pollIntervalSeconds) ||
    Number(pollIntervalSeconds) < 15 ||
    Number(pollIntervalSeconds) > 3_600
  )
    throw new Error('INVALID_EMAIL_POLL_INTERVAL');
  return {
    host,
    port: Number(port),
    secure,
    username,
    authMode,
    mailbox,
    pollIntervalSeconds: Number(pollIntervalSeconds),
  };
}
