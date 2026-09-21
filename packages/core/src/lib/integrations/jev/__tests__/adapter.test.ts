import { describe, expect, it, vi } from 'vitest';
import type { JevDecisionRequest, PerceptionTriggerRule } from '../../../../types/perception';
import { JevError, JevHttpAdapter, buildJevRequest, normalizeJevBaseUrl, parseJevResponse } from '..';

const request: JevDecisionRequest = {
  state: { source: 'email' },
  candidateKeys: ['ignore', 'project:one'],
  catalogVersion: '1.0',
};
const answers = {
  route_target: { choice: 'project:one', confidence: 0.9, probabilities: { ignore: 0.1, 'project:one': 0.9 } },
  urgency: { score: 0.8, confidence: 0.7, probabilities: { low: 0.1, medium: 0.2, high: 0.7 } },
  risk: { score: 0.2, confidence: 0.8, probabilities: { low: 0.8, medium: 0.1, high: 0.1 } },
  needs_hitl: { noul: 0.1 },
  retain_as_evidence: { noul: 0.6 },
};

function response(status = 200, body: unknown = { model: 'jev-test', answers }): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function adapter(fetcher: typeof fetch, overrides: Partial<ConstructorParameters<typeof JevHttpAdapter>[0]> = {}) {
  return new JevHttpAdapter({
    baseUrl: 'https://jev.example.test', model: 'jev-test', apiKey: 'test-key', fetch: fetcher,
    resolveHostname: async () => ['203.0.113.10'], retryDelayMs: 0, ...overrides,
  });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'JevError', code });
}

describe('JevHttpAdapter', () => {
  it('posts the fixed five-question catalog and parses a valid response', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    await expect(adapter(fetcher).decide(request)).resolves.toMatchObject({
      providerModel: 'jev-test', routeTarget: { choice: 'project:one', confidence: 0.9 }, needsHitl: 0.1,
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://jev.example.test/v1/systemone');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(JSON.parse(String(init?.body))).toEqual(buildJevRequest('jev-test', request));
  });

  it.each([[401, 'JEV_UNAUTHORIZED'], [422, 'JEV_INVALID_REQUEST']])('maps HTTP %s safely', async (status, code) => {
    await expectCode(adapter(vi.fn<typeof fetch>(async () => response(status))).decide(request), code);
  });

  it.each([[429, 'JEV_RATE_LIMITED'], [529, 'JEV_OVERLOADED']])('retries HTTP %s once within the deadline', async (status, code) => {
    const fetcher = vi.fn<typeof fetch>(async () => response(status));
    await expectCode(adapter(fetcher).decide(request), code);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('maps aborts and network failures without exposing provider errors', async () => {
    await expectCode(adapter(vi.fn<typeof fetch>(async () => { throw new DOMException('secret', 'AbortError'); })).decide(request), 'JEV_TIMEOUT');
    await expectCode(adapter(vi.fn<typeof fetch>(async () => { throw new Error('secret'); })).decide(request), 'JEV_NETWORK_ERROR');
  });

  it.each([
    ['private IPv4', ['10.1.2.3']],
    ['loopback IPv4', ['127.0.0.1']],
    ['private IPv6', ['fd00::1']],
    ['loopback IPv6', ['::1']],
    ['mixed public and private addresses', ['203.0.113.10', '192.168.1.2']],
  ])('rejects a public hostname resolving to %s', async (_name, addresses) => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    await expectCode(adapter(fetcher, { resolveHostname: async () => addresses }).decide(request), 'JEV_INVALID_BASE_URL');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows a public resolved address', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    await expect(adapter(fetcher, { resolveHostname: async () => ['2606:4700:4700::1111'] }).decide(request)).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe('Jev response validation', () => {
  it.each([
    ['catalog choice', { ...answers, route_target: { ...answers.route_target, choice: 'invented' } }],
    ['missing probability', { ...answers, route_target: { ...answers.route_target, probabilities: { ignore: 1 } } }],
    ['NaN', { ...answers, route_target: { ...answers.route_target, confidence: Number.NaN } }],
    ['out of range', { ...answers, needs_hitl: { noul: 1.1 } }],
    ['invalid sum', { ...answers, risk: { ...answers.risk, probabilities: { low: 0.2, medium: 0.2, high: 0.2 } } }],
  ])('rejects %s', (_name, invalid) => {
    expect(() => parseJevResponse({ answers: invalid }, request.candidateKeys)).toThrowError(
      expect.objectContaining<Partial<JevError>>({ code: 'JEV_INVALID_RESPONSE' }),
    );
  });
});

describe('Jev baseUrl boundary', () => {
  it('accepts public production HTTPS and normalizes a trailing slash', () => {
    expect(normalizeJevBaseUrl('https://jev.example.test/')).toBe('https://jev.example.test');
  });

  it.each([
    'http://jev.example.test', 'file:///tmp/jev', 'https://user:secret@jev.example.test',
    'https://127.0.0.1', 'https://10.0.0.1', 'https://172.16.0.1', 'https://192.168.0.1',
    'https://169.254.1.1', 'https://[::1]', 'https://service.local',
    'https://[::ffff:127.0.0.1]', 'https://[::ffff:10.0.0.1]',
  ])('rejects an unsafe production URL: %s', (url) => {
    expect(() => normalizeJevBaseUrl(url)).toThrowError(expect.objectContaining<Partial<JevError>>({ code: 'JEV_INVALID_BASE_URL' }));
  });

  it('allows loopback only through the explicit development exception', () => {
    expect(normalizeJevBaseUrl('http://localhost:3000/', { environment: 'development', allowDevelopmentLoopback: true }))
      .toBe('http://localhost:3000');
    expect(() => normalizeJevBaseUrl('http://localhost:3000', { environment: 'development' })).toThrow();
  });

  it('does not resolve an explicitly allowed development loopback host', async () => {
    const resolveHostname = vi.fn(async () => ['127.0.0.1']);
    const fetcher = vi.fn<typeof fetch>(async () => response());
    await new JevHttpAdapter({
      baseUrl: 'http://localhost:3000', model: 'jev-test', apiKey: 'test-key', environment: 'development',
      allowDevelopmentLoopback: true, resolveHostname, fetch: fetcher,
    }).decide(request);
    expect(resolveHostname).not.toHaveBeenCalled();
  });
});

const historicalDirectRule = {
  id: 'legacy', enabled: true, sources: ['email'], eventTypes: ['mail.received'], conditions: [],
  target: { kind: 'project', id: 'project-one' }, execution: { requireHitl: false, maxAttempts: 1 },
  createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z',
} satisfies PerceptionTriggerRule;
void historicalDirectRule;
