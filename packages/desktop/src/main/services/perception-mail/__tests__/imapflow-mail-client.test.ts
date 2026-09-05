import { describe, expect, it } from 'vitest';
import { toMailConnectionErrorCode } from '../imapflow-mail-client';
describe('IMAP safe error mapping', () => {
  it.each([[{ code: 'ETIMEDOUT' }, 'TIMEOUT'], [{ code: 'ENOTFOUND' }, 'DNS_FAILED'], [{ authenticationFailed: true }, 'AUTH_FAILED'], [{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'TLS_FAILED'], [{ message: 'Mailbox does not exist' }, 'MAILBOX_NOT_FOUND'], [new Error('private detail'), 'CONNECTION_FAILED']] as const)
    ('maps provider errors to safe codes', (error, expected) => expect(toMailConnectionErrorCode(error)).toBe(expected));
});
