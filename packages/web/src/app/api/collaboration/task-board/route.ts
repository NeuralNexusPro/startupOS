import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import { readSupervisorTaskBoard } from '@originos/core/modules/collaboration-runtime/facade';
import { resolveContractArtifactProjectPath } from '@originos/core/lib/features/project';
import { getDataRoot } from '@originos/core/lib/paths';
import { getProjectContractRuntimeComposition } from '@/services/ontologyCrossPackageService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const projectId = new URL(request.url).searchParams.get('projectId')?.trim() || undefined;
    return NextResponse.json(await readSupervisorTaskBoard(undefined, projectId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无法读取 Supervisor 任务看板' },
      { status: 500 },
    );
  }
}

interface ResolveHitlBody {
  action?: 'resolve-hitl' | 'resolve-artifact';
  projectId?: string;
  artifactRef?: string;
  runId?: string;
  requestId?: string;
  attemptId?: string;
  leaseEpoch?: number;
  answer?: string;
}

function hitlDecision(answer: string): 'approve' | 'reject' | 'edit' | null {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) return null;
  if (['approve', '批准', '同意', '确认', '继续', '可以', 'yes', 'y'].includes(normalized)) return 'approve';
  if (['reject', '拒绝', '不同意', '驳回', '停止', 'no', 'n'].includes(normalized)) return 'reject';
  return 'edit';
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as ResolveHitlBody;
    const projectId = body.projectId?.trim();
    if (body.action === 'resolve-artifact') {
      const artifactRef = body.artifactRef?.trim();
      if (!projectId || !artifactRef) {
        return NextResponse.json({ error: '缺少项目或产物引用。' }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        path: resolveContractArtifactProjectPath(getDataRoot(), projectId, artifactRef),
      });
    }
    const runId = body.runId?.trim();
    const requestId = body.requestId?.trim();
    const attemptId = body.attemptId?.trim();
    const answer = body.answer?.trim() ?? '';
    const decision = hitlDecision(answer);
    if (!projectId || !runId || !requestId || !attemptId || !Number.isInteger(body.leaseEpoch) || !decision) {
      return NextResponse.json({ error: '请选择“同意”“拒绝”，或填写具体修改意见。' }, { status: 400 });
    }
    const { executionPort } = getProjectContractRuntimeComposition();
    const current = await executionPort.inspect(runId);
    if (current.projectId !== projectId) {
      return NextResponse.json({ error: 'HITL 请求不属于当前项目。' }, { status: 409 });
    }
    const editedPayloadHash = decision === 'edit'
      ? `sha256:${createHash('sha256').update(answer).digest('hex')}`
      : undefined;
    const snapshot = await executionPort.resolveHitl({
      runId,
      requestId,
      attemptId,
      leaseEpoch: body.leaseEpoch!,
      decision,
      decisionRef: `task-board:${requestId}:${decision}${editedPayloadHash ? `:${editedPayloadHash}` : ''}`,
      ...(editedPayloadHash ? { editedPayloadHash } : {}),
    });
    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '无法提交人工确认' },
      { status: 500 },
    );
  }
}
