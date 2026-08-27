'use client';

import { useMemo, type ReactElement } from 'react';

import { ListTodo, Loader2, Plus, Trash2, X } from 'lucide-react';

import type { AgentTaskDraftInput } from '@/services/agent-task-runtime';

interface AgentTaskDraftCardProps {
  draft: AgentTaskDraftInput;
  submitting?: boolean;
  error?: string | null;
  onChange(draft: AgentTaskDraftInput): void;
  onCancel(): void;
  onSubmit(): void;
}

export const AgentTaskDraftCard = ({
  draft,
  submitting = false,
  error,
  onChange,
  onCancel,
  onSubmit,
}: AgentTaskDraftCardProps): ReactElement => {
  const canSubmit = useMemo(
    () => draft.title.trim().length > 0 && draft.objective.trim().length > 0 && !submitting,
    [draft.objective, draft.title, submitting],
  );

  const updateCriterion = (index: number, value: string): void => {
    const acceptanceCriteria = [...draft.acceptanceCriteria];
    acceptanceCriteria[index] = value;
    onChange({ ...draft, acceptanceCriteria });
  };

  const removeCriterion = (index: number): void => {
    const acceptanceCriteria = draft.acceptanceCriteria.filter((_, itemIndex) => itemIndex !== index);
    onChange({
      ...draft,
      acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : [''],
    });
  };

  return (
    <section
      aria-label="任务草稿"
      className="rounded-lg border border-primary/30 bg-white/80 p-4 shadow-sm dark:bg-gray-900/80"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListTodo className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">创建任务</h3>
            <p className="text-xs text-gray-500">提交后将在当前会话中规划并执行</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-800"
          aria-label="取消任务草稿"
          title="取消"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          标题
          <input
            value={draft.title || ''}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            disabled={submitting}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            placeholder="例如：完成候选人评估报告"
          />
        </label>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          任务目标
          <textarea
            value={draft.objective}
            onChange={(event) => onChange({ ...draft, objective: event.target.value })}
            disabled={submitting}
            rows={3}
            className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            placeholder="描述任务最终需要交付的结果"
          />
        </label>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          补充上下文（可选）
          <textarea
            value={draft.context || ''}
            onChange={(event) => onChange({ ...draft, context: event.target.value })}
            disabled={submitting}
            rows={2}
            className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            placeholder="补充背景、输入来源、约束或工作范围"
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">验收标准（可选）</span>
            <button
              type="button"
              onClick={() => onChange({
                ...draft,
                acceptanceCriteria: [...draft.acceptanceCriteria, ''],
              })}
              disabled={submitting}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              添加
            </button>
          </div>
          <div className="space-y-2">
            {draft.acceptanceCriteria.map((criterion, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={criterion}
                  onChange={(event) => updateCriterion(index, event.target.value)}
                  disabled={submitting}
                  aria-label={`验收标准 ${index + 1}`}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                  placeholder={`验收标准 ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeCriterion(index)}
                  disabled={submitting}
                  className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40"
                  aria-label={`删除验收标准 ${index + 1}`}
                  title="删除验收标准"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 break-words text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          提交任务
        </button>
      </div>
    </section>
  );
}
