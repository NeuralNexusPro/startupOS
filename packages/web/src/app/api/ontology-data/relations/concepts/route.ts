/**
 * API Route: Concept Relations
 * GET    /api/ontology-data/relations/concepts?ontologyId=xxx — 列表
 * POST   /api/ontology-data/relations/concepts?ontologyId=xxx — 创建
 * DELETE /api/ontology-data/relations/concepts?ontologyId=xxx — 删除
 *
 * ONT9-T1-D: legacy 写通道已停用，POST/DELETE 统一结构化拒绝（GET 只读行为保持）。
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';

import { NextRequest, NextResponse } from 'next/server';

import { isValidId, ontologyDir } from '@originos/core/lib/features/ontology-data-store/config';

import { canonicalEditUnavailable } from '../../_shared';

import type { ApiResponse } from '@originos/core/types';

function getOntologyPath(ontologyId: string): string {
  return `${ontologyDir(ontologyId)}/ontology.json`;
}

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const ontologyId = request.nextUrl.searchParams.get('ontologyId');
    if (!ontologyId || !isValidId(ontologyId)) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'ontologyId is required' }, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const ontologyPath = getOntologyPath(ontologyId);
    if (!existsSync(ontologyPath)) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'NOT_FOUND', message: 'Ontology not found' }, timestamp: new Date().toISOString() },
        { status: 404 }
      );
    }

    const content = await fs.readFile(ontologyPath, 'utf-8');
    const ontology = JSON.parse(content);

    return NextResponse.json<ApiResponse<{ relations: unknown[] }>>({
      success: true,
      data: { relations: ontology.relations ?? [] },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to read concept relations' }, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export async function POST(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}

export async function DELETE(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
