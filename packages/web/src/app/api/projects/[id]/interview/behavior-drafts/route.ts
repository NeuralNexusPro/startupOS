import { NextRequest, NextResponse } from 'next/server';

import { InterviewBehaviorDraftService } from '@originos/core/lib/features/project';

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const HASH = /^[a-f0-9]{64}$/;

interface DraftReviewIdentity {
  sourceId: string;
  draftId: string;
  expectedDraftRevision: number;
  candidateHash: string;
  confirmationId: string;
  operationId: string;
}

function response(data: unknown, status = 200): NextResponse {
  return NextResponse.json({
    success: status < 400,
    ...(status < 400 ? { data } : { error: data }),
    timestamp: new Date().toISOString(),
  }, { status });
}

function validProjectId(projectId: string): boolean {
  return PROJECT_ID.test(projectId) && !projectId.includes('..');
}

function asReviewIdentity(value: unknown): DraftReviewIdentity | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  if (
    !TOKEN.test(typeof input['sourceId'] === 'string' ? input['sourceId'] : '') ||
    !TOKEN.test(typeof input['draftId'] === 'string' ? input['draftId'] : '') ||
    typeof input['expectedDraftRevision'] !== 'number' || !Number.isSafeInteger(input['expectedDraftRevision']) || input['expectedDraftRevision'] < 1 ||
    !HASH.test(typeof input['candidateHash'] === 'string' ? input['candidateHash'] : '') ||
    !TOKEN.test(typeof input['confirmationId'] === 'string' ? input['confirmationId'] : '') ||
    !TOKEN.test(typeof input['operationId'] === 'string' ? input['operationId'] : '')
  ) return undefined;
  return input as unknown as DraftReviewIdentity;
}

function draftReviewDto(draft: {
  id: string;
  sourceId: string;
  draftRevision: number;
  candidateHash: string;
  status: string;
  candidates: { actions: readonly unknown[]; factTypes: readonly unknown[]; businessStates: readonly unknown[]; transitions: readonly unknown[]; rules: readonly unknown[] };
  clarifications: readonly { resolved: boolean }[];
  confirmation?: { confirmedAt: string };
}) {
  const candidateCount = draft.candidates.actions.length + draft.candidates.factTypes.length + draft.candidates.businessStates.length + draft.candidates.transitions.length + draft.candidates.rules.length;
  const unresolved = draft.clarifications.filter((item) => !item.resolved).length;
  return {
    id: draft.id,
    sourceId: draft.sourceId,
    draftRevision: draft.draftRevision,
    candidateHash: draft.candidateHash,
    status: draft.status,
    candidateCount,
    unresolvedClarificationCount: unresolved,
    summary: unresolved > 0 ? `还有 ${unresolved} 项待澄清，暂不能写入。` : `已整理 ${candidateCount} 项行动、事实、状态和规则定义，确认后会写入项目本体。`,
    confirmation: draft.status === 'published'
      ? { status: 'confirmed' as const, confirmedAt: draft.confirmation?.confirmedAt }
      : { status: 'required' as const },
  };
}

/**
 * Read-only trusted-renderer review surface. It deliberately returns neither
 * interview messages nor canonical candidate contents; those remain in Core.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: projectId } = await params;
  const sourceId = request.nextUrl.searchParams.get('sourceId') ?? '';
  if (!validProjectId(projectId) || !TOKEN.test(sourceId)) return response({ code: 'INVALID_REQUEST', message: '访谈草稿请求无效。' }, 400);
  try {
    const reviewed = await new InterviewBehaviorDraftService().reviewLatest(projectId, sourceId);
    if (!reviewed.ok) {
      if (reviewed.code === 'DRAFT_NOT_FOUND') return response({ draft: null });
      return response({ code: reviewed.code, message: '无法读取行动草稿。' }, 409);
    }
    return response({ draft: draftReviewDto(reviewed.draft) });
  } catch (error) {
    console.error('[interview behavior draft] read failed', { projectId, name: error instanceof Error ? error.name : 'UnknownError' });
    return response({ code: 'DRAFT_READ_FAILED', message: '无法读取行动草稿，请稍后重试。' }, 500);
  }
}

/**
 * This route is intentionally absent from the Agent tool registry. Only the
 * explicit renderer button submits the review identity and requests publish.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: projectId } = await params;
  if (!validProjectId(projectId)) return response({ code: 'INVALID_PROJECT_ID', message: '项目标识无效。' }, 400);
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return response({ code: 'INVALID_JSON', message: '请求正文不是有效 JSON。' }, 400); }
  const input = asReviewIdentity(payload);
  if (!input) return response({ code: 'INVALID_REVIEW_IDENTITY', message: '确认信息已失效，请刷新草稿后重试。' }, 400);
  try {
    const result = await new InterviewBehaviorDraftService().confirmAndPublishFromTrustedUi({ projectId, ...input });
    if (!result.ok) return response({ code: result.code, message: '草稿内容已变化或尚未满足发布条件，请重新审阅。' }, 409);
    return response({ draft: draftReviewDto(result.draft), recovered: result.recovered ?? false });
  } catch (error) {
    console.error('[interview behavior draft] publish failed', { projectId, operationId: input.operationId, name: error instanceof Error ? error.name : 'UnknownError' });
    return response({ code: 'DRAFT_PUBLISH_FAILED', message: '无法发布行动草稿，请稍后重试。' }, 500);
  }
}
