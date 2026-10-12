/**
 * Instance API
 * GET    /api/ontology-data/instances/[id]?ontologyId=xxx&conceptId=xxx — 读取
 * PUT    /api/ontology-data/instances/[id] — 更新
 * DELETE /api/ontology-data/instances/[id] — 删除
 *
 * ONT9-T1-D: legacy 写通道已停用，PUT/DELETE 统一结构化拒绝（GET 只读行为保持）。
 */

import { NextRequest, NextResponse } from 'next/server';

import * as store from '@originos/core/lib/features/ontology-data-store/store';

import { canonicalEditUnavailable } from '../../_shared';

import type { ApiResponse } from '@originos/core/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const { id: instanceId } = await params;
    const ontologyId = request.nextUrl.searchParams.get('ontologyId');
    const conceptId = request.nextUrl.searchParams.get('conceptId');

    if (!ontologyId || !conceptId) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'ontologyId and conceptId are required' }, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const instance = await store.getInstance(ontologyId, conceptId, instanceId);
    return NextResponse.json<ApiResponse<typeof instance>>({
      success: true,
      data: instance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      { success: false, error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Instance not found' }, timestamp: new Date().toISOString() },
      { status: 404 }
    );
  }
}

export async function PUT(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}

export async function DELETE(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
