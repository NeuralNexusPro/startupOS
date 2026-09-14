import { describe, expect, it, vi } from 'vitest';
import { createPluginSdkLogger, sanitizePluginLog } from '../plugins';

describe('plugin logging boundaries', () => {
  it('retains safe cause categories/status and excludes credentials, body, paths and arbitrary fields', () => {
    const error = Object.assign(new Error('HTTP 402: token=super-secret body=private-message https://user:secret@host/?key=value'), {
      cause: Object.assign(new Error('getaddrinfo ENOTFOUND token=secret'), { code: 'ENOTFOUND', request: { body: 'private' } }),
      response: { body: 'private' },
    });
    const output = JSON.stringify(sanitizePluginLog({ level: 'error', stage: 'prompt', error }));
    expect(output).toContain('402'); expect(output).toContain('ENOTFOUND');
    for (const secret of ['super-secret', 'private-message', 'user:secret', 'key=value', 'request', 'response']) expect(output).not.toContain(secret);
  });
  it('handles cyclic causes and SDK raw strings without serializing bodies', () => {
    const write = vi.fn(); const error = new Error('ENOTFOUND private'); Object.assign(error, { cause: error });
    const logger = createPluginSdkLogger({ write: record => write(sanitizePluginLog(record)) });
    logger.error(error); logger.info('body: private'); logger.error('HTTP 401: secret');
    expect(JSON.stringify(write.mock.calls)).not.toContain('private');
    expect(JSON.stringify(write.mock.calls)).toContain('401');
    expect(JSON.stringify(write.mock.calls).length).toBeLessThan(3000);
  });
  it('rejects forged path metadata and isolates broken sinks', () => {
    expect(sanitizePluginLog({ level: 'info', stage: '../injected?token=secret' }).stage).toBe('unknown');
    expect(() => createPluginSdkLogger({ write: () => { throw new Error('disk'); } }).error('secret')).not.toThrow();
  });
});
