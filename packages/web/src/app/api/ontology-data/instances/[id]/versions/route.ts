/**
 * Instance Versions API
 * GET  /api/ontology-data/instances/[id]/versions?ontologyId=xxx — 版本列表
 * POST /api/ontology-data/instances/[id]/versions — 保存版本快照
 *
 * ONT9-T1-D: legacy 写通道已停用，POST 统一结构化拒绝（GET 只读行为保持）。
 */

import { NextRequest, NextResponse } from 'next/server';

import * as version from '@originos/core/lib/features/ontology-data-store/version';

import { canonicalEditUnavailable } from '../../../_shared';

import type { ApiResponse } from '@originos/core/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const { id: instanceId } = await params;
    const ontologyId = request.nextUrl.searchParams.get('ontologyId');

    if (!ontologyId) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'ontologyId is required' }, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const versions = await version.getVersions(ontologyId, instanceId);
    return NextResponse.json<ApiResponse<typeof versions>>({
      success: true,
      data: versions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get versions' }, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export async function POST(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
