/**
 * API Route: Memory Consolidation
 * POST /api/agent/memory/consolidate
 *
 * Called when an agent/project window is closed.
 * Analyzes recent conversation history and updates Memory.md blocks.
 * Fire-and-forget — does not block window close.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  consolidateOwnedMemory,
  type MemoryConsolidationEntryType,
} from '@originos/core/modules/memory-core/index';
import type { ApiResponse } from '@originos/core/types';
import { getDataRoot } from '@originos/core/lib/paths';
import { createAutoModel } from '@originos/core/lib/integrations/pi-agent/server-config';

const ENTRY_TYPES = new Set<MemoryConsolidationEntryType>(['project', 'solution', 'agent', 'role-agent', 'skill']);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entryType, entryId } = body as { entryType: string; entryId: string };

    if (!entryType || !entryId) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: 'entryType and entryId are required' },
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    if (!ENTRY_TYPES.has(entryType as MemoryConsolidationEntryType)) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: { code: 'BAD_REQUEST', message: `Unknown entryType: ${entryType}` },
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    const result = await consolidateOwnedMemory({
      dataRoot: getDataRoot(),
      entryType: entryType as MemoryConsolidationEntryType,
      entryId,
    }, { createAutoModel });

    return NextResponse.json<ApiResponse<unknown>>({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[POST /api/agent/memory/consolidate] error:', error);
    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: String(error) },
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
