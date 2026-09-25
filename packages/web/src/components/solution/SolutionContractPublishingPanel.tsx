'use client';

import { useId, useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type {
  DesignGap,
  PublishedSolutionExecutionContract,
  PublishSolutionExecutionContractResult,
  SolutionContractCompilationResult,
  SolutionDesignStatus,
} from '@originos/core/lib/features/solution';

export interface SolutionContractPublicationSnapshot {
  readonly designStatus: SolutionDesignStatus;
  readonly published: PublishedSolutionExecutionContract | null;
}

export interface SolutionContractPublishingPanelProps {
  readonly snapshot: SolutionContractPublicationSnapshot;
  readonly onCheck: () => Promise<SolutionContractCompilationResult>;
  readonly onPublish: () => Promise<PublishSolutionExecutionContractResult>;
  readonly onRead: () => Promise<PublishedSolutionExecutionContract | null>;
  readonly onRevoke: (
    contractId: string,
    reason: string
  ) => Promise<PublishedSolutionExecutionContract>;
  readonly onSnapshotChange: (
    published: PublishedSolutionExecutionContract | null
  ) => void;
  readonly onCreateVersion: () => void;
  readonly onLocateGap?: (gap: DesignGap) => void;
}

type Operation = 'check' | 'publish' | 'read' | 'revoke';
type Failure = { readonly code?: string; readonly message: string };
type GroupedGaps = ReadonlyArray<{
  readonly scope: DesignGap['scope'];
  readonly gaps: readonly DesignGap[];
}>;

const DESIGN_STATUS_LABEL: Record<SolutionDesignStatus, string> = {
  draft: '草稿',
  reviewing: '评审中',
  confirmed: '已确认，待发布',
};
const GAP_SCOPE_LABEL: Record<DesignGap['scope'], string> = {
  solution: '方案',
  node: '节点',
  edge: '连接',
  contract: '契约',
  policy: '策略',
};
const GAP_SEVERITY_LABEL: Record<DesignGap['severity'], string> = {
  error: '阻断',
  warning: '提醒',
};

function normalizeFailure(error: unknown): Failure {
  if (error instanceof Error) {
    const code = Reflect.get(error, 'code');
    return {
      ...(typeof code === 'string' ? { code } : {}),
      message: error.message || '操作失败，请稍后重试。',
    };
  }
  if (typeof error === 'object' && error !== null) {
    const code = Reflect.get(error, 'code');
    const message = Reflect.get(error, 'message');
    return {
      ...(typeof code === 'string' ? { code } : {}),
      message:
        typeof message === 'string' && message.trim()
          ? message
          : '操作失败，请稍后重试。',
    };
  }
  return { message: '操作失败，请稍后重试。' };
}

function statusLabel(snapshot: SolutionContractPublicationSnapshot): string {
  if (snapshot.published?.revocation) {
    return '已撤销';
  }
  if (snapshot.published) {
    return '已发布';
  }
  return DESIGN_STATUS_LABEL[snapshot.designStatus];
}

function statusTone(snapshot: SolutionContractPublicationSnapshot): string {
  if (snapshot.published?.revocation) {
    return 'border-amber-300 bg-amber-50 text-amber-800';
  }
  if (snapshot.published) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  }
  if (snapshot.designStatus === 'confirmed') {
    return 'border-blue-300 bg-blue-50 text-blue-800';
  }
  return 'border-slate-300 bg-slate-50 text-slate-700';
}

function compareGaps(left: DesignGap, right: DesignGap): number {
  if (left.severity === right.severity) {
    return left.code.localeCompare(right.code);
  }
  return left.severity === 'error' ? -1 : 1;
}

function groupGaps(gaps: readonly DesignGap[]): GroupedGaps {
  const scopes: readonly DesignGap['scope'][] = [
    'solution',
    'node',
    'edge',
    'contract',
    'policy',
  ];
  return scopes
    .map((scope) => ({
      scope,
      gaps: gaps.filter((gap) => gap.scope === scope).sort(compareGaps),
    }))
    .filter((group) => group.gaps.length > 0);
}

// Rendering branches mirror the five authoritative publication states.
// eslint-disable-next-line complexity, max-lines-per-function
export const SolutionContractPublishingPanel = ({
  snapshot,
  onCheck,
  onPublish,
  onRead,
  onRevoke,
  onSnapshotChange,
  onCreateVersion,
  onLocateGap,
}: SolutionContractPublishingPanelProps): ReactElement => {
  const revokeReasonId = useId();
  const [operation, setOperation] = useState<Operation | null>(null);
  const [gaps, setGaps] = useState<readonly DesignGap[]>([]);
  const [checkPassed, setCheckPassed] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const groupedGaps = useMemo(() => groupGaps(gaps), [gaps]);
  const published = snapshot.published;
  const isBusy = operation !== null;
  const hasBlockingGap = gaps.some((gap) => gap.severity === 'error');
  const isConflict = failure?.code === 'CONTRACT_VERSION_CONFLICT';
  let publishHintId: string | undefined;
  if (snapshot.designStatus !== 'confirmed') {
    publishHintId = 'solution-contract-confirmed-hint';
  } else if (hasBlockingGap) {
    publishHintId = 'solution-contract-blocking-gap-hint';
  }

  const run = async (
    nextOperation: Operation,
    action: () => Promise<void>
  ): Promise<void> => {
    setOperation(nextOperation);
    setFailure(null);
    try {
      await action();
    } catch (error) {
      setFailure(normalizeFailure(error));
    } finally {
      setOperation(null);
    }
  };
  const handleCheck = (): Promise<void> =>
    run('check', async () => {
      const result = await onCheck();
      setGaps(result.ok ? [] : result.gaps);
      setCheckPassed(result.ok);
    });
  const handlePublish = (): Promise<void> =>
    run('publish', async () => {
      const result = await onPublish();
      if (result.ok === false) {
        setGaps(result.gaps);
        setCheckPassed(false);
        return;
      }
      setGaps([]);
      setCheckPassed(true);
      onSnapshotChange(await onRead());
    });
  const handleRead = (): Promise<void> =>
    run('read', async () => onSnapshotChange(await onRead()));
  const handleRevoke = (): Promise<void> =>
    run('revoke', async () => {
      if (!published) {
        return;
      }
      await onRevoke(published.contract.contractId, revokeReason.trim());
      setRevokeReason('');
      onSnapshotChange(await onRead());
    });

  return (
    <section
      aria-labelledby="solution-contract-publishing-title"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="solution-contract-publishing-title"
            className="text-base font-semibold text-slate-900"
          >
            执行契约发布
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            发布前检查方案语义；发布后的契约标识保持只读。
          </p>
        </div>
        <span
          data-testid="publishing-status"
          className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone(snapshot)}`}
        >
          {statusLabel(snapshot)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={() => void handleCheck()}
        >
          {operation === 'check' && (
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          )}
          {operation === 'check' ? '正在检查' : '检查发布条件'}
        </Button>
        {!published && (
          <Button
            type="button"
            size="sm"
            disabled={
              isBusy ||
              snapshot.designStatus !== 'confirmed' ||
              hasBlockingGap
            }
            aria-describedby={publishHintId}
            onClick={() => void handlePublish()}
          >
            {operation === 'publish' && (
              <Loader2
                aria-hidden="true"
                className="mr-2 h-4 w-4 animate-spin"
              />
            )}
            {operation === 'publish' ? '正在发布' : '发布执行契约'}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isBusy}
          onClick={() => void handleRead()}
        >
          {operation === 'read' && (
            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          )}
          {operation === 'read' ? '正在刷新' : '刷新状态'}
        </Button>
      </div>
      {!published && snapshot.designStatus !== 'confirmed' && (
        <p
          id="solution-contract-confirmed-hint"
          className="mt-3 text-sm text-slate-600"
        >
          方案状态变为“已确认”后才能发布执行契约。
        </p>
      )}
      {!published &&
        snapshot.designStatus === 'confirmed' &&
        hasBlockingGap && (
          <p
            id="solution-contract-blocking-gap-hint"
            className="mt-3 text-sm text-red-700"
          >
            请先修复阻断缺口并重新检查，检查通过后才能发布。
          </p>
        )}
      {checkPassed && gaps.length === 0 && !failure && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          发布条件检查通过。发布时系统会重新检查最新方案。
        </div>
      )}
      {failure && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          <p className="font-medium">
            {isConflict ? '当前版本不能覆盖' : '操作失败'}
          </p>
          <p className="mt-1">
            {isConflict
              ? '该版本已发布不同内容，请创建新版本后重新发布。'
              : failure.message}
          </p>
          {isConflict && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onCreateVersion}
            >
              创建新版本
            </Button>
          )}
        </div>
      )}
      {groupedGaps.length > 0 && (
        <div className="mt-5" aria-labelledby="solution-design-gaps-title">
          <h3
            id="solution-design-gaps-title"
            className="text-sm font-semibold text-slate-900"
          >
            设计缺口
          </h3>
          <div className="mt-3 space-y-4">
            {groupedGaps.map((group) => (
              <section
                key={group.scope}
                aria-labelledby={`gap-scope-${group.scope}`}
              >
                <h4
                  id={`gap-scope-${group.scope}`}
                  className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {GAP_SCOPE_LABEL[group.scope]}
                </h4>
                <ul className="mt-2 space-y-2">
                  {group.gaps.map((gap) => (
                    <li
                      key={`${gap.scope}:${gap.code}:${gap.refId ?? gap.path ?? gap.message}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={
                                gap.severity === 'error'
                                  ? 'rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700'
                                  : 'rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'
                              }
                            >
                              {GAP_SEVERITY_LABEL[gap.severity]}
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              {gap.code}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-900">
                            {gap.message}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {gap.remediation}
                          </p>
                          {(gap.refId || gap.path) && (
                            <p className="mt-1 break-all font-mono text-xs text-slate-500">
                              {gap.refId ?? gap.path}
                            </p>
                          )}
                        </div>
                        {onLocateGap && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`定位缺口：${gap.message}`}
                            onClick={() => onLocateGap(gap)}
                          >
                            定位
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
      {published && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">只读契约标识</h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">方案版本</dt>
              <dd className="mt-1 break-all font-mono text-slate-900">
                {published.contract.solutionVersion}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Contract ID</dt>
              <dd className="mt-1 break-all font-mono text-slate-900">
                {published.contract.contractId}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Contract Hash</dt>
              <dd className="mt-1 break-all font-mono text-slate-900">
                {published.contract.contractHash}
              </dd>
            </div>
          </dl>
          {published.revocation ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">
                该执行契约已撤销，新 Run 不能再使用。
              </p>
              <p className="mt-1">原因：{published.revocation.reason}</p>
            </div>
          ) : (
            <form
              className="mt-4 border-t border-slate-200 pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (revokeReason.trim()) {
                  void handleRevoke();
                }
              }}
            >
              <label
                htmlFor={revokeReasonId}
                className="text-sm font-medium text-slate-800"
              >
                撤销原因
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id={revokeReasonId}
                  value={revokeReason}
                  disabled={isBusy}
                  required
                  onChange={(event) => setRevokeReason(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                  placeholder="说明为什么停止新 Run 使用此契约"
                />
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={isBusy || !revokeReason.trim()}
                >
                  {operation === 'revoke' ? '正在撤销' : '撤销契约'}
                </Button>
              </div>
            </form>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-600">
              修改方案需要创建新的 solution version。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCreateVersion}
            >
              创建新版本
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};
