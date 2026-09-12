/**
 * API Route: Skill Eval 自进化
 * POST /api/agent/skill-evolution
 *
 * 记录技能执行信号，累积到阈值后触发进化分析
 * 使用 Pi Agent 引擎（临时 agent session）分析并改进 SKILL.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleSkillEvolution } from '@originos/core/lib/features/agent/server';
import type { ApiResponse } from '@originos/core/types';
import type { EvolutionResult, SkillEvolutionRequest } from '@originos/core/lib/features/agent/server';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SkillEvolutionRequest;
    const result = await handleSkillEvolution(body);

    return NextResponse.json<ApiResponse<EvolutionResult>>(result.response, {
      status: result.status,
    });
  } catch (error) {
    console.error('[SkillEvolution] Error:', error);

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
