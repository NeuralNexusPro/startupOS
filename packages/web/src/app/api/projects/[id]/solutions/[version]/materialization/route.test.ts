import { NextRequest } from 'next/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  start: vi.fn(),
}));

vi.mock('@/services/solution-materialization-server', () => ({
  getSolutionMaterializationBackgroundRunner: (): typeof mocks => mocks,
}));

import { GET, POST } from './route';

const task = {
  schemaVersion: '1.0.0',
  id: 'solution-materialization:project-1:solution-1:v1.0',
  projectId: 'project-1',
  solutionId: 'solution-1',
  solutionVersion: 'v1.0',
  revision: 1,
  status: 'pending',
  input: { digest: 'sha256:x', files: [], frozenAt: '2026-10-15T00:00:00.000Z' },
  steps: [],
  artifacts: [],
  createdAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
};

const context = { params: Promise.resolve({ id: 'project-1', version: 'v1.0' }) };

describe('solution materialization route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts an internal background task without a board task payload', async () => {
    mocks.start.mockResolvedValue({ task, recovered: false });
    const request = new NextRequest('http://localhost/api/projects/project-1/solutions/v1.0/materialization', {
      method: 'POST',
      body: JSON.stringify({ solutionId: 'solution-1' }),
    });

    const result = await POST(request, context);
    const body = await result.json();

    expect(result.status).toBe(202);
    expect(mocks.start).toHaveBeenCalledWith({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1.0',
      retryFailed: false,
    });
    expect(JSON.stringify(body)).not.toMatch(/projectTaskId|runId|workItemId/);
  });

  it('queries the persisted task by project and version', async () => {
    mocks.get.mockResolvedValue(task);
    const request = new NextRequest('http://localhost/api/projects/project-1/solutions/v1.0/materialization?solutionId=solution-1');
    const result = await GET(request, context);

    expect(result.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith({
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1.0',
    });
  });
});
