/**
 * API Route: List Skill Sessions
 * GET /api/skill-sessions?skillName=xxx
 *
 * List historical sessions for a specific skill
 */

import { NextRequest, NextResponse } from 'next/server';
import { listSkillSessions, SkillServiceError } from '@originos/core/lib/features/skills';
import type { ApiResponse } from '@originos/core/types';
import type { SkillSessionsResponse } from '@originos/core/lib/features/skills';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const skillName = searchParams.get('skillName');

    const data = await listSkillSessions({ skillName: skillName ?? undefined });

    return NextResponse.json<ApiResponse<SkillSessionsResponse>>(
      {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Error listing skill sessions:', error);
    const status = error instanceof SkillServiceError ? error.status : 500;

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: error instanceof SkillServiceError ? error.code : 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status },
    );
  }
}
