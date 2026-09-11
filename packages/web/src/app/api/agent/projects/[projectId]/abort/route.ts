/**
 * API Route: Abort Current Agent Operation
 * POST /api/agent/projects/{projectId}/abort
 *
 * 中断当前项目的 Agent 操作
 * 支持 runtime 模式（子进程）和 in-process 模式
 */

import { NextRequest, NextResponse } from 'next/server';
import { persistentAgentManager } from '@originos/core/lib/features/agent/server';
import { getGlobalSpawner } from '@originos/core/modules/collaboration-runtime/sandbox/agent-spawner';
import { getRuntimeAgent } from '@/app/api/agent/_runtime-agent-registry';
import type { ApiResponse } from '@originos/core/types';

const USE_RUNTIME_MODE = process.env['USE_COLLABORATION_RUNTIME'] === 'true';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const sessionId: string = body?.sessionId ?? `project-${projectId}`;

    if (USE_RUNTIME_MODE) {
      // Runtime 模式：通过子进程 abort
      const agentId = sessionId;
      const spawner = getGlobalSpawner();
      const proc = spawner.get(agentId);
      if (proc) {
        await proc.abort();
        console.log(`[API] Aborted agent via spawner for project: ${projectId}`);
      } else {
        // 也检查注册表
        const registered = getRuntimeAgent(projectId);
        if (registered?.process) {
          await registered.process.abort();
          console.log(`[API] Aborted agent via registry for project: ${projectId}`);
        } else {
          // Agent 不在 spawner 或 registry 中，说明已经被清理或从未启动
          // 视为成功，避免前端报错
          console.log(`[API] Agent not found in spawner/registry for project: ${projectId}, treating as already stopped`);
        }
      }
    } else {
      // In-process 模式
      const agent = persistentAgentManager.getAgent(projectId);
      if (!agent) {
        return NextResponse.json<ApiResponse<unknown>>(
          {
            success: false,
            error: { code: 'AGENT_NOT_RUNNING', message: 'No agent running for this project' },
            timestamp: new Date().toISOString(),
          },
          { status: 404 }
        );
      }

      const innerAgent = agent.getAgent();
      if (!innerAgent) {
        return NextResponse.json<ApiResponse<unknown>>(
          {
            success: false,
            error: { code: 'AGENT_NOT_AVAILABLE', message: 'Agent instance not available' },
            timestamp: new Date().toISOString(),
          },
          { status: 500 }
        );
      }

      innerAgent.abort();
    }

    console.log(`[API] Aborted agent for project: ${projectId}`);

    return NextResponse.json<ApiResponse<null>>(
      {
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Error aborting agent:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'ABORT_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
