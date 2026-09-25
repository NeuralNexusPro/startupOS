import { describe, expect, it, vi } from 'vitest';

import {
  checkSolutionExecutionContract,
  publishSolutionExecutionContract,
  readSolutionExecutionContract,
  revokeSolutionExecutionContract,
  type SolutionContractClientRef,
  type SolutionContractFetcher,
} from '../solution-execution-contract-client';

const input: SolutionContractClientRef = {
  actorId: 'solution-designer',
  projectId: 'project-1',
  solutionId: 'solution-1',
  solutionVersion: '1.0',
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('solution execution contract client', () => {
  it('uses exact version endpoints and transport identity for every operation', async () => {
    const fetcher = vi
      .fn<
        Parameters<SolutionContractFetcher>,
        ReturnType<SolutionContractFetcher>
      >()
      .mockResolvedValue(
        jsonResponse({ success: true, data: { ok: false, gaps: [] } })
      );

    await checkSolutionExecutionContract(input, fetcher);
    await publishSolutionExecutionContract(input, fetcher);
    await readSolutionExecutionContract(input, fetcher);
    await revokeSolutionExecutionContract(
      {
        ...input,
        contractId: 'contract-1',
        reason: '创建新版本',
      },
      fetcher
    );

    const base = '/api/projects/project-1/solutions/contracts/solution-1/1.0';
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `${base}/check`,
      `${base}/publish`,
      base,
      `${base}/revoke`,
    ]);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
      'POST',
      'POST',
      'GET',
      'POST',
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.headers).toMatchObject({
        'x-originos-actor-id': 'solution-designer',
      });
      expect(init?.credentials).toBe('same-origin');
    }
    expect(fetcher.mock.calls[3]?.[1]?.body).toBe(
      JSON.stringify({
        contractId: 'contract-1',
        reason: '创建新版本',
      })
    );
  });

  it('preserves authoritative Core payloads returned by the transport', async () => {
    const result = {
      success: true as const,
      data: {
        ok: false as const,
        gaps: [
          {
            code: 'MISSING_VERIFIER',
            severity: 'error' as const,
            scope: 'node' as const,
            message: '缺少 verifier',
            remediation: '绑定 verifier',
          },
        ],
      },
    };
    const response = await checkSolutionExecutionContract(
      input,
      vi
        .fn<
          Parameters<SolutionContractFetcher>,
          ReturnType<SolutionContractFetcher>
        >()
        .mockResolvedValue(jsonResponse(result))
    );
    expect(response).toEqual(result);
  });

  it('rejects invalid identity and references before network access', async () => {
    const fetcher = vi.fn<
      Parameters<SolutionContractFetcher>,
      ReturnType<SolutionContractFetcher>
    >();
    const actor = await readSolutionExecutionContract(
      {
        ...input,
        actorId: '',
      },
      fetcher
    );
    const unsafe = await readSolutionExecutionContract(
      {
        ...input,
        solutionId: '../private',
      },
      fetcher
    );

    expect(actor).toMatchObject({
      success: false,
      error: { category: 'authorization', code: 'ACTOR_REQUIRED' },
    });
    expect(unsafe).toMatchObject({
      success: false,
      error: { category: 'validation', code: 'INVALID_REQUEST' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid revoke input before network access', async () => {
    const fetcher = vi.fn<
      Parameters<SolutionContractFetcher>,
      ReturnType<SolutionContractFetcher>
    >();
    const response = await revokeSolutionExecutionContract(
      {
        ...input,
        contractId: '../contract',
        reason: '',
      },
      fetcher
    );

    expect(response).toMatchObject({
      success: false,
      error: { category: 'validation', code: 'INVALID_REQUEST' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns stable failures for invalid responses and network errors', async () => {
    const invalid = await readSolutionExecutionContract(
      input,
      vi
        .fn<
          Parameters<SolutionContractFetcher>,
          ReturnType<SolutionContractFetcher>
        >()
        .mockResolvedValue(jsonResponse({ apiKey: 'secret' }))
    );
    const unavailable = await readSolutionExecutionContract(
      input,
      vi
        .fn<
          Parameters<SolutionContractFetcher>,
          ReturnType<SolutionContractFetcher>
        >()
        .mockRejectedValue(new Error('credential secret at /tmp/private'))
    );

    expect(invalid).toEqual({
      success: false,
      error: {
        category: 'internal',
        code: 'INVALID_RESPONSE',
        message: '执行契约服务返回了无效响应',
        retryable: true,
      },
    });
    expect(unavailable).toEqual({
      success: false,
      error: {
        category: 'internal',
        code: 'TRANSPORT_UNAVAILABLE',
        message: '无法连接执行契约服务',
        retryable: true,
      },
    });
    expect(JSON.stringify(unavailable)).not.toContain('credential');
    expect(JSON.stringify(unavailable)).not.toContain('/tmp/private');
  });
});
