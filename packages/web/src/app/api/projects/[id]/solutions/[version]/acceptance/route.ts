import { NextResponse } from 'next/server';

import type {
  SaveSolutionOutputAcceptanceInput,
  SolutionNodeOutputAcceptance,
  SolutionOutputAcceptanceSnapshot,
} from '@originos/core/lib/features/solution';
import type { IpcResponse } from '@originos/core/lib/integrations/electron';
import {
  getSolutionOutputAcceptanceService,
  solutionOutputAcceptanceError,
} from '@/services/solution-output-acceptance-server';

interface RouteContext {
  readonly params: Promise<{ id: string; version: string }>;
}

interface SaveBody {
  readonly solutionId?: unknown;
  readonly nodes?: unknown;
}

function success<T>(data: T): IpcResponse<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

function invalid<T>(message: string): IpcResponse<T> {
  return {
    success: false,
    error: { code: 'INVALID_REQUEST', message },
    timestamp: new Date().toISOString(),
  };
}

function isAcceptanceNode(value: unknown): value is SolutionNodeOutputAcceptance {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['nodeId'] === 'string' &&
    ['automatic', 'user', 'role'].includes(String(candidate['mode'])) &&
    (candidate['approverRole'] === undefined ||
      typeof candidate['approverRole'] === 'string')
  );
}

export async function GET(
  request: Request,
  { params }: RouteContext
): Promise<NextResponse<IpcResponse<SolutionOutputAcceptanceSnapshot>>> {
  const { id: projectId, version: solutionVersion } = await params;
  const solutionId = new URL(request.url).searchParams.get('solutionId');
  if (!solutionId) {
    return NextResponse.json(invalid('缺少 solutionId。'));
  }
  try {
    const snapshot = await getSolutionOutputAcceptanceService().load({
      projectId,
      solutionId,
      solutionVersion,
    });
    return NextResponse.json(
      snapshot ? success(snapshot) : invalid('未找到方案版本。')
    );
  } catch (error) {
    return NextResponse.json(solutionOutputAcceptanceError(error));
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext
): Promise<NextResponse<IpcResponse<SolutionOutputAcceptanceSnapshot>>> {
  const { id: projectId, version: solutionVersion } = await params;
  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json(invalid('请求内容不是有效 JSON。'));
  }
  if (
    typeof body.solutionId !== 'string' ||
    !Array.isArray(body.nodes) ||
    !body.nodes.every(isAcceptanceNode)
  ) {
    return NextResponse.json(invalid('产出验收配置格式无效。'));
  }
  const input: SaveSolutionOutputAcceptanceInput = {
    projectId,
    solutionId: body.solutionId,
    solutionVersion,
    nodes: body.nodes,
  };
  try {
    return NextResponse.json(
      success(await getSolutionOutputAcceptanceService().save(input))
    );
  } catch (error) {
    return NextResponse.json(solutionOutputAcceptanceError(error));
  }
}
