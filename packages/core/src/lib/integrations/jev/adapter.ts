import type {
  JevChoiceAnswer,
  JevDecisionAnswer,
  JevDecisionRequest,
  JevScoreAnswer,
  PerceptionDecisionPort,
} from '../../../types/perception';

export const JEV_CATALOG_VERSION = '1.0' as const;
export const JEV_DECISION_TIMEOUT_MS = 3_000;
const SCORE_KEYS = ['low', 'medium', 'high'] as const;
const ANSWER_KEYS = ['needs_hitl', 'retain_as_evidence', 'risk', 'route_target', 'urgency'];

export type JevErrorCode =
  | 'JEV_INVALID_BASE_URL'
  | 'JEV_UNAUTHORIZED'
  | 'JEV_INVALID_REQUEST'
  | 'JEV_RATE_LIMITED'
  | 'JEV_OVERLOADED'
  | 'JEV_TIMEOUT'
  | 'JEV_NETWORK_ERROR'
  | 'JEV_INVALID_RESPONSE';

export class JevError extends Error {
  constructor(readonly code: JevErrorCode) {
    super(code);
    this.name = 'JevError';
  }
}

export interface JevAdapterOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  environment?: 'development' | 'production';
  allowDevelopmentLoopback?: boolean;
  fetch?: typeof fetch;
  resolveHostname?: (hostname: string) => Promise<readonly string[]>;
  timeoutMs?: number;
  retryDelayMs?: number;
}

export function normalizeJevBaseUrl(
  value: string,
  options: Pick<JevAdapterOptions, 'environment' | 'allowDevelopmentLoopback'> = {},
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new JevError('JEV_INVALID_BASE_URL');
  }
  const environment = options.environment ?? 'production';
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = isLoopback(hostname);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || isPrivateHost(hostname)) {
    throw new JevError('JEV_INVALID_BASE_URL');
  }
  if (environment === 'production' && url.protocol !== 'https:') throw new JevError('JEV_INVALID_BASE_URL');
  if (loopback && !(environment === 'development' && options.allowDevelopmentLoopback)) {
    throw new JevError('JEV_INVALID_BASE_URL');
  }
  return url.toString().replace(/\/$/, '');
}

export class JevHttpAdapter implements PerceptionDecisionPort {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly hostname: string;
  private readonly resolveHostname: NonNullable<JevAdapterOptions['resolveHostname']>;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(private readonly options: JevAdapterOptions) {
    const baseUrl = normalizeJevBaseUrl(options.baseUrl, options);
    this.endpoint = `${baseUrl}/v1/systemone`;
    this.hostname = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    this.fetcher = options.fetch ?? fetch;
    this.resolveHostname = options.resolveHostname ?? resolveHostname;
    this.timeoutMs = Math.min(options.timeoutMs ?? JEV_DECISION_TIMEOUT_MS, JEV_DECISION_TIMEOUT_MS);
    this.retryDelayMs = options.retryDelayMs ?? 100;
  }

  async decide(request: JevDecisionRequest): Promise<JevDecisionAnswer> {
    const startedAt = Date.now();
    if (!(this.options.environment === 'development' && this.options.allowDevelopmentLoopback && isLoopback(this.hostname))) {
      let addresses: readonly string[];
      try {
        addresses = await within(this.resolveHostname(this.hostname), this.timeoutMs);
      } catch (error) {
        if (error instanceof JevError) throw error;
        if (isAbortError(error)) throw new JevError('JEV_TIMEOUT');
        throw new JevError('JEV_NETWORK_ERROR');
      }
      if (addresses.length === 0) throw new JevError('JEV_NETWORK_ERROR');
      if (addresses.some((address) => isLoopback(address) || isPrivateHost(address))) {
        throw new JevError('JEV_INVALID_BASE_URL');
      }
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = this.timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) throw new JevError('JEV_TIMEOUT');
      let response: Response;
      try {
        response = await this.fetcher(this.endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${this.options.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(buildJevRequest(this.options.model, request)),
          signal: AbortSignal.timeout(remaining),
          redirect: 'error',
        });
      } catch (error) {
        if (isAbortError(error)) throw new JevError('JEV_TIMEOUT');
        throw new JevError('JEV_NETWORK_ERROR');
      }

      if ((response.status === 429 || response.status === 529) && attempt === 0) {
        const waitMs = Math.min(this.retryDelayMs, this.timeoutMs - (Date.now() - startedAt));
        if (waitMs > 0) await wait(waitMs);
        continue;
      }
      if (!response.ok) throw new JevError(httpErrorCode(response.status));
      try {
        return parseJevResponse(await response.json(), request.candidateKeys);
      } catch (error) {
        if (error instanceof JevError) throw error;
        throw new JevError('JEV_INVALID_RESPONSE');
      }
    }
    throw new JevError('JEV_TIMEOUT');
  }
}

export function buildJevRequest(model: string, request: JevDecisionRequest) {
  return {
    state: request.state,
    model,
    catalogVersion: request.catalogVersion,
    questions: [
      { key: 'route_target', type: 'Choice', criteria: request.candidateKeys },
      { key: 'urgency', type: 'Score', criteria: SCORE_KEYS },
      { key: 'risk', type: 'Score', criteria: SCORE_KEYS },
      { key: 'needs_hitl', type: 'Noul' },
      { key: 'retain_as_evidence', type: 'Noul' },
    ],
  };
}

export function parseJevResponse(value: unknown, candidateKeys: readonly string[]): JevDecisionAnswer {
  const root = record(value);
  const answers = record(root['answers']);
  if (!sameKeys(answers, ANSWER_KEYS)) throw new JevError('JEV_INVALID_RESPONSE');
  const routeTarget = choiceAnswer(answers['route_target'], candidateKeys);
  const urgency = scoreAnswer(answers['urgency']);
  const risk = scoreAnswer(answers['risk']);
  return {
    ...(typeof root['model'] === 'string' ? { providerModel: root['model'] } : {}),
    routeTarget,
    urgency,
    risk,
    needsHitl: noulAnswer(answers['needs_hitl']),
    retainAsEvidence: noulAnswer(answers['retain_as_evidence']),
  };
}

function choiceAnswer(value: unknown, keys: readonly string[]): JevChoiceAnswer {
  const answer = record(value);
  if (typeof answer['choice'] !== 'string' || !keys.includes(answer['choice'])) throw new JevError('JEV_INVALID_RESPONSE');
  return { choice: answer['choice'], confidence: probability(answer['confidence']), probabilities: distribution(answer['probabilities'], keys) };
}

function scoreAnswer(value: unknown): JevScoreAnswer {
  const answer = record(value);
  if (typeof answer['score'] !== 'number' || !Number.isFinite(answer['score']) || answer['score'] < 0 || answer['score'] > 1) {
    throw new JevError('JEV_INVALID_RESPONSE');
  }
  return { score: answer['score'], confidence: probability(answer['confidence']), probabilities: distribution(answer['probabilities'], SCORE_KEYS) };
}

function noulAnswer(value: unknown): number {
  const answer = record(value);
  return probability(answer['noul']);
}

function distribution(value: unknown, keys: readonly string[]): Record<string, number> {
  const probabilities = record(value);
  if (!sameKeys(probabilities, [...keys])) throw new JevError('JEV_INVALID_RESPONSE');
  const result: Record<string, number> = {};
  let sum = 0;
  for (const key of keys) {
    const item = probability(probabilities[key]);
    result[key] = item;
    sum += item;
  }
  if (Math.abs(sum - 1) > 1e-6) throw new JevError('JEV_INVALID_RESPONSE');
  return result;
}

function probability(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new JevError('JEV_INVALID_RESPONSE');
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new JevError('JEV_INVALID_RESPONSE');
  return value as Record<string, unknown>;
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function httpErrorCode(status: number): JevErrorCode {
  if (status === 401) return 'JEV_UNAUTHORIZED';
  if (status === 422) return 'JEV_INVALID_REQUEST';
  if (status === 429) return 'JEV_RATE_LIMITED';
  if (status === 529) return 'JEV_OVERLOADED';
  return 'JEV_NETWORK_ERROR';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' || error.name === 'TimeoutError' : false;
}

function isLoopback(hostname: string): boolean {
  const mapped = mappedIpv4(hostname);
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || hostname.startsWith('127.')
    || mapped !== undefined && mapped.startsWith('127.');
}

function isPrivateHost(hostname: string): boolean {
  if (isLoopback(hostname)) return false;
  if (hostname.endsWith('.local')) return true;
  if (hostname === '::' || hostname.startsWith('fe8') || hostname.startsWith('fe9') || hostname.startsWith('fea') || hostname.startsWith('feb') || hostname.startsWith('fc') || hostname.startsWith('fd')) return true;
  const octets = (mappedIpv4(hostname) ?? hostname).split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = octets as [number, number, number, number];
  return first === 0 || first === 10 || first === 100 && second >= 64 && second <= 127 || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168;
}

function mappedIpv4(hostname: string): string | undefined {
  if (!hostname.startsWith('::ffff:')) return undefined;
  const parts = hostname.slice(7).split(':');
  if (parts.length !== 2) return undefined;
  const high = Number.parseInt(parts[0] ?? '', 16);
  const low = Number.parseInt(parts[1] ?? '', 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) return undefined;
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveHostname(hostname: string): Promise<string[]> {
  const { lookup } = await import('node:dns/promises');
  return (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);
}

function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new DOMException('Timed out', 'TimeoutError')), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error: unknown) => { clearTimeout(timeout); reject(error); },
    );
  });
}
