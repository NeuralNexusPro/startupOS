/**
 * API Route: Concept Schema
 * GET  /api/ontology-data/concepts/[id]/schema?ontologyId=xxx — 获取 schema
 * PUT  /api/ontology-data/concepts/[id]/schema?ontologyId=xxx&domainId=xxx — 更新 schema
 *
 * ONT9-T1-D: legacy 写通道已停用，PUT 统一结构化拒绝（GET 只读行为保持）。
 */

import { NextRequest, NextResponse } from 'next/server';

import { isValidId } from '@originos/core/lib/features/ontology-data-store/config';
import * as schemaValidator from '@originos/core/lib/features/ontology-data-store/schema-validator';

import { canonicalEditUnavailable } from '../../../_shared';

import type { ApiResponse } from '@originos/core/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const { id: conceptId } = await params;
    const ontologyId = request.nextUrl.searchParams.get('ontologyId');

    if (!ontologyId || !isValidId(ontologyId) || !isValidId(conceptId)) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'ontologyId and conceptId are required' }, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const schema = await schemaValidator.loadConceptSchema(ontologyId, conceptId);
    return NextResponse.json<ApiResponse<typeof schema>>({
      success: true,
      data: schema,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      { success: false, error: { code: 'NOT_FOUND', message: error instanceof Error ? error.message : 'Concept schema not found' }, timestamp: new Date().toISOString() },
      { status: 404 }
    );
  }
}

export async function PUT(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
