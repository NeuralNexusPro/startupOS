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
import { useMemo, useState } from "react";
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
  reported: { label: "待 Supervisor 验收", textClass: "text-yellow-600", icon: "◐" },
  completed: { label: "已完成", textClass: "text-green-600", icon: "✓" },
  failed: { label: "已失败", textClass: "text-red-600", icon: "✕" },
  blocked: { label: "受阻", textClass: "text-gray-500", icon: "⏸" },
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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

  const columns = useMemo(() => ([
    { id: "queued", label: "待处理", statuses: ["pending", "assigned"] as TaskState[] },
    { id: "active", label: "进行中", statuses: ["running"] as TaskState[] },
    { id: "review", label: "待 Supervisor 验收", statuses: ["reported"] as TaskState[] },
    { id: "blocked", label: "受阻", statuses: ["blocked"] as TaskState[] },
    { id: "terminal", label: "已结束", statuses: ["completed", "failed"] as TaskState[] },
  ]), []);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);

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
        <div className="mt-2 max-h-80 overflow-auto">
          {tasks.length === 0 ? (
            <div
              className="px-2 py-1.5 text-xs text-gray-400"
              aria-label="暂无任务，等待 Supervisor 分派"
            >
              暂无任务，等待 Supervisor 分派
            </div>
          ) : (
            <div className="grid min-w-[900px] grid-cols-5 gap-2" aria-label="Supervisor 任务分栏">
              {columns.map((column) => {
                const columnTasks = sortedTasks.filter((task) => column.statuses.includes(task.status));
                return (
                  <section key={column.id} className="rounded-lg bg-gray-50 p-2" aria-label={`${column.label}任务`}>
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-700">
                      <span>{column.label}</span><span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-gray-500">{columnTasks.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {columnTasks.length === 0 ? <div className="rounded border border-dashed border-gray-200 px-2 py-3 text-center text-[10px] text-gray-400">暂无</div> : columnTasks.map((task) => {
                        const meta = STATUS_META[task.status] ?? STATUS_META["pending"];
                        const agentName = resolveAgentName(task);
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => {
                              setSelectedTaskId((current) => current === task.id ? null : task.id);
                              if (task.assignedTo) onTaskClick(task.assignedTo);
                            }}
                            aria-label={`任务 ${task.description}，负责 ${agentName}，状态 ${meta.label}`}
                            aria-expanded={selectedTaskId === task.id}
                            className={`w-full rounded-md border bg-white p-2 text-left shadow-sm transition-colors hover:border-blue-200 ${selectedTaskId === task.id ? "border-blue-300 ring-1 ring-blue-100" : "border-gray-100"}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <span aria-hidden="true" className={`mt-0.5 ${meta.textClass} ${task.status === "running" ? "animate-pulse" : ""}`}>{meta.icon}</span>
                              <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium text-gray-900">{task.description}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-1 text-[10px]">
                              <span className="truncate rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{agentName}</span>
                              <span className={meta.textClass}>{meta.label}</span>
                              <span className="text-gray-400 tabular-nums">{formatTimeHHmm(task.completedAt ?? task.createdAt)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          {selectedTask && (
            <div className="mt-2 grid gap-2 rounded-lg border border-gray-200 bg-white p-3 text-xs md:grid-cols-2" aria-label={`任务详情 ${selectedTask.description}`}>
              <TaskValue title="任务输入" value={selectedTask.input} empty="Supervisor 未记录结构化输入" />
              <TaskValue title="任务输出" value={selectedTask.output} empty={selectedTask.status === 'completed' || selectedTask.status === 'reported' ? '暂无输出' : '等待 Agent 产出'} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskValue({ title, value, empty }: { title: string; value: unknown; empty: string }) {
  const text = value === undefined || value === null
    ? empty
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);
  return (
    <div className="min-w-0">
      <p className="font-semibold text-gray-700">{title}</p>
      <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-sans text-[11px] leading-4 text-gray-600">{text}</pre>
    </div>
  );
}
