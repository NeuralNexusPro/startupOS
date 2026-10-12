/**
 * Shared helpers for /api/ontology-data routes (ONT9-T1-D).
 *
 * Legacy ontology-data 写通道已停用：所有写 handler 统一返回 405
 * CANONICAL_EDIT_UNAVAILABLE，与 desktop 侧 IpcResponse 拒绝惯例对齐。
 * canonical 本体编辑请使用 canonical authoring 通道（/api/projects/[id]/ontology）。
 */

import { NextResponse } from 'next/server';

import type { ApiResponse } from '@originos/core/types';

export function canonicalEditUnavailable(): NextResponse<ApiResponse<never>> {
  return NextResponse.json<ApiResponse<never>>(
    {
      success: false,
      error: {
        code: 'CANONICAL_EDIT_UNAVAILABLE',
        message: 'canonical 本体编辑请使用 canonical authoring 通道；该 legacy 写接口已停用',
      },
      timestamp: new Date().toISOString(),
    },
    { status: 405 }
  );
}
