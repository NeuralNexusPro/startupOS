'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import {
  checkSolutionExecutionContract,
  publishSolutionExecutionContract,
  readSolutionExecutionContract,
  revokeSolutionExecutionContract,
} from '@/services/solution-execution-contract-client';

import { SolutionContractPublishingPanel } from './SolutionContractPublishingPanel';

import type {
  SolutionContractTransportError,
  SolutionContractTransportResponse,
} from '@/services/solution-execution-contract-contract';
import type {
  PublishedSolutionExecutionContract,
  SolutionDesignStatus,
} from '@originos/core/lib/features/solution';

export const SOLUTION_DESIGN_ACTOR_ID = 'originos.solution-designer';

export interface SolutionContractPublishingContainerProps {
  readonly projectId: string;
  readonly solutionId: string;
  readonly solutionVersion: string;
  readonly designStatus: SolutionDesignStatus;
  readonly onCreateVersion: () => void;
}

class SolutionContractTransportFailure extends Error {
  constructor(readonly detail: SolutionContractTransportError) {
    super(detail.message);
    this.name = 'SolutionContractTransportFailure';
  }

  get code(): string {
    return this.detail.code;
  }
}

function unwrap<T>(response: SolutionContractTransportResponse<T>): T {
  if (response.success) {
    return response.data;
  }
  throw new SolutionContractTransportFailure(response.error);
}

export const SolutionContractPublishingContainer = ({
  projectId,
  solutionId,
  solutionVersion,
  designStatus,
  onCreateVersion,
}: SolutionContractPublishingContainerProps): ReactElement => {
  const [published, setPublished] =
    useState<PublishedSolutionExecutionContract | null>(null);
  const [initialReadPending, setInitialReadPending] = useState(true);
  const [initialReadFailure, setInitialReadFailure] = useState<string | null>(
    null
  );
  const ref = useMemo(
    () => ({
      actorId: SOLUTION_DESIGN_ACTOR_ID,
      projectId,
      solutionId,
      solutionVersion,
    }),
    [projectId, solutionId, solutionVersion]
  );

  const readPublished = useCallback(async () => {
    const response = await readSolutionExecutionContract(ref);
    if (!response.success && response.error.code === 'CONTRACT_NOT_FOUND') {
      return null;
    }
    return unwrap(response);
  }, [ref]);

  useEffect(() => {
    let active = true;
    setInitialReadPending(true);
    setInitialReadFailure(null);
    void readPublished()
      .then((result) => {
        if (active) {
          setPublished(result);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setInitialReadFailure(
            error instanceof Error ? error.message : '读取发布状态失败'
          );
        }
      })
      .finally(() => {
        if (active) {
          setInitialReadPending(false);
        }
      });
    return (): void => {
      active = false;
    };
  }, [readPublished]);

  if (initialReadPending) {
    return (
      <div role="status" className="rounded-xl border p-5 text-sm text-slate-600">
        正在读取执行契约发布状态…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {initialReadFailure && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {initialReadFailure}
        </div>
      )}
      <SolutionContractPublishingPanel
        snapshot={{ designStatus, published }}
        onCheck={async () => unwrap(await checkSolutionExecutionContract(ref))}
        onPublish={async () =>
          unwrap(await publishSolutionExecutionContract(ref))
        }
        onRead={readPublished}
        onRevoke={async (contractId, reason) =>
          unwrap(
            await revokeSolutionExecutionContract({
              ...ref,
              contractId,
              reason,
            })
          )
        }
        onSnapshotChange={(nextPublished) => {
          setInitialReadFailure(null);
          setPublished(nextPublished);
        }}
        onCreateVersion={onCreateVersion}
      />
    </div>
  );
}
