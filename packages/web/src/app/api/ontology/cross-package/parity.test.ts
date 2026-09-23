import { type NextResponse, NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OntologyCrossPackageIpcController } from '../../../../../../desktop/src/main/services/ontology-cross-package-ipc';

import type { OntologyCrossPackageResponse } from '@originos/core/lib/features/project';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/services/ontologyCrossPackageService', (): {
  createOntologyCrossPackageService: () => { invoke: typeof invoke };
} => ({
  createOntologyCrossPackageService: () => ({ invoke }),
}));

const { POST } = await import('./route');

const baseRequest = {
  contractVersion: '1',
  requestId: 'request-1',
  actorId: 'untrusted-request-actor',
  projectId: 'project-1',
  type: 'inspect_bound_task',
  taskId: 'task-1',
};

type RegisteredHandler = (
  event: { sender: { id: number } },
  request: unknown
) => Promise<{
  success: boolean;
  data?: OntologyCrossPackageResponse;
  error?: { code: string; details?: OntologyCrossPackageResponse };
}>;

function failure(
  category: 'authorization' | 'conflict',
  code: string
): OntologyCrossPackageResponse {
  return {
    ok: false,
    requestId: 'request-1',
    error: {
      category,
      code,
      issues: [{ code, message: 'Rejected by core' }],
      retryable: false,
      remediation: 'Use the current references.',
    },
  };
}

function successResponse(): OntologyCrossPackageResponse {
  return {
    ok: true,
    requestId: 'request-1',
    data: { taskId: 'task-1' },
    revision: 3,
  };
}

async function invokeWeb(): Promise<{ status: number; body: OntologyCrossPackageResponse }> {
  const response = await POST(new NextRequest('http://localhost/api/ontology/cross-package', {
    method: 'POST',
    body: JSON.stringify(baseRequest),
    headers: { 'x-originos-actor-id': 'web-actor' },
  })) as NextResponse;
  return {
    status: response.status,
    body: await response.json() as OntologyCrossPackageResponse,
  };
}

async function invokeDesktop(): Promise<OntologyCrossPackageResponse> {
  const handlers = new Map<string, RegisteredHandler>();
  const controller = new OntologyCrossPackageIpcController({
    ipc: {
      handle: (channel, listener): void => {
        handlers.set(channel, listener as RegisteredHandler);
      },
    },
    service: { invoke },
    isTrustedSender: (): boolean => true,
  });
  controller.registerHandlers();
  const handler = handlers.get('ontology:cross-package:invoke');
  if (!handler) {
    throw new Error('Missing handler');
  }
  const response = await handler({ sender: { id: 7 } }, baseRequest);
  return response.data ?? response.error?.details ?? {
    ok: false,
    requestId: 'unknown',
    error: {
      category: 'internal',
      code: 'TRANSPORT_INTERNAL_ERROR',
      issues: [],
      retryable: false,
      remediation: '',
    },
  };
}

function statusFor(body: OntologyCrossPackageResponse): number {
  if (body.ok) {
    return 200;
  }
  if (body.error.category === 'authorization') {
    return 403;
  }
  if (body.error.category === 'conflict') {
    return 409;
  }
  if (body.error.category === 'unavailable') {
    return 503;
  }
  return 500;
}

describe('ontology cross-package transport parity', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it.each([
    ['success', successResponse(), 200],
    ['authorization', failure('authorization', 'AUTHORIZATION_DENIED'), 403],
    ['version conflict', failure('conflict', 'ONTOLOGY_VERSION_CONFLICT'), 409],
  ])('returns equivalent %s semantics', async (_name, coreResponse, expectedStatus) => {
    invoke.mockResolvedValue(coreResponse);

    const web = await invokeWeb();
    const desktop = await invokeDesktop();

    expect(web.status).toBe(expectedStatus);
    expect(statusFor(desktop)).toBe(expectedStatus);
    expect(desktop).toEqual(coreResponse);
    expect(web.body).toEqual(coreResponse);
  });

  it('preserves idempotent retry semantics without transport-side state', async () => {
    invoke.mockResolvedValue(successResponse());

    const firstWeb = await invokeWeb();
    const secondWeb = await invokeWeb();
    const firstDesktop = await invokeDesktop();
    const secondDesktop = await invokeDesktop();

    expect(firstWeb.body).toEqual(secondWeb.body);
    expect(firstDesktop).toEqual(secondDesktop);
    expect(firstWeb.body).toEqual(firstDesktop);
    expect(invoke.mock.calls[0][0]).toMatchObject({
      requestId: 'request-1',
      actorId: 'web-actor',
    });
    expect(invoke.mock.calls[2][0]).toMatchObject({
      requestId: 'request-1',
      actorId: 'desktop-sender:7',
    });
  });

  it('returns equivalent unavailable semantics for missing production ports', async () => {
    invoke.mockRejectedValue(new Error('PROJECT_TASK_SOURCE_UNAVAILABLE'));

    const web = await invokeWeb();
    const desktop = await invokeDesktop();

    expect(web.status).toBe(503);
    expect(statusFor(desktop)).toBe(503);
    expect(desktop).toEqual(web.body);
    expect(desktop).toMatchObject({
      ok: false,
      requestId: 'request-1',
      error: {
        category: 'unavailable',
        code: 'CAPABILITY_NOT_READY',
        retryable: true,
      },
    });
  });
});
