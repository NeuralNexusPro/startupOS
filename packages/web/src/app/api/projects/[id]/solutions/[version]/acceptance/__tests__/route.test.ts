import { beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/services/solution-output-acceptance-server', () => ({
  getSolutionOutputAcceptanceService: () => services,
  solutionOutputAcceptanceError: (error: unknown) => ({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'unknown',
    },
    timestamp: '2026-10-15T00:00:00.000Z',
  }),
}));

const { GET, PATCH } = await import('../route');

const context = {
  params: Promise.resolve({ id: 'project-1', version: 'v1' }),
};

describe('solution output acceptance route', () => {
beforeEach(() => {
  vi.clearAllMocks();
});

  it('reads through the Core service with the exact solution reference', async () => {
    services.load.mockResolvedValue({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1',
      status: 'draft',
      locked: false,
      published: false,
      nodes: [],
      roles: [],
    });
    const response = await GET(
      new Request(
        'http://localhost/api/projects/project-1/solutions/v1/acceptance?solutionId=solution-1'
      ),
      context
    );

    expect(response.status).toBe(200);
    expect(services.load).toHaveBeenCalledWith({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1',
    });
    expect(await response.json()).toMatchObject({ success: true });
  });

  it('validates the transport body and saves only through the Core service', async () => {
    services.save.mockResolvedValue({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1',
      status: 'draft',
      locked: false,
      published: false,
      nodes: [],
      roles: [],
    });
    const response = await PATCH(
      new Request(
        'http://localhost/api/projects/project-1/solutions/v1/acceptance',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            solutionId: 'solution-1',
            nodes: [{ nodeId: 'node-1', mode: 'user' }],
          }),
        }
      ),
      context
    );

    expect(services.save).toHaveBeenCalledWith({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1',
      nodes: [{ nodeId: 'node-1', mode: 'user' }],
    });
    expect(await response.json()).toMatchObject({ success: true });
  });

  it('rejects malformed nodes before calling Core', async () => {
    const response = await PATCH(
      new Request(
        'http://localhost/api/projects/project-1/solutions/v1/acceptance',
        {
          method: 'PATCH',
          body: JSON.stringify({
            solutionId: 'solution-1',
            nodes: [{ nodeId: 'node-1', mode: 'sometimes' }],
          }),
        }
      ),
      context
    );

    expect(services.save).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    });
  });
});
