import { NextRequest, NextResponse } from 'next/server';

import { getSolutionMaterializationBackgroundRunner } from '@/services/solution-materialization-server';

import type { SolutionMaterializationTask } from '@originos/core/lib/features/project';
import type { ApiResponse } from '@originos/core/types';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  readonly params: Promise<{ id: string; version: string }>;
}

function response(
  data: SolutionMaterializationTask,
  status = 200
): NextResponse<ApiResponse<SolutionMaterializationTask>> {
  return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() }, { status });
}

function failure(error: unknown): NextResponse<ApiResponse<never>> {
  const code = error !== null && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : 'INTERNAL_ERROR';
  let status = 409;
  if (code === 'SOLUTION_NOT_FOUND') {
    status = 404;
  } else if (code === 'INTERNAL_ERROR') {
    status = 500;
  }
  return NextResponse.json({
    success: false,
    error: {
      code,
      message: error instanceof Error ? error.message : 'Unknown materialization error',
    },
    timestamp: new Date().toISOString(),
  }, { status });
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse<ApiResponse<SolutionMaterializationTask> | ApiResponse<never>>> {
  try {
    const { id: projectId, version: solutionVersion } = await params;
    const solutionId = request.nextUrl.searchParams.get('solutionId') || projectId;
    const task = await getSolutionMaterializationBackgroundRunner().get({ projectId, solutionId, solutionVersion });
    if (!task) {
      return NextResponse.json<ApiResponse<never>>({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Solution materialization has not started.' },
        timestamp: new Date().toISOString(),
      }, { status: 404 });
    }
    return response(task);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse<ApiResponse<SolutionMaterializationTask> | ApiResponse<never>>> {
  try {
    const { id: projectId, version: solutionVersion } = await params;
    const body = await request.json().catch(() => ({})) as { solutionId?: unknown; retryFailed?: unknown };
    const solutionId = typeof body.solutionId === 'string' && body.solutionId.trim()
      ? body.solutionId.trim()
      : projectId;
    const result = await getSolutionMaterializationBackgroundRunner().start({
      projectId,
      solutionId,
      solutionVersion,
      retryFailed: body.retryFailed === true,
    });
    return response(result.task, result.recovered ? 200 : 202);
  } catch (error) {
    return failure(error);
  }
}
