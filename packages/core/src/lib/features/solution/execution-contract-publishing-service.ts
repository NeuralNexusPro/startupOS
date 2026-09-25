import { compileSolutionExecutionContract } from './execution-contract';
import {
  SolutionExecutionContractStore,
  SolutionExecutionContractStoreError,
} from './execution-contract-store';

import type {
  ContractRef,
  DesignGap,
  PublishedSolutionExecutionContract,
  RevokeSolutionExecutionContractInput,
  SolutionContractCompilationResult,
  SolutionContractPublishingErrorCategory,
  SolutionContractPublishingErrorCode,
  SolutionContractCompilationInput,
  SolutionDesignSource,
  SolutionVersionRef,
} from './types';

const ERROR_CATEGORY: Record<
  SolutionContractPublishingErrorCode,
  SolutionContractPublishingErrorCategory
> = {
  INVALID_REQUEST: 'validation',
  DESIGN_NOT_FOUND: 'not_found',
  CONTRACT_NOT_FOUND: 'not_found',
  CONTRACT_VERSION_CONFLICT: 'conflict',
  CONTRACT_ID_MISMATCH: 'conflict',
  CONTRACT_INTEGRITY_FAILED: 'integrity',
  INTERNAL_ERROR: 'internal',
};

export class SolutionContractPublishingError extends Error {
  readonly category: SolutionContractPublishingErrorCategory;

  constructor(
    readonly code: SolutionContractPublishingErrorCode,
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SolutionContractPublishingError';
    this.category = ERROR_CATEGORY[code];
  }
}

export type PublishSolutionExecutionContractResult =
  | {
      readonly ok: true;
      readonly published: PublishedSolutionExecutionContract;
    }
  | { readonly ok: false; readonly gaps: readonly DesignGap[] };

/**
 * Project-scoped design publication boundary. Check and publish intentionally
 * load and compile independently: callers cannot publish a renderer-cached
 * contract or bypass a design change made after the last check.
 */
export class SolutionExecutionContractPublishingService {
  constructor(
    private readonly source: SolutionDesignSource,
    private readonly store: SolutionExecutionContractStore
  ) {}

  async check(
    input: SolutionContractCompilationInput
  ): Promise<SolutionContractCompilationResult> {
    try {
      const loaded = await this.source.load(input, {
        sourceFormat: input.sourceFormat ?? 'versioned_bundle',
      });
      if (!loaded) {
        throw new SolutionContractPublishingError(
          'DESIGN_NOT_FOUND',
          `Solution design ${input.solutionId}@${input.solutionVersion} was not found`
        );
      }
      if (loaded.ok === false) {
        return { ok: false, gaps: loaded.gaps };
      }
      this.assertLoadedReference(input, loaded.design.body);
      return compileSolutionExecutionContract(
        loaded.design.ontology,
        loaded.design.status,
        loaded.design.body
      );
    } catch (error) {
      throw this.translate(error);
    }
  }

  async publish(
    input: SolutionContractCompilationInput
  ): Promise<PublishSolutionExecutionContractResult> {
    try {
      const checked = await this.check(input);
      if (checked.ok === false) {
        return { ok: false, gaps: checked.gaps };
      }
      return {
        ok: true,
        published: await this.store.publishContract(checked.contract),
      };
    } catch (error) {
      throw this.translate(error);
    }
  }

  async read(
    input: SolutionVersionRef
  ): Promise<PublishedSolutionExecutionContract> {
    try {
      const published = await this.store.load(input);
      if (!published) {
        throw new SolutionContractPublishingError(
          'CONTRACT_NOT_FOUND',
          `Execution contract ${input.solutionId}@${input.solutionVersion} was not found`
        );
      }
      return published;
    } catch (error) {
      throw this.translate(error);
    }
  }

  async revoke(
    input: RevokeSolutionExecutionContractInput
  ): Promise<PublishedSolutionExecutionContract> {
    try {
      return await this.store.revoke(input, input.reason);
    } catch (error) {
      throw this.translate(error);
    }
  }

  private assertLoadedReference(
    expected: SolutionVersionRef,
    actual: ContractRef
  ): void {
    if (
      expected.projectId !== actual.projectId ||
      expected.solutionId !== actual.solutionId ||
      expected.solutionVersion !== actual.solutionVersion
    ) {
      throw new SolutionContractPublishingError(
        'INVALID_REQUEST',
        'Loaded solution design does not match the requested exact version'
      );
    }
  }

  private translate(error: unknown): SolutionContractPublishingError {
    if (error instanceof SolutionContractPublishingError) {
      return error;
    }
    if (error instanceof SolutionExecutionContractStoreError) {
      const codes: Record<
        SolutionExecutionContractStoreError['code'],
        SolutionContractPublishingErrorCode
      > = {
        INVALID_REFERENCE: 'INVALID_REQUEST',
        NOT_FOUND: 'CONTRACT_NOT_FOUND',
        VERSION_CONFLICT: 'CONTRACT_VERSION_CONFLICT',
        CONTRACT_ID_MISMATCH: 'CONTRACT_ID_MISMATCH',
        INTEGRITY_FAILURE: 'CONTRACT_INTEGRITY_FAILED',
      };
      return new SolutionContractPublishingError(
        codes[error.code],
        error.message,
        error
      );
    }
    if (error instanceof TypeError) {
      return new SolutionContractPublishingError(
        'INVALID_REQUEST',
        error.message,
        error
      );
    }
    return new SolutionContractPublishingError(
      'INTERNAL_ERROR',
      'Solution execution contract operation failed',
      error
    );
  }
}
