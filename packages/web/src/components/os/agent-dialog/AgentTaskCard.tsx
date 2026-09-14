'use client';

import { cn } from '@originos/core/lib/utils';
import type { ReactElement } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ListTodo,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  XCircle,
} from 'lucide-react';

import type {
  AgentTaskAction,
  AgentTaskCriterionProjectionV1,
  AgentTaskRuntimeSnapshotV1,
  AgentTaskStepProjectionV1,
  ControlAgentTaskRequestV1,
} from '@originos/core/lib/integrations/pi-agent/task-runtime';

interface AgentTaskCardProps {
  snapshot: AgentTaskRuntimeSnapshotV1;
  error?: string | null;
  pendingAction?: 'create' | ControlAgentTaskRequestV1['action'] | null;
  onControl(action: ControlAgentTaskRequestV1['action']): void;
}

const STATUS_LABELS: Record<AgentTaskRuntimeSnapshotV1['execution']['status'], string> = {
  idle: '空闲',
  planning: '规划中',
  running: '执行中',
  waiting_user: '等待用户',
  paused: '已暂停',
  failed: '失败',
  completed: '已完成',
  cancelled: '已取消',
};

const StepStatusIcon = ({ status }: { status: AgentTaskStepProjectionV1['status'] }): ReactElement => {
  if (status === 'done') {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />;
  }
  if (status === 'active') {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  }
  if (status === 'skipped') {
    return <Circle className="h-4 w-4 shrink-0 text-gray-300" />;
  }
  return <Circle className="h-4 w-4 shrink-0 text-gray-400" />;
};

const CriterionStatusIcon = ({ status }: { status: AgentTaskCriterionProjectionV1['status'] }): ReactElement => {
  if (status === 'satisfied') {
    return <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />;
  }
  if (status === 'failed') {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />;
  }
  return <ShieldCheck className="h-4 w-4 shrink-0 text-gray-400" />;
};

function actionAvailable(actions: AgentTaskAction[], action: AgentTaskAction): boolean {
  return actions.includes(action);
}

export const AgentTaskCard = ({
  snapshot,
  error,
  pendingAction,
  onControl,
}: AgentTaskCardProps): ReactElement => {
  const { execution, projection } = snapshot;
  const draft = execution.draft;
  const title = projection?.title || draft?.title || '当前任务';
  const objective = projection?.objective || draft?.objective || '';
  const actions = projection?.actions || [];
  const canStop = actionAvailable(actions, 'stop')
    || execution.status === 'planning'
    || execution.status === 'running';
  const canCancel = actionAvailable(actions, 'cancel')
    || execution.status === 'planning'
    || execution.status === 'running'
    || execution.status === 'waiting_user'
    || execution.status === 'paused'
    || execution.status === 'failed';
  const canResume = actionAvailable(actions, 'resume')
    || execution.status === 'paused';
  const canRetry = actionAvailable(actions, 'retry')
    || (execution.status === 'failed' && Boolean(draft));

  return (
    <section
      aria-label="当前任务"
      data-task-status={execution.status}
      className="rounded-lg border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/90"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <ListTodo className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
            {objective && (
              <p className="mt-1 break-words text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {objective}
              </p>
            )}
            {draft?.context && (
              <p className="mt-1 break-words text-xs text-gray-500">
                上下文：{draft.context}
              </p>
            )}
          </div>
        </div>
        <span className={cn(
          'shrink-0 rounded px-2 py-1 text-xs font-medium',
          execution.status === 'completed' && 'bg-green-100 text-green-700',
          execution.status === 'failed' && 'bg-red-100 text-red-700',
          execution.status === 'waiting_user' && 'bg-yellow-100 text-yellow-700',
          !['completed', 'failed', 'waiting_user'].includes(execution.status) && 'bg-primary/10 text-primary',
        )}>
          {STATUS_LABELS[execution.status]}
        </span>
      </div>

      {projection && (
        <>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
              <span>总体进度</span>
              <span>{projection.progress}%</span>
            </div>
            <progress
              value={Math.min(100, Math.max(0, projection.progress))}
              max={100}
              className="h-2 w-full overflow-hidden rounded accent-primary"
              aria-label="任务总体进度"
            />
          </div>

          {(projection.currentStep || projection.nextAction) && (
            <div className="mt-3 border-l-2 border-primary/40 pl-3 text-xs">
              {projection.currentStep && (
                <p className="break-words text-gray-700 dark:text-gray-300">
                  <span className="font-medium">当前步骤：</span>{projection.currentStep}
                </p>
              )}
              {projection.nextAction && (
                <p className="mt-1 break-words text-gray-500">
                  <span className="font-medium">下一步：</span>{projection.nextAction}
                </p>
              )}
            </div>
          )}

          {projection.steps.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">执行步骤</h4>
              <ol className="space-y-2">
                {projection.steps.map((step) => (
                  <li key={step.id} className="flex min-w-0 items-start gap-2 text-xs">
                    <StepStatusIcon status={step.status} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-gray-700 dark:text-gray-300">{step.text}</p>
                      {step.expectedOutput && (
                        <p className="mt-0.5 break-words text-gray-500">
                          预期：{step.expectedOutput}
                        </p>
                      )}
                      <p className="mt-0.5 text-gray-400">
                        证据 {step.evidenceCount}{step.evidenceRequired ? '（必需）' : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {projection.criteria.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">验收与证据</h4>
              <ul className="space-y-2">
                {projection.criteria.map((criterion) => (
                  <li key={criterion.id} className="flex min-w-0 items-start gap-2 text-xs">
                    <CriterionStatusIcon status={criterion.status} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-gray-700 dark:text-gray-300">{criterion.text}</p>
                      <p className="mt-0.5 text-gray-400">证据 {criterion.evidenceCount}</p>
                      {criterion.note && (
                        <p className="mt-0.5 break-words text-gray-500">{criterion.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {projection.blockers.filter((blocker) => !blocker.resolved).map((blocker) => (
            <div key={blocker.id} className="mt-3 border-l-2 border-yellow-500 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300">
              <p className="break-words font-medium">阻塞：{blocker.reason}</p>
              <p className="mt-1 break-words">需要：{blocker.neededToUnblock}</p>
            </div>
          ))}

          {execution.status === 'waiting_user' && (
            <div className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-300">
              请在下方消息输入框回复阻塞问题。回复会继续当前任务，不会创建普通聊天轮次。
            </div>
          )}

          {projection.warnings.map((warning, index) => (
            <p key={`${warning}-${index}`} className="mt-2 break-words text-xs text-yellow-700 dark:text-yellow-300">
              警告：{warning}
            </p>
          ))}

          {projection.truncated && (
            <p className="mt-2 text-xs text-gray-400">部分内容已按显示上限省略。</p>
          )}
        </>
      )}

      {(execution.lastError?.message || error) && (
        <p role="alert" className="mt-3 break-words text-xs text-red-600 dark:text-red-400">
          {error || execution.lastError?.message}
        </p>
      )}

      {(canStop || canCancel || canResume || canRetry) && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {canStop && (
            <button
              type="button"
              onClick={() => onControl('stop')}
              disabled={Boolean(pendingAction)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"
            >
              {pendingAction === 'stop' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              停止续跑
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => onControl('cancel')}
              disabled={Boolean(pendingAction)}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"
            >
              {pendingAction === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              取消任务
            </button>
          )}
          {canResume && (
            <button
              type="button"
              onClick={() => onControl('resume')}
              disabled={Boolean(pendingAction)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {pendingAction === 'resume' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              恢复
            </button>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={() => onControl('retry')}
              disabled={Boolean(pendingAction)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs text-white hover:bg-primary/90 disabled:opacity-40"
            >
              {pendingAction === 'retry' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              重试
            </button>
          )}
        </div>
      )}
    </section>
  );
}
