/**
 * API Route: Stop Project Agent
 * POST /api/agent/projects/{projectId}/stop
 *
 * 停止项目的持久化 Agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { persistentAgentManager } from '@originos/core/lib/features/agent/server';
import { getGlobalSpawner } from '@originos/core/modules/collaboration-runtime/sandbox/agent-spawner';
import { getRuntimeAgent, removeRuntimeAgent } from '@/app/api/agent/_runtime-agent-registry';
import type { ApiResponse } from '@originos/core/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const sessionId: string = body?.sessionId ?? `project-${projectId}`;

    console.log(`[API] Stopping agent for project: ${projectId}`);

    // Runtime 模式：通过 spawner 的 destroy 保证子进程被彻底清理
    const agentId = sessionId;
    const spawner = getGlobalSpawner();
    const existing = spawner.get(agentId);
    if (existing) {
      console.log(`[API] Runtime mode: Destroying subprocess for project ${projectId}`);
      await spawner.destroy(agentId);
      console.log(`[API] Runtime mode: subprocess destroyed for ${projectId}`);
      // 也从注册表移除
      removeRuntimeAgent(projectId);
      return NextResponse.json<ApiResponse<{ projectId: string }>>(
        { success: true, data: { projectId }, timestamp: new Date().toISOString() },
        { status: 200 }
      );
    }
    // 注册表中可能有残留
    const runtimeEntry = getRuntimeAgent(projectId);
    if (runtimeEntry) {
      console.log(`[API] Runtime mode: Stopping subprocess from registry for project ${projectId}`);
      await runtimeEntry.process.shutdown();
      removeRuntimeAgent(projectId);
      return NextResponse.json<ApiResponse<{ projectId: string }>>(
        { success: true, data: { projectId }, timestamp: new Date().toISOString() },
        { status: 200 }
      );
    }

    // In-process 模式：停止持久化 Agent
    await persistentAgentManager.stopAgent(projectId);

    return NextResponse.json<ApiResponse<{ projectId: string }>>(
      { success: true, data: { projectId }, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Error stopping agent:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'AGENT_STOP_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
