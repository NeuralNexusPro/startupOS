import { type NextResponse, NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OntologyCrossPackageResponse } from '@originos/core/lib/features/project';

const invoke = vi.fn<[request: unknown], Promise<OntologyCrossPackageResponse>>();

vi.mock('@/services/ontologyCrossPackageService', (): {
  createOntologyCrossPackageService: () => { invoke: typeof invoke };
} => ({
  createOntologyCrossPackageService: () => ({ invoke }),
}));

const { POST } = await import('./route');

const baseRequest = {
  contractVersion: '1',
  requestId: 'request-1',
  actorId: 'request-actor',
  projectId: 'project-1',
  type: 'inspect_bound_task',
  taskId: 'task-1',
};

function post(body: BodyInit, actorId = 'actor-1'): Promise<NextResponse> {
  const headers = new Headers();
  if (actorId) {
    headers.set('x-originos-actor-id', actorId);
  }
  return POST(new NextRequest('http://localhost/api/ontology/cross-package', {
    method: 'POST',
    body,
    headers,
  }));
}

function success(): OntologyCrossPackageResponse {
  return {
    ok: true,
    requestId: 'request-1',
    data: { taskId: 'task-1' },
    revision: 1,
  };
}

function failure(
  category: 'authorization' | 'conflict' | 'internal' | 'unavailable' | 'validation'
): OntologyCrossPackageResponse {
  return {
    ok: false,
    requestId: 'request-1',
    error: {
      category,
      code: `${category.toUpperCase()}_ERROR`,
      issues: [],
      retryable: false,
      remediation: 'Retry safely.',
    },
  };
}

describe('/api/ontology/cross-package', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('injects the transport actor and maps a successful core response', async () => {
    invoke.mockResolvedValue(success());
    const response = await post(JSON.stringify(baseRequest));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(success());
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'actor-1' }));
  });

  it('maps core error categories to HTTP statuses', async () => {
    const cases = [
      ['validation', 400],
      ['authorization', 403],
      ['conflict', 409],
      ['unavailable', 503],
      ['internal', 500],
    ] as const;
    for (const [category, status] of cases) {
      invoke.mockResolvedValueOnce(failure(category));
      const response = await post(JSON.stringify(baseRequest));
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        error: { category, code: `${category.toUpperCase()}_ERROR` },
      });
    }
  });

  it('rejects malformed JSON without calling core', async () => {
    const response = await post('{');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_JSON' },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requires a transport actor', async () => {
    const response = await post(JSON.stringify(baseRequest), '');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'ACTOR_REQUIRED', category: 'authorization' },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects unsupported contract versions and mutations without revisions', async () => {
    const invalidVersion = await post(JSON.stringify({
      ...baseRequest,
      contractVersion: '2',
    }));
    expect(invalidVersion.status).toBe(400);

    const invalidMutation = await post(JSON.stringify({
      ...baseRequest,
      type: 'control_bound_task',
      action: 'pause',
    }));
    expect(invalidMutation.status).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('accepts a bounded project task page request without an ontology version', async () => {
    invoke.mockRejectedValueOnce(new Error('PROJECT_TASK_SOURCE_UNAVAILABLE'));
    const response = await post(JSON.stringify({
      contractVersion: '1',
      requestId: 'request-2',
      actorId: 'request-actor',
      projectId: 'project-1',
      type: 'list_project_tasks',
      cursor: 'cursor-1',
      limit: 50,
    }));

    expect(response.status).toBe(503);
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({
      type: 'list_project_tasks',
      projectId: 'project-1',
      cursor: 'cursor-1',
      limit: 50,
      actorId: 'actor-1',
    }));
    expect(await response.json()).toMatchObject({
      error: { category: 'unavailable', code: 'CAPABILITY_NOT_READY' },
    });
  });

  it('maps missing production capabilities without leaking diagnostics', async () => {
    invoke.mockRejectedValueOnce(new Error('PROJECT_TASK_SOURCE_UNAVAILABLE'));
    const unavailable = await post(JSON.stringify(baseRequest));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({
      error: { code: 'CAPABILITY_NOT_READY', category: 'unavailable' },
    });

    invoke.mockRejectedValueOnce(new Error('secret diagnostic /tmp/private'));
    const internal = await post(JSON.stringify(baseRequest));
    expect(internal.status).toBe(500);
    const internalBody = await internal.json();
    expect(JSON.stringify(internalBody)).not.toContain('secret diagnostic');
    expect(JSON.stringify(internalBody)).not.toContain('/tmp/private');
  });
});
