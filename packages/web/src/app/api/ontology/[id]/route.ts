/**
 * API Route: Get Ontology
 * GET /api/ontology/[id]
 *
 * Get a specific ontology
 */

import { NextRequest, NextResponse } from 'next/server';
import { ontologyService } from '@originos/core/lib/features/ontology';
import type { ApiResponse } from '@originos/core/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const ontology = await ontologyService.getOntology(id);

    if (!ontology) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Ontology not found',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 },
      );
    }

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: ontology,
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Error getting ontology:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * API Route: Update Ontology
 * PUT /api/ontology/[id]
 *
 * Apply edit operations to ontology
 */

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await _request.json();

    if (!body.operations || !Array.isArray(body.operations)) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'operations array is required',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    const result = await ontologyService.applyEdits(id, body.operations);

    if (!result.success) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'UPDATE_FAILED',
            message: 'Failed to update ontology',
            details: result.errors,
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: result.ontology,
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Error updating ontology:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * API Route: Delete Ontology
 * DELETE /api/ontology/[id]
 */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Check if ontology exists
    const ontology = await ontologyService.getOntology(id);
    if (!ontology) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Ontology not found',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 },
      );
    }

    // Delete from storage
    const { jsonStore } = await import('@originos/core/lib/storage/json-store');
    await jsonStore.delete(jsonStore.getOntologyPath(id));

    return NextResponse.json<ApiResponse<{ deleted: true }>>(
      {
        success: true,
        data: { deleted: true },
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Error deleting ontology:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
