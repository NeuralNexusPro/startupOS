import type {
  SolutionContractCheckResponse,
  SolutionContractPublishResponse,
  SolutionContractReadResponse,
  SolutionContractRevokeResponse,
  SolutionContractTransportResponse,
} from './solution-execution-contract-contract';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const ACTOR_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const MAX_REVOCATION_REASON_LENGTH = 500;

export interface SolutionContractClientRef {
  readonly actorId: string;
  readonly projectId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
}

export interface RevokeSolutionContractClientInput extends SolutionContractClientRef {
  readonly contractId: string;
  readonly reason: string;
}

export type SolutionContractFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type Fetcher = SolutionContractFetcher;

function clientFailure<T>(
  category: 'authorization' | 'validation' | 'internal',
  code: string,
  message: string,
  retryable = false
): SolutionContractTransportResponse<T> {
  return {
    success: false,
    error: { category, code, message, retryable },
  };
}

function validateRef<T>(
  input: SolutionContractClientRef
): SolutionContractTransportResponse<T> | null {
  if (!ACTOR_IDENTIFIER.test(input.actorId.trim())) {
    return clientFailure(
      'authorization',
      'ACTOR_REQUIRED',
      '需要有效的 OriginOS 操作身份'
    );
  }
  const identifiers = [
    input.projectId,
    input.solutionId,
    input.solutionVersion,
  ];
  if (
    identifiers.some((value) => !IDENTIFIER.test(value) || value.includes('..'))
  ) {
    return clientFailure(
      'validation',
      'INVALID_REQUEST',
      '项目、方案或版本标识格式无效'
    );
  }
  return null;
}

function isTransportResponse(
  value: unknown
): value is SolutionContractTransportResponse<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record['success'] === true) {
    return 'data' in record;
  }
  if (record['success'] !== false) {
    return false;
  }
  const error = record['error'];
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    !Array.isArray(error) &&
    typeof (error as Record<string, unknown>)['category'] === 'string' &&
    typeof (error as Record<string, unknown>)['code'] === 'string' &&
    typeof (error as Record<string, unknown>)['message'] === 'string' &&
    typeof (error as Record<string, unknown>)['retryable'] === 'boolean'
  );
}

function endpoint(input: SolutionContractClientRef): string {
  return (
    `/api/projects/${encodeURIComponent(input.projectId)}` +
    `/solutions/contracts/${encodeURIComponent(input.solutionId)}` +
    `/${encodeURIComponent(input.solutionVersion)}`
  );
}

async function invoke<T>(
  input: SolutionContractClientRef,
  suffix: string,
  init: RequestInit,
  fetcher: Fetcher
): Promise<SolutionContractTransportResponse<T>> {
  const invalid = validateRef<T>(input);
  if (invalid) {
    return invalid;
  }
  try {
    const response = await fetcher(`${endpoint(input)}${suffix}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        'x-originos-actor-id': input.actorId.trim(),
        ...(init.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
      },
    });
    const parsed: unknown = await response.json();
    if (!isTransportResponse(parsed)) {
      return clientFailure(
        'internal',
        'INVALID_RESPONSE',
        '执行契约服务返回了无效响应',
        true
      );
    }
    return parsed as SolutionContractTransportResponse<T>;
  } catch {
    return clientFailure(
      'internal',
      'TRANSPORT_UNAVAILABLE',
      '无法连接执行契约服务',
      true
    );
  }
}

export function checkSolutionExecutionContract(
  input: SolutionContractClientRef,
  fetcher: Fetcher = fetch
): Promise<SolutionContractCheckResponse> {
  return invoke(input, '/check', { method: 'POST' }, fetcher);
}

export function publishSolutionExecutionContract(
  input: SolutionContractClientRef,
  fetcher: Fetcher = fetch
): Promise<SolutionContractPublishResponse> {
  return invoke(input, '/publish', { method: 'POST' }, fetcher);
}

export function readSolutionExecutionContract(
  input: SolutionContractClientRef,
  fetcher: Fetcher = fetch
): Promise<SolutionContractReadResponse> {
  return invoke(input, '', { method: 'GET' }, fetcher);
}

export function revokeSolutionExecutionContract(
  input: RevokeSolutionContractClientInput,
  fetcher: Fetcher = fetch
): Promise<SolutionContractRevokeResponse> {
  const contractId = input.contractId.trim();
  const reason = input.reason.trim();
  if (
    !IDENTIFIER.test(contractId) ||
    contractId.includes('..') ||
    reason.length === 0 ||
    reason.length > MAX_REVOCATION_REASON_LENGTH
  ) {
    return Promise.resolve(
      clientFailure(
        'validation',
        'INVALID_REQUEST',
        'contractId 或撤销原因格式无效'
      )
    );
  }
  return invoke(
    input,
    '/revoke',
    {
      method: 'POST',
      body: JSON.stringify({ contractId, reason }),
    },
    fetcher
  );
}
