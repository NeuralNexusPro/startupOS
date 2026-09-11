/**
 * API Route: Destroy Agent Session
 * POST /api/agent/sessions/destroy
 *
 * Destroys the agent instance for a session (called when closing a window).
 * The persistent session data (messages) is preserved on disk.
 *
 * Accepts JSON body: { sessionId?, projectId? }
 * - sessionId: server-generated UUID (preferred, in-process mode)
 * - projectId: e.g. 'skill-foo', 'project-bar' (used to find runtime bridge)
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentManager } from '@originos/core/lib/features/agent/server';
import { agentSessionService } from '@originos/core/lib/features/agent';
import { getGlobalSpawner } from '@originos/core/modules/collaboration-runtime/sandbox/agent-spawner';
import type { ApiResponse } from '@originos/core/types';

const USE_RUNTIME_MODE = process.env['USE_COLLABORATION_RUNTIME'] === 'true';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sessionId: string | undefined = body?.sessionId;
    const projectId: string | undefined = body?.projectId;

    console.log('[API /destroy] Received:', JSON.stringify({ sessionId, projectId }));

    // Runtime 模式：清理子进程（全部用 sessionId 命名）
    if (USE_RUNTIME_MODE) {
      const spawner = getGlobalSpawner();

      // 1. 优先用 sessionId 直接查找
      if (sessionId) {
        const proc = spawner.get(sessionId);
        if (proc) {
          await spawner.destroy(sessionId);
          console.log('[API /destroy] Destroyed runtime agent by sessionId:', sessionId);
          return successResponse(sessionId, true);
        }
      }

      // 2. sessionId 不是 UUID（skill 场景）：通过 session DB 查找真实 UUID
      //    SkillDialog 用 UUID 启动子进程，但 onClose 传的是技能名
      if (sessionId && projectId) {
        const sessions = await agentSessionService.listSessions(projectId);
        if (sessions.length > 0) {
          const latestUuid = sessions[0]!.sessionId;
          const proc = spawner.get(latestUuid);
          if (proc) {
            await spawner.destroy(latestUuid);
            console.log('[API /destroy] Destroyed runtime agent via session DB lookup:', latestUuid);
            return successResponse(latestUuid, true);
          }
        }
      }

      // 3. 兜底：遍历所有进程模糊匹配
      const allProcs = spawner.list();
      console.log('[API /destroy] Global spawner processes:', allProcs.map(p => p.id).join(', ') || '(none)');
      const searchKey = sessionId || projectId;
      for (const proc of allProcs) {
        if (searchKey && proc.id.includes(searchKey)) {
          await spawner.destroy(proc.id);
          console.log('[API /destroy] Destroyed runtime agent by fuzzy match:', proc.id);
          return successResponse(proc.id, true);
        }
      }

      console.log('[API /destroy] No runtime agent found for sessionId:', sessionId, 'projectId:', projectId);
      return successResponse(sessionId ?? projectId ?? 'unknown', false);
    }

    // In-process 模式（原有逻辑）
    // 1. Try direct removal by sessionId (in-process mode, or UUID matches)
    let removed = sessionId ? await agentManager.finalizeAndRemoveAgent(sessionId) : false;
    if (removed) {
      console.log('[API /destroy] Removed agent by sessionId:', sessionId);
      return successResponse(sessionId ?? 'unknown', true);
    }

    // 2. Resolve sessionId from projectId: read the session DB to get the UUID
    if (sessionId && !removed) {
      const session = await agentSessionService.getSession(sessionId);
      if (session?.projectContext?.projectId) {
        const actualProjectId = session.projectContext.projectId;
        removed = await removeAgentByProjectId(actualProjectId);
        if (removed) {
          console.log('[API /destroy] Removed agent by projectId (from session):', actualProjectId);
          return successResponse(sessionId, true);
        }
      }
    }

    // 3. Fallback: try by projectId directly (runtime mode, skill/project windows)
    if (projectId && !removed) {
      removed = await removeAgentByProjectId(projectId);
      if (removed) {
        console.log('[API /destroy] Removed agent by projectId:', projectId);
        return successResponse(sessionId ?? projectId, true);
      }
    }

    console.log('[API /destroy] No agent found for sessionId:', sessionId, 'projectId:', projectId);
    return successResponse(sessionId ?? projectId ?? 'unknown', false);
  } catch (error) {
    console.error('[API /destroy] Error:', error);

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
 * Find and remove an agent by projectId.
 * agentManager stores agents keyed by sessionId (UUID), but each AgentEntry
 * has a projectId. This scans all active agents and removes the matching one.
 */
async function removeAgentByProjectId(projectId: string): Promise<boolean> {
  const stats = agentManager.getStats();
  for (const entry of stats.sessions) {
    // Access internal Map to check projectId
    const agentEntry = (agentManager as any).agents.get(entry.sessionId);
    if (agentEntry?.projectId === projectId) {
      await agentManager.finalizeAndRemoveAgent(entry.sessionId);
      return true;
    }
  }
  return false;
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
