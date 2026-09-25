import type {
  JevChoiceAnswer,
  JevDecisionAnswer,
  JevDecisionRequest,
  JevScoreAnswer,
  PerceptionDecisionPort,
} from '../../../types/perception';
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  choice,
  noul,
  score,
  TypeSafeClient,
} from '@typesafe-ai/sdk';
import type { EntryType } from '@typesafe-ai/sdk';

export const JEV_CATALOG_VERSION = '1.0' as const;
export const JEV_DECISION_TIMEOUT_MS = 10_000;
const SCORE_KEYS = ['low', 'medium', 'high'] as const;
const ANSWER_KEYS = ['delivery_mode', 'needs_user_attention', 'needs_hitl', 'retain_as_evidence', 'risk', 'route_target', 'urgency'];
const CHOICE_FEEDBACK_QUESTION = 'Is the latest user message related to the pending request to choose a target capability for the original event? Answer true for a complete selection, partial preference, uncertainty, or a question asking to clarify the choices, even when no option is named exactly. Answer false only for a clearly unrelated new request.';
const CHOICE_FEEDBACK_CRITERIA = { true: 'Continue the pending target-choice conversation; the choice may still need clarification.', false: 'This is an unrelated new request and must be routed as a new event.' };

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
  constructor(readonly code: JevErrorCode, readonly diagnosticCode?: string) {
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
  private readonly client: TypeSafeClient;
  private readonly hostname: string;
  private readonly resolveHostname: NonNullable<JevAdapterOptions['resolveHostname']>;
  private readonly timeoutMs: number;

  constructor(private readonly options: JevAdapterOptions) {
    const baseUrl = normalizeJevBaseUrl(options.baseUrl, options);
    this.hostname = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    this.resolveHostname = options.resolveHostname ?? resolveHostname;
    this.timeoutMs = Math.min(options.timeoutMs ?? JEV_DECISION_TIMEOUT_MS, JEV_DECISION_TIMEOUT_MS);
    const fetcher = options.fetch ?? fetch;
    this.client = new TypeSafeClient({
      apiKey: options.apiKey,
      baseURL: baseUrl,
      defaultModel: options.model,
      timeout: this.timeoutMs,
      logLevel: 'off',
      retry: {
        maxRetries: 1,
        backoffInitialMs: options.retryDelayMs ?? 100,
        backoffMaxMs: options.retryDelayMs ?? 100,
        backoffJitter: 0,
        httpStatuses: new Set([429, 529]),
        respectRetryAfter: false,
        apiConnectionError: true,
        apiTimeoutError: false,
      },
      fetch: (input, init) => fetcher(input, { ...init, redirect: 'error' }),
    });
  }

  async decide(request: JevDecisionRequest): Promise<JevDecisionAnswer> {
    return this.execute(
      (remaining) => this.client.systemOne(buildJevRequest(request), { signal: AbortSignal.timeout(remaining), timeout: remaining }),
      (response) => parseJevResponse(response, request.candidateKeys, request.pendingChoiceFeedback),
      { pendingChoiceFeedback: request.pendingChoiceFeedback === true, candidateCount: request.candidateKeys.length },
    );
  }

  async classifyPendingChoiceFeedback(request: JevDecisionRequest): Promise<number> {
    return this.execute(
      (remaining) => this.client.systemOne(buildJevChoiceFeedbackRequest(request), { signal: AbortSignal.timeout(remaining), timeout: remaining }),
      parseJevChoiceFeedback,
      { pendingChoiceFeedback: true, candidateCount: request.candidateKeys.length },
    );
  }

  private async execute<T>(
    call: (remaining: number) => Promise<unknown>,
    parse: (response: unknown) => T,
    diagnostic: { pendingChoiceFeedback: boolean; candidateCount: number },
  ): Promise<T> {
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
    const remaining = this.timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) throw new JevError('JEV_TIMEOUT');
    let response: unknown;
    try {
      response = await call(remaining);
      return parse(response);
    } catch (error) {
      if (error instanceof JevError) {
        if (error.code === 'JEV_INVALID_RESPONSE') console.info('[jev-decision] invalid response shape', { ...responseShape(response), diagnosticCode: error.diagnosticCode, ...diagnostic });
        throw error;
      }
      if (isJevTimeoutError(error)) throw new JevError('JEV_TIMEOUT');
      if (error instanceof APIConnectionError) throw new JevError('JEV_NETWORK_ERROR');
      if (error instanceof APIError) throw new JevError(httpErrorCode(error.status));
      throw new JevError('JEV_INVALID_RESPONSE');
    }
  }
}

export function buildJevChoiceFeedbackRequest(request: JevDecisionRequest) {
  return {
    state: toJevState(request.state),
    questions: { is_choice_feedback: noul(CHOICE_FEEDBACK_QUESTION, CHOICE_FEEDBACK_CRITERIA) },
  };
}

export function buildJevRequest(request: JevDecisionRequest) {
  const routeTargetKeys = request.candidateKeys.filter((key) => key !== 'ignore' && key !== 'notify_user');
  return {
    state: toJevState(request.state),
    questions: {
      needs_user_attention: noul('Does this event require the user to be made aware of it?', { true: 'The event needs user awareness or follow-up.', false: 'The event does not need user awareness or follow-up.' }),
      delivery_mode: choice('If user awareness is needed, choose whether this event only needs a notification or needs a target capability to handle it. A target capability reply is itself the user-facing response; messages containing a request or question should use invoke_target.', {
        notify_user: 'Only notify the user. No domain-specific response or target action is needed.',
        invoke_target: 'Delegate to one authorized target capability to answer or act; its response fulfills user awareness. Use for messages containing a request or question.',
      }),
      route_target: choice('If delegation is appropriate, choose the single authorized target capability best suited to handle this event. Choose ask_user_to_choose_target when the user should decide the role or capability, including an explicit request to switch assistants without naming the replacement. Respect optional userCognitiveGuidance in state as the user-provided routing guidance.', Object.fromEntries(routeTargetKeys.map((key) => [key, toJevEntry(request.candidateCriteria?.[key] ?? null)]))),
      urgency: score('How urgent is this event?', [...SCORE_KEYS] as [string, string, string]),
      risk: score('How risky is it to act on this event automatically?', [...SCORE_KEYS] as [string, string, string]),
      needs_hitl: noul('Does this event require human review before any action?', { true: 'Human review is required before acting.', false: 'Human review is not required before acting.' }),
      retain_as_evidence: noul('Should this event be retained as evidence for later review?', { true: 'Retain this event as evidence.', false: 'No special evidence retention is needed.' }),
      ...(request.pendingChoiceFeedback ? {
        is_choice_feedback: noul(CHOICE_FEEDBACK_QUESTION, CHOICE_FEEDBACK_CRITERIA),
      } : {}),
    },
  };
}

export function parseJevChoiceFeedback(value: unknown): number {
  const answers = record(record(value)['answers']);
  return parseAnswer('is_choice_feedback', () => noulAnswer(answers['is_choice_feedback']));
}

function toJevState(value: JevDecisionRequest['state']): EntryType {
  if (typeof value === 'number' || typeof value === 'boolean') throw new JevError('JEV_INVALID_REQUEST');
  return value as EntryType;
}

function toJevEntry(value: JevDecisionRequest['state']): EntryType {
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : value as EntryType;
}

export function parseJevResponse(value: unknown, candidateKeys: readonly string[], pendingChoiceFeedback = false): JevDecisionAnswer {
  const root = record(value);
  const answers = record(root['answers']);
  if (!hasKeys(answers, pendingChoiceFeedback ? [...ANSWER_KEYS, 'is_choice_feedback'] : ANSWER_KEYS)) throw new JevError('JEV_INVALID_RESPONSE', 'missing_answer');
  const routeTarget = parseAnswer('route_target', () => choiceAnswer(answers['route_target'], candidateKeys.filter((key) => key !== 'ignore' && key !== 'notify_user')));
  const urgency = parseAnswer('urgency', () => scoreAnswer(answers['urgency']));
  const risk = parseAnswer('risk', () => scoreAnswer(answers['risk']));
  return {
    ...(typeof root['model'] === 'string' ? { providerModel: root['model'] } : {}),
    routeTarget,
    needsUserAttention: parseAnswer('needs_user_attention', () => noulAnswer(answers['needs_user_attention'])),
    deliveryMode: parseAnswer('delivery_mode', () => choiceAnswer(answers['delivery_mode'], ['notify_user', 'invoke_target'])),
    urgency,
    risk,
    needsHitl: parseAnswer('needs_hitl', () => noulAnswer(answers['needs_hitl'])),
    retainAsEvidence: parseAnswer('retain_as_evidence', () => noulAnswer(answers['retain_as_evidence'])),
    ...(pendingChoiceFeedback ? { isChoiceFeedback: parseAnswer('is_choice_feedback', () => noulAnswer(answers['is_choice_feedback'])) } : {}),
  };
}

function parseAnswer<T>(field: string, parse: () => T): T {
  try { return parse(); }
  catch (error) {
    if (error instanceof JevError && error.code === 'JEV_INVALID_RESPONSE') throw new JevError('JEV_INVALID_RESPONSE', field);
    throw error;
  }
}

function choiceAnswer(value: unknown, keys: readonly string[]): JevChoiceAnswer {
  const answer = record(value);
  if (answer['type'] !== 'choice' || typeof answer['choice'] !== 'string' || !keys.includes(answer['choice'])) throw new JevError('JEV_INVALID_RESPONSE');
  return { choice: answer['choice'], confidence: probability(answer['confidence']), probabilities: distribution(answer['probabilities'], keys) };
}

function scoreAnswer(value: unknown): JevScoreAnswer {
  const answer = record(value);
  const maximum = SCORE_KEYS.length - 1;
  if (answer['type'] !== 'score' || typeof answer['score'] !== 'number' || !Number.isFinite(answer['score']) || answer['score'] < 0 || answer['score'] > maximum) {
    throw new JevError('JEV_INVALID_RESPONSE');
  }
  return {
    score: answer['score'] / maximum,
    confidence: probability(answer['confidence']),
    probabilities: distribution(answer['probabilities'], SCORE_KEYS.map((_, index) => String(index)), SCORE_KEYS),
  };
}

function noulAnswer(value: unknown): number {
  const answer = record(value);
  if (answer['type'] !== 'noul') throw new JevError('JEV_INVALID_RESPONSE');
  return probability(answer['noul']);
}

function distribution(value: unknown, wireKeys: readonly string[], outputKeys = wireKeys): Record<string, number> {
  const probabilities = record(value);
  if (wireKeys.length !== outputKeys.length || Object.keys(probabilities).some((key) => !wireKeys.includes(key))) throw new JevError('JEV_INVALID_RESPONSE');
  const result: Record<string, number> = {};
  let sum = 0;
  for (const [index, key] of wireKeys.entries()) {
    // The provider can omit zero-probability options in a sparse distribution.
    const item = probability(probabilities[key] ?? 0);
    result[outputKeys[index]!] = item;
    sum += item;
  }
  if (Math.abs(sum - 1) > 0.02) throw new JevError('JEV_INVALID_RESPONSE');
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value / sum]));
}

function probability(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new JevError('JEV_INVALID_RESPONSE');
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new JevError('JEV_INVALID_RESPONSE');
  return value as Record<string, unknown>;
}

function responseShape(value: unknown): Record<string, unknown> {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const answerValue = root?.['answers'];
  const answers = answerValue && typeof answerValue === 'object' && !Array.isArray(answerValue) ? answerValue as Record<string, unknown> : undefined;
  return {
    rootType: Array.isArray(value) ? 'array' : typeof value,
    answerKeys: answers ? Object.keys(answers).sort() : [],
    routeTarget: answerShape(answers?.['route_target']),
    deliveryMode: answerShape(answers?.['delivery_mode']),
    urgency: answerShape(answers?.['urgency']),
    risk: answerShape(answers?.['risk']),
  };
}

function answerShape(value: unknown): Record<string, unknown> {
  const answer = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const probabilityValue = answer?.['probabilities'];
  const probabilities = probabilityValue && typeof probabilityValue === 'object' && !Array.isArray(probabilityValue) ? probabilityValue as Record<string, unknown> : undefined;
  const values = probabilities ? Object.values(probabilities) : [];
  const numericValues = values.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return {
    type: typeof answer?.['type'] === 'string' ? answer['type'] : typeof answer?.['type'],
    probabilityCount: values.length,
    probabilitySum: numericValues.length === values.length ? numericValues.reduce((sum, item) => sum + item, 0) : undefined,
  };
}

function hasKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.hasOwn(value, key));
}

function httpErrorCode(status: number): JevErrorCode {
  if (status === 401 || status === 403) return 'JEV_UNAUTHORIZED';
  if (status === 400 || status === 422) return 'JEV_INVALID_REQUEST';
  if (status === 429) return 'JEV_RATE_LIMITED';
  if (status === 529) return 'JEV_OVERLOADED';
  return 'JEV_NETWORK_ERROR';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === 'AbortError' || error.name === 'TimeoutError' : false;
}

function isJevTimeoutError(error: unknown): boolean {
  if (error instanceof APITimeoutError || error instanceof APIUserAbortError || isAbortError(error)) return true;
  return error instanceof APIConnectionError && (error.cause instanceof APIUserAbortError || isAbortError(error.cause));
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
