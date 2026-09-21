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
  it('retains bounded decision diagnostics without event content', () => {
    const output = sanitizePluginLog({
      level: 'info', stage: 'decision.completed',
      decision: { phase: 'completed', decisionId: 'decision-1', candidateKeys: ['鹰眼', '../unsafe'], routeTarget: '鹰眼', routeConfidence: 0.81, routeProbabilities: { '鹰眼': 0.81, unsafe: 2 } },
    });
    expect(output).toMatchObject({ decision: { phase: 'completed', candidateKeys: ['鹰眼'], routeProbabilities: { '鹰眼': 0.81 } } });
  });
});


it('handles Lark LoggerProxy arrays with bounded traversal and no SDK payload serialization', () => {
  const write = vi.fn();
  const logger = createPluginSdkLogger({ write: record => write(sanitizePluginLog(record)) });
  logger.error([[Object.assign(new Error('ENOTFOUND secret-body'), { code: 'ENOTFOUND' })]]);
  expect(write.mock.calls[0]?.[0]).toMatchObject({ safeCode: 'ENOTFOUND', error: { code: 'ENOTFOUND', reason: 'ENOTFOUND' } });
  logger.error([['[ws]', ['HTTP 401: password=secret-body']], { body: 'secret-body' }]);
  expect(write.mock.calls[1]?.[0]).toMatchObject({ error: { status: 401 } });
  const cyclic: unknown[] = []; cyclic.push(cyclic);
  expect(() => logger.error(cyclic)).not.toThrow();
  const large = new Array<unknown>(100000); large[0] = 'HTTP 429';
  Object.defineProperty(large, 33, { get: () => { throw new Error('must not visit'); } });
  expect(() => logger.error(large)).not.toThrow();
  expect(write.mock.calls[3]?.[0]).toMatchObject({ error: { status: 429 } });
  expect(JSON.stringify(write.mock.calls)).not.toContain('secret-body');
});
