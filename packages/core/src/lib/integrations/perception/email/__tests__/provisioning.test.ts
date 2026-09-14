import { describe, expect, it } from 'vitest';
import { fingerprintMailProfile, validateMailConnectorSettings } from '../provisioning';

const profile = { host: 'imap.example.test', port: 993, secure: true, username: 'user@example.test', authMode: 'password', mailbox: 'INBOX', pollIntervalSeconds: 60 } as const;

describe('Mail provisioning contracts', () => {
  it('validates a bounded non-secret IMAP profile and fingerprints it deterministically', () => {
    expect(validateMailConnectorSettings(profile)).toEqual(profile);
    expect(fingerprintMailProfile(profile)).toBe(fingerprintMailProfile({ ...profile }));
  });
  it.each([
    [{ ...profile, port: 0 }], [{ ...profile, port: 65_536 }], [{ ...profile, pollIntervalSeconds: 14 }],
    [{ ...profile, pollIntervalSeconds: 3_601 }], [{ ...profile, host: '' }], [{ ...profile, username: '' }],
  ])('rejects profile boundaries', (value) => expect(() => validateMailConnectorSettings(value)).toThrow('Invalid Mail'));
  it.each([
    [{ ...profile, password: 'marker-secret' }], [{ ...profile, access_token: 'marker-secret' }],
    [{ ...profile, nested: { authorization: 'marker-secret' } }],
  ])('rejects credential-shaped fields at any depth', (value) => expect(() => validateMailConnectorSettings(value)).toThrow('Credential-shaped'));
});
