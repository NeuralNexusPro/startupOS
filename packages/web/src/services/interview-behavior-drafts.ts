export interface BehaviorDraftReviewDto {
  id: string;
  sourceId: string;
  draftRevision: number;
  candidateHash: string;
  status: 'collecting' | 'ready' | 'needs_review' | 'published' | 'discarded';
  summary: string;
  candidateCount: number;
  unresolvedClarificationCount: number;
  confirmation?: { status: 'required' | 'confirmed'; confirmedAt?: string };
}

interface DraftEnvelope {
  success: boolean;
  data?: { draft: BehaviorDraftReviewDto | null; recovered?: boolean };
  error?: { message?: string };
}

function browserOperationId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function parse(response: Response): Promise<DraftEnvelope> {
  try { return await response.json() as DraftEnvelope; }
  catch { return { success: false, error: { message: '服务返回了无效响应。' } }; }
}

export async function loadInterviewBehaviorDraft(projectId: string, sourceId: string): Promise<BehaviorDraftReviewDto | null> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/interview/behavior-drafts?sourceId=${encodeURIComponent(sourceId)}`);
  const payload = await parse(response);
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message ?? '无法读取行动草稿。');
  return payload.data.draft;
}

export async function confirmInterviewBehaviorDraft(projectId: string, draft: BehaviorDraftReviewDto): Promise<BehaviorDraftReviewDto> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/interview/behavior-drafts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceId: draft.sourceId,
      draftId: draft.id,
      expectedDraftRevision: draft.draftRevision,
      candidateHash: draft.candidateHash,
      confirmationId: browserOperationId('behavior-confirmation'),
      operationId: browserOperationId('behavior-publish'),
    }),
  });
  const payload = await parse(response);
  if (!response.ok || !payload.success || !payload.data?.draft) throw new Error(payload.error?.message ?? '草稿未能发布，请刷新后重试。');
  return payload.data.draft;
}
