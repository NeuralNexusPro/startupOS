/**
 * Instances API
 * GET  /api/ontology-data/instances?ontologyId=xxx&conceptId=xxx — 查询
 * POST /api/ontology-data/instances — 创建
 *
 * ONT9-T1-D: legacy 写通道已停用，POST 统一结构化拒绝（GET 只读行为保持）。
 */

import { NextRequest, NextResponse } from 'next/server';

import * as queryEngine from '@originos/core/lib/features/ontology-data-store/query-engine';

import { canonicalEditUnavailable } from '../_shared';

import type { ApiResponse } from '@originos/core/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const ontologyId = request.nextUrl.searchParams.get('ontologyId');
    const conceptId = request.nextUrl.searchParams.get('conceptId');
    const page = request.nextUrl.searchParams.get('page');
    const limit = request.nextUrl.searchParams.get('limit');
    const sortBy = request.nextUrl.searchParams.get('sortBy');
    const sortOrder = request.nextUrl.searchParams.get('sortOrder') as 'asc' | 'desc' | undefined;

    if (!ontologyId || !conceptId) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'ontologyId and conceptId are required' }, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const result = await queryEngine.queryInstances(ontologyId, conceptId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy: sortBy ?? undefined,
      sortOrder,
    } as any);

    return NextResponse.json<ApiResponse<typeof result>>({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to query instances' }, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export async function POST(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
