/**
 * API Route: Destroy Agent Session
 * POST /api/agent/sessions/[sessionId]/destroy
 *
 * Destroys the agent instance for a session (called when closing a window).
 * The persistent session data (messages) is preserved on disk.
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentManager } from '@originos/core/lib/features/agent/server';
import { agentSessionService } from '@originos/core/lib/features/agent';
import { getGlobalSpawner } from '@originos/core/modules/collaboration-runtime/sandbox/agent-spawner';
import type { ApiResponse } from '@originos/core/types';

const USE_RUNTIME_MODE = process.env['USE_COLLABORATION_RUNTIME'] === 'true';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;

    console.log('[API /destroy/[sessionId]] Destroying session:', sessionId, 'runtimeMode:', USE_RUNTIME_MODE);

    if (USE_RUNTIME_MODE) {
      // Runtime 模式：通过全局 spawner 清理子进程
      const spawner = getGlobalSpawner();

      // 1. 直接通过 sessionId 查找
      const proc = spawner.get(sessionId);
      if (proc) {
        await spawner.destroy(sessionId);
        console.log('[API /destroy/[sessionId]] Destroyed runtime agent by sessionId:', sessionId);
        return successResponse(sessionId, true);
      }

      // 2. 兜底：遍历所有进程模糊匹配
      const allProcs = spawner.list();
      console.log('[API /destroy/[sessionId]] Global spawner processes:', allProcs.map(p => p.id).join(', ') || '(none)');
      for (const p of allProcs) {
        if (p.id.includes(sessionId)) {
          await spawner.destroy(p.id);
          console.log('[API /destroy/[sessionId]] Destroyed runtime agent by fuzzy match:', p.id);
          return successResponse(sessionId, true);
        }
      }

      // 3. 通过 session DB 查找：skill 场景下 sessionId 可能是技能名，
      //    实际子进程用的是 UUID。通过 projectId 查最近会话拿到 UUID。
      const session = await agentSessionService.getSession(sessionId);
      if (session?.projectContext?.projectId) {
        const projId = session.projectContext.projectId;
        const sessions = await agentSessionService.listSessions(projId);
        if (sessions.length > 0) {
          const latestUuid = sessions[0]!.sessionId;
          const proc = spawner.get(latestUuid);
          if (proc) {
            await spawner.destroy(latestUuid);
            console.log('[API /destroy/[sessionId]] Destroyed runtime agent via session DB lookup:', latestUuid);
            return successResponse(sessionId, true);
          }
        }
      }

      console.log('[API /destroy/[sessionId]] No runtime agent found for sessionId:', sessionId);
      return successResponse(sessionId, false);
    }

    // In-process 模式（原有逻辑）
    // Try direct removal first (matches in-process and runtime agents keyed by UUID)
    let removed = await agentManager.finalizeAndRemoveAgent(sessionId);

    // If not found, try by projectId — skill/project windows use a stable
    // sessionId like 'skill-{name}' but the runtime bridge is keyed by the
    // server-generated UUID. Find all agents matching this projectId.
    if (!removed) {
      const session = await agentSessionService.getSession(sessionId);
      if (session?.projectContext?.projectId) {
        const projectId = session.projectContext.projectId;
        const stats = agentManager.getStats();
        for (const entry of stats.sessions) {
          // Load the full agent entry to check projectId
          const agentEntry = (agentManager as any).agents.get(entry.sessionId);
          if (agentEntry?.projectId === projectId) {
            removed = await agentManager.finalizeAndRemoveAgent(entry.sessionId);
            if (removed) break;
          }
        }
      }
    }

    return successResponse(sessionId, removed);
  } catch (error) {
    console.error('[API /destroy/[sessionId]] Error:', error);

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

function successResponse(id: string, destroyed: boolean) {
  return NextResponse.json<ApiResponse>(
    {
      success: true,
      data: { sessionId: id, agentDestroyed: destroyed },
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
