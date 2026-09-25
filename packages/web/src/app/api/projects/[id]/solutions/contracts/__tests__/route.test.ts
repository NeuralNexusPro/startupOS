import { NextRequest } from 'next/server';

import {
  SolutionContractPublishingError,
  type DesignGap,
} from '@originos/core/lib/features/solution';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  check: vi.fn(),
  publish: vi.fn(),
  read: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock(
  '@/services/solution-execution-contract-server',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@/services/solution-execution-contract-server')
      >();
    return {
      ...original,
      createSolutionExecutionContractPublishingService: (): typeof service =>
        service,
    };
  }
);

const { POST: check } = await import('../[solutionId]/[version]/check/route');
const { POST: publish } =
  await import('../[solutionId]/[version]/publish/route');
const { GET: read } = await import('../[solutionId]/[version]/route');
const { POST: revoke } = await import('../[solutionId]/[version]/revoke/route');

const context = {
  params: Promise.resolve({
    id: 'project-1',
    solutionId: 'solution-1',
    version: '1.0',
  }),
};

interface TestRequestInit {
  readonly method?: string;
  readonly body?: BodyInit;
  readonly headers?: Record<string, string>;
}

function request(path: string, init: TestRequestInit = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    ...init,
    headers: {
      'x-originos-actor-id': 'solution-designer',
      ...init.headers,
    },
  });
}

const gap: DesignGap = {
  code: 'MISSING_VERIFIER',
  severity: 'error',
  scope: 'node',
  refId: 'agent-1',
  path: 'agents[0].verifierRef',
  message: '节点缺少 verifier。',
  remediation: '为节点绑定 verifier。',
};

describe('solution execution contract routes', () => {
  beforeEach(() => {
    service.check.mockReset();
    service.publish.mockReset();
    service.read.mockReset();
    service.revoke.mockReset();
  });

  it('passes exact references and preserves every DesignGap from Core', async () => {
    service.check.mockResolvedValue({ ok: false, gaps: [gap] });
    const response = await check(
      request('/check', { method: 'POST' }),
      context
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { ok: false, gaps: [gap] },
    });
    expect(service.check).toHaveBeenCalledWith({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: '1.0',
    });
  });

  it('returns publish and exact read results without transport-side projection', async () => {
    const published = {
      contract: {
        contractId: 'contract-1',
        contractHash: 'hash-1',
        projectId: 'project-1',
        solutionId: 'solution-1',
        solutionVersion: '1.0',
      },
    };
    service.publish.mockResolvedValue({ ok: true, published });
    service.read.mockResolvedValue(published);

    const publishResponse = await publish(
      request('/publish', { method: 'POST' }),
      context
    );
    const readResponse = await read(request('/contract'), context);

    expect(await publishResponse.json()).toEqual({
      success: true,
      data: { ok: true, published },
    });
    expect(await readResponse.json()).toEqual({
      success: true,
      data: published,
    });
    expect(service.read).toHaveBeenCalledWith({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: '1.0',
    });
  });

  it('requires transport identity and rejects unsafe path identifiers', async () => {
    const missingActor = await read(
      new NextRequest('http://localhost/contract'),
      context
    );
    expect(missingActor.status).toBe(401);
    expect(await missingActor.json()).toMatchObject({
      success: false,
      error: { category: 'authorization', code: 'ACTOR_REQUIRED' },
    });

    const unsafe = await read(request('/contract'), {
      params: Promise.resolve({
        id: '..',
        solutionId: 'solution-1',
        version: '1.0',
      }),
    });
    expect(unsafe.status).toBe(400);
    expect(await unsafe.json()).toMatchObject({
      success: false,
      error: { category: 'validation', code: 'INVALID_REQUEST' },
    });
    expect(service.read).not.toHaveBeenCalled();
  });

  it('validates revoke JSON, contractId and reason before calling Core', async () => {
    const malformed = await revoke(
      request('/revoke', { method: 'POST', body: '{' }),
      context
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: 'INVALID_JSON' },
    });

    const invalid = await revoke(
      request('/revoke', {
        method: 'POST',
        body: JSON.stringify({ contractId: '../secret', reason: '' }),
      }),
      context
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    });
    expect(service.revoke).not.toHaveBeenCalled();
  });

  it('passes a bounded revoke request and returns the authoritative state', async () => {
    const revoked = {
      contract: {
        contractId: 'contract-1',
        projectId: 'project-1',
        solutionId: 'solution-1',
        solutionVersion: '1.0',
      },
      revocation: {
        contractId: 'contract-1',
        revokedAt: '2026-09-25T00:00:00.000Z',
        reason: '不再使用',
      },
    };
    service.revoke.mockResolvedValue(revoked);
    const response = await revoke(
      request('/revoke', {
        method: 'POST',
        body: JSON.stringify({
          contractId: ' contract-1 ',
          reason: ' 不再使用 ',
        }),
      }),
      context
    );

    expect(await response.json()).toEqual({ success: true, data: revoked });
    expect(service.revoke).toHaveBeenCalledWith({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: '1.0',
      contractId: 'contract-1',
      reason: '不再使用',
    });
  });

  it.each([
    ['validation', 'INVALID_REQUEST', 400],
    ['not_found', 'CONTRACT_NOT_FOUND', 404],
    ['conflict', 'CONTRACT_VERSION_CONFLICT', 409],
    ['integrity', 'CONTRACT_INTEGRITY_FAILED', 422],
    ['internal', 'INTERNAL_ERROR', 500],
  ] as const)(
    'maps %s Core errors to stable HTTP semantics',
    async (_category, code, status) => {
      service.read.mockRejectedValue(
        new SolutionContractPublishingError(
          code,
          'sensitive diagnostic /Users/private/token.json'
        )
      );
      const response = await read(request('/contract'), context);
      const body = await response.json();

      expect(response.status).toBe(status);
      expect(body).toMatchObject({ success: false, error: { code } });
      expect(JSON.stringify(body)).not.toContain('sensitive diagnostic');
      expect(JSON.stringify(body)).not.toContain('/Users/private');
    }
  );

  it('maps unknown failures without leaking credentials or paths', async () => {
    service.publish.mockRejectedValue(
      new Error('apiKey=secret at /tmp/private/contracts.json')
    );
    const response = await publish(
      request('/publish', { method: 'POST' }),
      context
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: {
        category: 'internal',
        code: 'INTERNAL_ERROR',
        message: '执行契约服务暂时不可用',
        retryable: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('/tmp/private');
  });
});
