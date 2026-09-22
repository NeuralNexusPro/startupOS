import { describe, expect, it } from 'vitest';

import type {
  OntologyCrossPackageError,
  OntologyCrossPackageRequest,
  OntologyCrossPackageResponse,
} from '../ontology-cross-package-contract';

const request: OntologyCrossPackageRequest = {
  contractVersion: '1',
  requestId: 'request-1',
  actorId: 'actor-1',
  projectId: 'project-1',
  type: 'inspect_bound_task',
  taskId: 'task-1',
};

const error: OntologyCrossPackageError = {
  category: 'conflict',
  code: 'revision_conflict',
  issues: [{ code: 'stale_revision', message: 'Task revision is stale' }],
  retryable: true,
  remediation: 'Reload the task and retry with the current revision.',
};

const response: OntologyCrossPackageResponse = {
  ok: false,
  requestId: request.requestId,
  error,
};

describe('ontology cross package contract', () => {
  it('freezes the request and response contracts', () => {
    expect(request.type).toBe('inspect_bound_task');
    expect(response.ok).toBe(false);
    expect(response.error.category).toBe('conflict');
  });

  it('rejects the wrong contract version at the type boundary', () => {
    const invalid = {
      ...request,
      contractVersion: '2',
    };
    // @ts-expect-error -- contractVersion is intentionally fixed to v1.
    const invalidRequest: OntologyCrossPackageRequest = invalid;
    expect(invalidRequest.contractVersion).toBe('2');
  });

  it('rejects a mutation without an expected revision', () => {
    const invalid = {
      ...request,
      type: 'control_bound_task',
      action: 'pause',
    };
    // @ts-expect-error -- expectedRevision is required for control commands.
    const invalidRequest: OntologyCrossPackageRequest = invalid;
    expect(invalidRequest.type).toBe('control_bound_task');
  });
});
