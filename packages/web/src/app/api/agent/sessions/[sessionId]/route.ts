/**
 * API Route: Get Agent Session
 * GET /api/agent/sessions/{sessionId}
 *
 * Load a specific agent session
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentSessionService } from '@originos/core/lib/features/agent';
import type { ApiResponse } from '@originos/core/types';
import { agentManager } from '@originos/core/lib/features/agent/server';
import {
  restoreSessionAtBoundary,
  RestoreAgentSessionError,
  toRestoreAgentSessionError,
  type RestoreAgentEntryType,
} from '@originos/core/lib/integrations/pi-agent/session-restore';

const RESTORE_ENTRY_TYPES = new Set<RestoreAgentEntryType>([
  'skill',
  'agent',
  'role-agent',
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;

    // Get projectId from query params if provided
    const { searchParams } = new URL(_request.url);
    const projectId = searchParams.get('projectId') || undefined;
    const entryTypeValue = searchParams.get('entryType') || undefined;
    const entryId = searchParams.get('entryId') || undefined;
    const entryType = entryTypeValue && RESTORE_ENTRY_TYPES.has(entryTypeValue as RestoreAgentEntryType)
      ? entryTypeValue as RestoreAgentEntryType
      : undefined;

    if (!projectId || !entryType || !entryId) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'RESTORE_FAILED',
            message: 'A valid projectId, entryType, and entryId are required',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    const restoreRequest = {
      sessionId,
      projectId,
      entryType,
      entryId,
    };
    const session = await restoreSessionAtBoundary(restoreRequest, {
      getSession: (requestedSessionId, requestedProjectId) =>
        agentSessionService.getSession(requestedSessionId, requestedProjectId),
      hydrateRuntime: async (storedSession) => {
        await agentManager.restoreAgentRuntime(storedSession);
      },
    });

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: session,
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Error getting session:', error);
    const restoreError = error instanceof RestoreAgentSessionError
      ? error
      : toRestoreAgentSessionError(error);
    const status = restoreError.code === 'NOT_FOUND'
      ? 404
      : restoreError.code === 'OWNERSHIP_MISMATCH'
        ? 403
        : restoreError.code === 'CORRUPT_SESSION'
          ? 422
          : 500;

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: restoreError.code,
          message: restoreError.message,
        },
        timestamp: new Date().toISOString(),
      },
      { status },
    );
  }
}

/**
 * API Route: Update Session
 * PUT /api/agent/sessions/{sessionId}
 */
export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const body = await _request.json();

    // Get projectId from query params if provided
    const { searchParams } = new URL(_request.url);
    const projectId = searchParams.get('projectId') || undefined;

    const session = await agentSessionService.updateSession(sessionId, body, projectId);

    if (!session) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 },
      );
    }

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: session,
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Error updating session:', error);

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
 * API Route: Delete Session
 * DELETE /api/agent/sessions/{sessionId}
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;

    const deleted = await agentSessionService.deleteSession(sessionId);

    if (!deleted) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 },
      );
    }

    return NextResponse.json<ApiResponse<{ deleted: true }>>(
      {
        success: true,
        data: { deleted: true },
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Error deleting session:', error);

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
