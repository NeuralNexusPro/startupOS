/**
 * API Route: Skills
 * GET /api/skills - List all available skills
 */

import { NextRequest, NextResponse } from 'next/server';
import { listSkills } from '@originos/core/lib/features/skills';
import type {
  ApiResponse,
} from '@originos/core/types';
import type { SkillListResponse, SkillSource } from '@originos/core/lib/features/skills';

export const dynamic = 'force-dynamic';

/**
 * GET /api/skills
 *
 * List all available skills across all sources (bundled, user, project)
 *
 * Query params:
 * - source: Filter by source type (bundled, user, project)
 * - includeInvisible: Include skills with disableModelInvocation=true (default: false)
 * - includeDiagnostics: Include diagnostics in response (default: true)
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     skills: SkillListItem[],
 *     diagnostics: SkillDiagnosticItem[]
 *   },
 *   timestamp: string
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const responseData = listSkills({
      source: (searchParams.get('source') as SkillSource | null) ?? undefined,
      includeInvisible: searchParams.get('includeInvisible') === 'true',
      includeDiagnostics: searchParams.get('includeDiagnostics') !== 'false',
    });

    return NextResponse.json<ApiResponse<SkillListResponse>>(
      {
        success: true,
        data: responseData,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (error) {
    console.error('Error listing skills:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
