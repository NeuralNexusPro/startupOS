/**
 * API Route: Abort Agent Operation (Unified)
 * POST /api/agent/abort
 *
 * 统一中断接口，通过 agentId 定位目标。
 * 适用于 project agent 和 skill agent。
 *
 * Body: { agentId: string }
 * - project agent: "project-{projectId}"
 * - skill agent:   "project-{skillId}" 或直接用 skillId
 */

import { NextRequest, NextResponse } from 'next/server';
import { persistentAgentManager } from '@originos/core/lib/features/agent/server';
import { getGlobalSpawner } from '@originos/core/modules/collaboration-runtime/sandbox/agent-spawner';
import { getRuntimeAgent } from '@/app/api/agent/_runtime-agent-registry';
import type { ApiResponse } from '@originos/core/types';

const USE_RUNTIME_MODE = process.env['USE_COLLABORATION_RUNTIME'] === 'true';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agentId: string = body?.agentId;

    if (!agentId) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'agentId is required' },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    if (USE_RUNTIME_MODE) {
      // 1. 直接通过 agentId 从 spawner 查找
      const spawner = getGlobalSpawner();
      const proc = spawner.get(agentId);
      if (proc) {
        await proc.abort();
        console.log(`[API] Aborted agent via spawner: ${agentId}`);
      } else {
        // 2. 尝试从 registry 查找（projectId 映射）
        const projectId = agentId.replace(/^project-/, '');
        const registered = getRuntimeAgent(projectId);
        if (registered?.process) {
          await registered.process.abort();
          console.log(`[API] Aborted agent via registry: ${agentId}`);
        } else {
          // 3. 兜底：遍历所有运行中的 spawner 进程，匹配 projectId
          const allProcs = spawner.list();
          const match = allProcs.find(p => p.id === agentId || p.id.endsWith(agentId));
          if (match) {
            await match.abort();
            console.log(`[API] Aborted agent via spawner scan: ${agentId}`);
          } else {
            console.log(`[API] Agent not found for abort: ${agentId}, treating as already stopped`);
          }
        }
      }
    } else {
      // In-process 模式
      const agent = persistentAgentManager.getAgent(agentId);
      if (agent) {
        const innerAgent = agent.getAgent();
        if (innerAgent) {
          innerAgent.abort();
          // 等待 agent 变为空闲状态（最多 5 秒）
          try {
            await Promise.race([
              innerAgent.waitForIdle(),
              new Promise(resolve => setTimeout(resolve, 5000)),
            ]);
          } catch {
            // ignore timeout
          }
          console.log(`[API] Aborted in-process agent: ${agentId}`);
        }
      } else {
        console.log(`[API] In-process agent not found: ${agentId}`);
      }
    }

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
