"use client";

/**
 * TaskBoard — 多 Agent 协作统一任务看板（Multica 式，Story 9.44）。
 *
 * 纯展示组件：
 * - 数据来自同目录 zustand store（`useCollaborationUi` 的 `tasks` 派生状态）
 * - 汇总计数在组件内 useMemo 派生，不在 store 双写
 * - 无副作用、不 fetch；点击任务行经 `onTaskClick(agentId)` 回调联动 Agent 抽屉
 * - 折叠态由父组件持有（`collapsed` / `onToggleCollapsed`），组件自身不持有状态
 */

import React from "react";
import { useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { TaskItem, TaskState } from "../session/types";
import { useCollaborationUi } from "./store";

export interface TaskBoardProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTaskClick: (agentId: string) => void;
  /** agentId → 显示名（由父组件从 topology/快照提供）。 */
  agentNames: Record<string, string>;
}

/** 状态 → 文字标签 / 颜色 / 图标（图标 + 文字双编码，不单靠颜色）。 */
const STATUS_META: Record<TaskState, { label: string; textClass: string; icon: string }> = {
  pending: { label: "待分配", textClass: "text-gray-500", icon: "○" },
  assigned: { label: "已分配", textClass: "text-blue-600", icon: "▶" },
  running: { label: "运行中", textClass: "text-blue-600", icon: "▶" },
  reported: { label: "待验收", textClass: "text-yellow-600", icon: "◐" },
  completed: { label: "已完成", textClass: "text-green-600", icon: "✓" },
  failed: { label: "已失败", textClass: "text-red-600", icon: "✕" },
  blocked: { label: "已阻塞", textClass: "text-gray-500", icon: "⏸" },
};

interface TaskSummary {
  total: number;
  active: number;
  completed: number;
  failed: number;
}

function summarizeTasks(tasks: TaskItem[]): TaskSummary {
  let active = 0;
  let completed = 0;
  let failed = 0;
  for (const task of tasks) {
    if (task.status === "assigned" || task.status === "running" || task.status === "reported") {
      active += 1;
    } else if (task.status === "completed") {
      completed += 1;
    } else if (task.status === "failed") {
      failed += 1;
    }
  }
  return { total: tasks.length, active, completed, failed };
}

/** ISO 时间 → HH:mm（本地时区）；无效时间返回 "–"。 */
function formatTimeHHmm(iso: string | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function TaskBoard({ collapsed, onToggleCollapsed, onTaskClick, agentNames }: TaskBoardProps) {
  const tasks = useCollaborationUi((state) => state.tasks);

  const summary = useMemo(() => summarizeTasks(tasks), [tasks]);

  const sortedTasks = useMemo(() => {
    // 按创建时间倒序（最新在前）；无效时间戳排最后。
    return [...tasks].sort((a, b) => {
      const ta = Date.parse(a.createdAt);
      const tb = Date.parse(b.createdAt);
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });
  }, [tasks]);

  const resolveAgentName = (task: TaskItem): string => {
    if (!task.assignedTo) return "未分配";
    return agentNames[task.assignedTo] ?? task.assignedTo;
  };

  return (
    <div
      role="region"
      aria-label="任务看板"
      className="flex-shrink-0 border-b border-gray-100 bg-white px-5 py-2"
    >
      {/* 汇总条 */}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold text-gray-900">任务 {summary.total}</span>
          <span aria-hidden="true">·</span>
          <span>活跃 {summary.active}</span>
          <span aria-hidden="true">·</span>
          <span>已完成 {summary.completed}</span>
          <span aria-hidden="true">·</span>
          <span>失败 {summary.failed}</span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex flex-shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "展开任务看板" : "收起任务看板"}
        >
          {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
      </div>

      {/* 折叠态只保留汇总条一行 */}
      {collapsed ? null : (
        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
          {tasks.length === 0 ? (
            <li
              className="px-2 py-1.5 text-xs text-gray-400"
              aria-label="暂无任务，等待 Supervisor 分派"
            >
              暂无任务，等待 Supervisor 分派
            </li>
          ) : (
            sortedTasks.map((task) => {
              const meta = STATUS_META[task.status] ?? STATUS_META["pending"];
              const time = formatTimeHHmm(task.completedAt ?? task.createdAt);
              const agentName = resolveAgentName(task);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onTaskClick(task.assignedTo ?? "")}
                    disabled={!task.assignedTo}
                    aria-label={`任务 ${task.description}，负责 ${agentName}，状态 ${meta.label}`}
                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs ${
                      task.assignedTo ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex-shrink-0 ${meta.textClass} ${
                        task.status === "running" ? "animate-pulse" : ""
                      }`}
                    >
                      {meta.icon}
                    </span>
                    <span title={task.description} className="min-w-0 flex-1 truncate text-gray-900">
                      {task.description}
                    </span>
                    <span className="flex-shrink-0 text-gray-500">{agentName}</span>
                    <span className={`flex-shrink-0 ${meta.textClass}`}>{meta.label}</span>
                    <span className="flex-shrink-0 text-gray-400 tabular-nums">{time}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
