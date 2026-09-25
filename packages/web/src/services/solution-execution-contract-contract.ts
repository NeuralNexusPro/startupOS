import type {
  PublishedSolutionExecutionContract,
  PublishSolutionExecutionContractResult,
  SolutionContractCompilationResult,
  SolutionContractPublishingErrorCategory,
} from '@originos/core/lib/features/solution';

export type SolutionContractTransportErrorCategory =
  'authorization' | SolutionContractPublishingErrorCategory;

export interface SolutionContractTransportError {
  readonly category: SolutionContractTransportErrorCategory;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export type SolutionContractTransportResponse<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: SolutionContractTransportError };

export type SolutionContractCheckResponse =
  SolutionContractTransportResponse<SolutionContractCompilationResult>;
export type SolutionContractPublishResponse =
  SolutionContractTransportResponse<PublishSolutionExecutionContractResult>;
export type SolutionContractReadResponse =
  SolutionContractTransportResponse<PublishedSolutionExecutionContract>;
export type SolutionContractRevokeResponse =
  SolutionContractTransportResponse<PublishedSolutionExecutionContract>;
