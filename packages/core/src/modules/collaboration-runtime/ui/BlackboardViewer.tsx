/**
 * Blackboard State Viewer — 黑板状态简视图。
 *
 * Story 9.12: UI 协作查看器
 */

import type { TaskItem } from "../session/types";

interface BlackboardViewerProps {
  data: Record<string, unknown>;
  tasks: TaskItem[];
}

export function BlackboardViewer({ data, tasks }: BlackboardViewerProps) {
  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const runningCount = tasks.filter((t) => t.status === "running").length;

  return (
    <div className="space-y-4">
      {/* Task Summary */}
      <div className="flex gap-4 text-sm">
        <div className="px-3 py-1 rounded bg-yellow-100 text-yellow-800">
          {pendingCount} pending
        </div>
        <div className="px-3 py-1 rounded bg-blue-100 text-blue-800">
          {runningCount} running
        </div>
        <div className="px-3 py-1 rounded bg-green-100 text-green-800">
          {completedCount} completed
        </div>
      </div>

      {/* Task List */}
      {tasks.length > 0 && (
        <div className="space-y-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 text-sm px-2 py-1 rounded bg-gray-50"
            >
              <TaskStateBadge state={task.status} />
              <span className="font-mono text-gray-700 truncate">{task.id}</span>
              {task.assignedTo && (
                <span className="text-gray-400 ml-auto">{task.assignedTo}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Shared Data */}
      {Object.keys(data).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Shared Data</h4>
          <div className="space-y-1">
            {Object.entries(data).map(([key, value]) => (
              <details key={key} className="text-sm">
                <summary className="cursor-pointer text-gray-600 hover:text-gray-800 font-mono">
                  {key}
                </summary>
                <pre className="ml-4 mt-1 text-xs text-gray-500 bg-gray-50 p-2 rounded overflow-auto max-h-32">
                  {truncate(JSON.stringify(value, null, 2), 200)}
                </pre>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskStateBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    running: "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    reassigned: "bg-purple-100 text-purple-700",
  };
  const color = colors[state] ?? "bg-gray-100 text-gray-700";

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${color}`}>
      {state}
    </span>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}
