'use client';

import type { ProjectTaskDetail, ProjectTaskSummary } from '@originos/core/lib/features/project';

interface ProjectTaskCollaborationGraphProps {
  readonly tasks: readonly ProjectTaskSummary[];
  readonly selectedTaskId?: string;
  readonly selectedWorkItemId?: string;
  readonly detail?: ProjectTaskDetail;
  readonly onSelectTask: (taskId: string) => void;
  readonly onSelectWorkItem: (taskId: string, workItemId: string) => void;
}

function detailBelongsToSelection(
  detail: ProjectTaskDetail,
  selectedTask: ProjectTaskSummary,
): boolean {
  return detail.taskId === selectedTask.taskId
    && detail.projectId === selectedTask.projectId
    && (!detail.binding || (
      detail.binding.parentTaskId === selectedTask.taskId
      && detail.binding.taskRevision === detail.revision
    ));
}

export function ProjectTaskCollaborationGraph({
  tasks,
  selectedTaskId,
  selectedWorkItemId,
  detail,
  onSelectTask,
  onSelectWorkItem,
}: ProjectTaskCollaborationGraphProps) {
  const selectedTask = tasks.find((task) => task.taskId === selectedTaskId);
  const detailIsValid = Boolean(
    selectedTask
    && detail
    && detailBelongsToSelection(detail, selectedTask),
  );
  const invalidWorkItems = detailIsValid && detail
    ? detail.workItems.filter((workItem) => (
      workItem.binding.parentTaskId !== detail.taskId
      || workItem.binding.taskRevision !== detail.revision
      || (detail.runId !== undefined && workItem.binding.runId !== detail.runId)
    ))
    : [];
  const graphWorkItems = detailIsValid && detail && invalidWorkItems.length === 0
    ? detail.workItems
    : [];

  return (
    <section className="min-w-[720px] space-y-4" aria-label="项目任务协同图">
      <p className="text-xs text-slate-500">当前已加载 {tasks.length} 项任务；选择任务后展示其权威 WorkItem。</p>
      {detail && selectedTaskId && (!detailIsValid || invalidWorkItems.length > 0) && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          协同关系不可用：任务、revision、Run 或 WorkItem 绑定与当前选择不一致。
        </div>
      )}

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white p-4">
        {selectedTask && detailIsValid && (
          <svg className="mb-4 h-48 min-w-[640px] w-full" viewBox="0 0 720 192" role="img" aria-label={`${selectedTask.title} 与 ${graphWorkItems.length} 个 WorkItem 的关系图`}>
            <rect x="24" y="68" width="190" height="56" rx="10" className="fill-blue-50 stroke-blue-500" />
            <text x="40" y="92" className="fill-slate-800 text-xs font-medium">{selectedTask.title}</text>
            <text x="40" y="111" className="fill-slate-500 text-[10px]">r{selectedTask.revision} · {selectedTask.runId ?? 'no run'}</text>
            {graphWorkItems.map((workItem, index) => {
              const y = 18 + index * Math.max(34, Math.floor(156 / Math.max(1, graphWorkItems.length)));
              return (
                <g key={workItem.id}>
                  <line x1="214" y1="96" x2="390" y2={y + 18} className="stroke-slate-300" />
                  <rect x="390" y={y} width="290" height="36" rx="8" className={selectedWorkItemId === workItem.id ? 'fill-emerald-50 stroke-emerald-500' : 'fill-slate-50 stroke-slate-300'} />
                  <text x="404" y={y + 15} className="fill-slate-800 text-[10px]">{workItem.id}</text>
                  <text x="404" y={y + 29} className="fill-slate-500 text-[9px]">{workItem.assignedAgentId} · {workItem.status}</text>
                </g>
              );
            })}
          </svg>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" role="list" aria-label="任务节点">
          {tasks.map((task) => (
            <button
              key={task.taskId}
              type="button"
              aria-pressed={selectedTaskId === task.taskId}
              onClick={() => onSelectTask(task.taskId)}
              className={`rounded-md border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedTaskId === task.taskId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}
            >
              <span className="block text-sm font-medium text-slate-800">{task.title}</span>
              <span className="mt-1 block text-xs text-slate-500">{task.taskId} · r{task.revision}</span>
            </button>
          ))}
        </div>

        {selectedTask && graphWorkItems.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-4" role="list" aria-label="WorkItem 节点">
            {graphWorkItems.map((workItem) => (
              <button
                key={workItem.id}
                type="button"
                aria-pressed={selectedWorkItemId === workItem.id}
                onClick={() => onSelectWorkItem(selectedTask.taskId, workItem.id)}
                className={`mb-2 w-full rounded-md border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${selectedWorkItemId === workItem.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-300'}`}
              >
                <span className="text-sm font-medium text-slate-800">{workItem.id}</span>
                <span className="ml-2 text-xs text-slate-500">{workItem.assignedAgentId} · {workItem.status} · lease {workItem.leaseEpoch} · {workItem.attempts.length} 次尝试</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
