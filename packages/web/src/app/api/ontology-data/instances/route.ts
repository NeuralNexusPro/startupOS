import { NextRequest, NextResponse } from 'next/server';
import type { ApiResponse } from '@originos/core/types';
import * as queryEngine from '@originos/core/lib/features/ontology-data-store/query-engine';

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

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const body = await request.json();
    const { ontologyId, conceptId, fields, createdBy } = body;

    if (!ontologyId || !conceptId || !fields) {
      return NextResponse.json<ApiResponse<unknown>>(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'ontologyId, conceptId, and fields are required' }, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const instance = await (await import('@originos/core/lib/features/ontology-data-store/store')).createInstance(
      ontologyId, conceptId, fields, createdBy ?? 'user'
    );

    return NextResponse.json<ApiResponse<typeof instance>>({
      success: true,
      data: instance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to create instance' }, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
