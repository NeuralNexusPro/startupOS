import { ProjectSolutionDesignSource } from '@originos/core/lib/features/project';
import {
  SolutionContractPublishingError,
  SolutionExecutionContractPublishingService,
  SolutionExecutionContractStore,
  type ContractRef,
  type PublishedSolutionExecutionContract,
  type PublishSolutionExecutionContractResult,
  type SolutionContractCompilationResult,
  type SolutionContractPublishingErrorCategory,
  type SolutionVersionRef,
} from '@originos/core/lib/features/solution';
import { getDataRoot } from '@originos/core/lib/paths';

import type {
  SolutionContractTransportError,
  SolutionContractTransportResponse,
} from './solution-execution-contract-contract';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const ACTOR_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const MAX_REVOCATION_REASON_LENGTH = 500;

export interface SolutionContractRouteParams {
  readonly projectId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
}

export interface SolutionContractPublishingPort {
  check(input: SolutionVersionRef): Promise<SolutionContractCompilationResult>;
  publish(
    input: SolutionVersionRef
  ): Promise<PublishSolutionExecutionContractResult>;
  read(input: SolutionVersionRef): Promise<PublishedSolutionExecutionContract>;
  revoke(
    input: ContractRef & { readonly reason: string }
  ): Promise<PublishedSolutionExecutionContract>;
}

export interface RevokeSolutionContractBody {
  readonly contractId: string;
  readonly reason: string;
}

export function createSolutionExecutionContractPublishingService(): SolutionContractPublishingPort {
  const dataRoot = getDataRoot();
  return new SolutionExecutionContractPublishingService(
    new ProjectSolutionDesignSource(dataRoot),
    new SolutionExecutionContractStore(dataRoot)
  );
}

export function validateTransportActor(
  actorId: string | null
): SolutionContractTransportError | null {
  const normalized = actorId?.trim() ?? '';
  if (!ACTOR_IDENTIFIER.test(normalized)) {
    return {
      category: 'authorization',
      code: 'ACTOR_REQUIRED',
      message: '需要有效的 OriginOS 操作身份',
      retryable: false,
    };
  }
  return null;
}

export function validateRouteParams(
  params: SolutionContractRouteParams
): SolutionContractTransportError | null {
  const entries = [
    ['projectId', params.projectId],
    ['solutionId', params.solutionId],
    ['solutionVersion', params.solutionVersion],
  ] as const;
  for (const [field, value] of entries) {
    if (!IDENTIFIER.test(value) || value.includes('..')) {
      return {
        category: 'validation',
        code: 'INVALID_REQUEST',
        message: `${field} 格式无效`,
        retryable: false,
      };
    }
  }
  return null;
}

export function parseRevokeBody(
  value: unknown
):
  | { readonly ok: true; readonly value: RevokeSolutionContractBody }
  | { readonly ok: false; readonly error: SolutionContractTransportError } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidRevokeBody();
  }
  const record = value as Record<string, unknown>;
  const contractId =
    typeof record['contractId'] === 'string' ? record['contractId'].trim() : '';
  const reason =
    typeof record['reason'] === 'string' ? record['reason'].trim() : '';
  if (
    !IDENTIFIER.test(contractId) ||
    contractId.includes('..') ||
    reason.length === 0 ||
    reason.length > MAX_REVOCATION_REASON_LENGTH
  ) {
    return invalidRevokeBody();
  }
  return { ok: true, value: { contractId, reason } };
}

function invalidRevokeBody(): {
  readonly ok: false;
  readonly error: SolutionContractTransportError;
} {
  return {
    ok: false,
    error: {
      category: 'validation',
      code: 'INVALID_REQUEST',
      message: 'contractId 或撤销原因格式无效',
      retryable: false,
    },
  };
}

const SAFE_ERROR_MESSAGES: Record<
  SolutionContractPublishingErrorCategory,
  string
> = {
  validation: '执行契约请求参数无效',
  not_found: '未找到指定的方案或执行契约',
  conflict: '执行契约版本或标识发生冲突',
  integrity: '执行契约完整性校验失败',
  internal: '执行契约服务暂时不可用',
};

export function mapPublishingError(error: unknown): {
  readonly status: number;
  readonly response: SolutionContractTransportResponse<never>;
} {
  if (error instanceof SolutionContractPublishingError) {
    const statuses: Record<SolutionContractPublishingErrorCategory, number> = {
      validation: 400,
      not_found: 404,
      conflict: 409,
      integrity: 422,
      internal: 500,
    };
    return {
      status: statuses[error.category],
      response: {
        success: false,
        error: {
          category: error.category,
          code: error.code,
          message: SAFE_ERROR_MESSAGES[error.category],
          retryable: error.category === 'internal',
        },
      },
    };
  }
  return {
    status: 500,
    response: {
      success: false,
      error: {
        category: 'internal',
        code: 'INTERNAL_ERROR',
        message: SAFE_ERROR_MESSAGES.internal,
        retryable: true,
      },
    },
  };
}
