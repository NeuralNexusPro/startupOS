/**
 * Story 9.44 — TaskBoard 组件测试（@testing-library/react + jsdom）
 *
 * 覆盖：
 * - 空状态（暂无任务，等待 Supervisor 分派）
 * - 任务行渲染（描述 / Agent 显示名 / 状态文字）
 * - 汇总条计数（任务 N · 活跃 N · 已完成 N · 失败 N）
 * - onTaskClick(agentId) 行点击联动 + 未分配行禁用
 * - 折叠态只保留汇总条；折叠/展开切换回调
 * - aria（region / aria-expanded / 行 aria-label）
 *
 * 注意：core tsconfig jsx: "preserve"（vitest esbuild 经典运行时），
 * .tsx 测试文件必须显式 `import React from "react"`。
 */

import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import type { RuntimeEvent } from "../../session/types";
import { TaskBoard } from "../TaskBoard";
import { useCollaborationUi } from "../store";

let seq = 0;
function makeEvent(
  id: string,
  type: RuntimeEvent["type"],
  payload: Record<string, unknown>,
  source: string = "supervisor",
  timestamp: string = "2026-10-12T10:20:00Z",
): RuntimeEvent {
  seq += 1;
  return { id, sessionId: "s1", seq, type, payload, source, timestamp };
}

const AGENT_NAMES: Record<string, string> = {
  "data-collector": "数据采集Agent",
  "data-analyst": "数据分析Agent",
};

function seedRunningTask(): void {
  useCollaborationUi.getState().addEvent(
    makeEvent("c1", "TASK_CREATED", {
      task: { id: "t1", description: "采集原始数据", status: "pending", createdAt: "2026-10-12T10:20:00Z" },
    }),
  );
  useCollaborationUi.getState().addEvent(
    makeEvent("c2", "TASK_ASSIGNED", { taskId: "t1", agentId: "data-collector" }, "supervisor", "2026-10-12T10:20:01Z"),
  );
  useCollaborationUi.getState().addEvent(
    makeEvent("c3", "TASK_STARTED", { taskId: "t1" }, "data-collector", "2026-10-12T10:20:02Z"),
  );
}

function renderBoard(props: Partial<Parameters<typeof TaskBoard>[0]> = {}): void {
  render(
    <TaskBoard
      collapsed={false}
      onToggleCollapsed={() => {}}
      onTaskClick={() => {}}
      agentNames={AGENT_NAMES}
      {...props}
    />,
  );
}

describe("TaskBoard", () => {
  beforeEach(() => {
    useCollaborationUi.getState().reset();
  });

  it("renders the empty state when there are no tasks", () => {
    renderBoard();
    expect(screen.getByText("暂无任务，等待 Supervisor 分派")).not.toBeNull();
    expect(screen.getByRole("region", { name: "任务看板" })).not.toBeNull();
  });

  it("renders task rows with description, agent display name and status label", () => {
    seedRunningTask();
    renderBoard();

    expect(screen.getByText("采集原始数据")).not.toBeNull();
    // agentNames 映射到显示名
    expect(screen.getByText("数据采集Agent")).not.toBeNull();
    // 运行中状态文字
    expect(screen.getByText("运行中")).not.toBeNull();
    // 汇总条：任务 1 · 活跃 1 · 已完成 0 · 失败 0
    expect(screen.getByText("任务 1")).not.toBeNull();
    expect(screen.getByText("活跃 1")).not.toBeNull();
    expect(screen.getByText("已完成 0")).not.toBeNull();
    expect(screen.getByText("失败 0")).not.toBeNull();
  });

  it("falls back to the raw agentId when agentNames has no mapping", () => {
    useCollaborationUi.getState().addEvent(
      makeEvent("c1", "TASK_CREATED", {
        task: { id: "t1", description: "未知 Agent 任务", status: "pending", createdAt: "2026-10-12T10:20:00Z" },
      }),
    );
    useCollaborationUi.getState().addEvent(
      makeEvent("c2", "TASK_ASSIGNED", { taskId: "t1", agentId: "agent-x" }),
    );
    renderBoard();
    expect(screen.getByText("agent-x")).not.toBeNull();
  });

  it("shows 未分配 for a task without assignedTo and keeps its row disabled", () => {
    useCollaborationUi.getState().addEvent(
      makeEvent("c1", "TASK_CREATED", {
        task: { id: "t1", description: "待分配任务", status: "pending", createdAt: "2026-10-12T10:20:00Z" },
      }),
    );
    const onTaskClick = vi.fn();
    renderBoard({ onTaskClick });

    expect(screen.getByText("未分配")).not.toBeNull();
    const row = screen.getByRole("button", { name: /任务 待分配任务/ });
    expect(row.hasAttribute("disabled")).toBe(true);
    fireEvent.click(row);
    expect(onTaskClick).not.toHaveBeenCalled();
  });

  it("calls onTaskClick with the assigned agentId on row click", () => {
    seedRunningTask();
    const onTaskClick = vi.fn();
    renderBoard({ onTaskClick });

    const row = screen.getByRole("button", { name: /任务 采集原始数据，负责 数据采集Agent，状态 运行中/ });
    fireEvent.click(row);
    expect(onTaskClick).toHaveBeenCalledTimes(1);
    expect(onTaskClick).toHaveBeenCalledWith("data-collector");
  });

  it("collapsed mode shows only the summary bar and hides the task list", () => {
    seedRunningTask();
    renderBoard({ collapsed: true });

    expect(screen.getByText("任务 1")).not.toBeNull();
    expect(screen.queryByText("采集原始数据")).toBeNull();

    const toggle = screen.getByRole("button", { name: "展开任务看板" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("expanded mode exposes aria-expanded true and the collapse label", () => {
    seedRunningTask();
    renderBoard({ collapsed: false });

    const toggle = screen.getByRole("button", { name: "收起任务看板" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("invokes onToggleCollapsed when the toggle button is clicked", () => {
    const onToggleCollapsed = vi.fn();
    renderBoard({ onToggleCollapsed });

    fireEvent.click(screen.getByRole("button", { name: "收起任务看板" }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("reflects summary counts after a full lifecycle (completed task)", () => {
    useCollaborationUi.getState().addEvent(
      makeEvent("c1", "TASK_CREATED", {
        task: { id: "t1", description: "采集原始数据", status: "pending", createdAt: "2026-10-12T10:20:00Z" },
      }),
    );
    useCollaborationUi.getState().addEvent(
      makeEvent("c2", "TASK_CREATED", {
        task: { id: "t2", description: "生成季度报告", status: "pending", createdAt: "2026-10-12T10:32:00Z" },
      }),
    );
    useCollaborationUi.getState().addEvent(
      makeEvent("c3", "TASK_ASSIGNED", { taskId: "t1", agentId: "data-collector" }),
    );
    useCollaborationUi.getState().addEvent(
      makeEvent("c4", "TASK_COMPLETED", { taskId: "t1", output: "done" }, "supervisor", "2026-10-12T10:25:00Z"),
    );

    renderBoard();
    // t1 completed；t2 pending（不计入活跃）
    expect(screen.getByText("任务 2")).not.toBeNull();
    expect(screen.getByText("活跃 0")).not.toBeNull();
    expect(screen.getByText("已完成 1")).not.toBeNull();
    expect(screen.getByText("失败 0")).not.toBeNull();
    expect(screen.getByText("已完成").tagName).toBe("SPAN");
  });
});
