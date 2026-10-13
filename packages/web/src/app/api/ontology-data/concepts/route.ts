/**
 * API Route: Concepts (list / create)
 * GET  /api/ontology-data/concepts?ontologyId=xxx
 * POST /api/ontology-data/concepts?ontologyId=xxx
 *
 * ONT9-T1-D: legacy 写通道已停用，POST 统一结构化拒绝。
 * GET 保持原只读行为（直读 legacy ontology.json 的列表兼容读）。
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { NextRequest, NextResponse } from 'next/server';

import { isValidId } from '@originos/core/lib/features/ontology-data-store/config';
import { getDataRoot } from '@originos/core/lib/paths';

import { canonicalEditUnavailable } from '../_shared';

import type { ApiResponse } from '@originos/core/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const ontologyId = request.nextUrl.searchParams.get('ontologyId');
    const domainId = request.nextUrl.searchParams.get('domainId');

    if (!ontologyId || !isValidId(ontologyId)) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'ontologyId is required' }, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const projectId = ontologyId.replace(/^ontology-/, '');
    const ontologyPath = path.join(getDataRoot(), 'projects', projectId, 'ontology', 'ontology.json');

    if (!existsSync(ontologyPath)) {
      return NextResponse.json<ApiResponse<{ concepts: never[]; count: number }>>({
        success: true,
        data: { concepts: [], count: 0 },
        timestamp: new Date().toISOString(),
      });
    }

    const content = await fs.readFile(ontologyPath, 'utf-8');
    const ontology = JSON.parse(content) as {
      concepts?: Array<{ id: string; name: string; domainId: string; type: string; description?: string }>;
    };

    let concepts = ontology.concepts ?? [];
    if (domainId) {
      concepts = concepts.filter((c) => c.domainId === domainId);
    }

    return NextResponse.json<ApiResponse<{ concepts: typeof concepts; count: number }>>({
      success: true,
      data: { concepts, count: concepts.length },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to list concepts' }, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

export async function POST(): Promise<ReturnType<typeof canonicalEditUnavailable>> {
  return canonicalEditUnavailable();
}
