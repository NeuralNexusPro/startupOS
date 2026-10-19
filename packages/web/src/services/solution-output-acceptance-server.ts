import {
  SolutionOutputAcceptanceError,
  SolutionOutputAcceptanceService,
} from '@originos/core/lib/features/solution';

import type { IpcResponse } from '@originos/core/lib/integrations/electron';

const service = new SolutionOutputAcceptanceService();

export function getSolutionOutputAcceptanceService(): SolutionOutputAcceptanceService {
  return service;
}

export function solutionOutputAcceptanceError<T>(
  error: unknown
): IpcResponse<T> {
  return {
    success: false,
    error: {
      code:
        error instanceof SolutionOutputAcceptanceError
          ? error.code
          : 'INTERNAL_ERROR',
      message:
        error instanceof Error ? error.message : '读取产出验收策略失败。',
    },
    timestamp: new Date().toISOString(),
  };
}
