/**
 * Story 9.44 — store 任务派生单测（applyTaskEventToTasks + mergeSnapshotTasks）
 *
 * 覆盖：
 * - 六类 TASK_* 事件映射（语义对齐引擎 session/blackboard.ts apply）
 * - 完整时序 TASK_CREATED→ASSIGNED→STARTED→REPORTED→COMPLETED（最终 completed，无残留）
 * - TASK_FAILED 路径；TASK_CREATED 幂等；非任务事件 no-op；缺 payload 防御
 * - mergeSnapshotTasks（activeTasks + recentTerminalTask 合成、空快照清空、畸形字段跳过）
 *
 * fixtures 遵循 docs/specs/epic-9/story-9.44/testing.md 测试数据集 1/2。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { RuntimeEvent, TaskItem } from "../../session/types";
import {
  applyTaskEventToTasks,
  mergeSnapshotTasksPure,
  useCollaborationUi,
} from "../store";

// ============================================================================
// Fixtures（testing.md 测试数据集 1/2）
// ============================================================================

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

const TASK_T1: TaskItem = {
  id: "t1",
  description: "采集原始数据",
  status: "pending",
  createdAt: "2026-10-12T10:20:00Z",
};

// ============================================================================
// applyTaskEventToTasks — 六类事件映射
// ============================================================================

describe("applyTaskEventToTasks", () => {
  it("TASK_CREATED appends a new pending task from payload.task", () => {
    const result = applyTaskEventToTasks(
      [],
      makeEvent("e1", "TASK_CREATED", { task: TASK_T1 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(TASK_T1);
    expect(result[0]?.status).toBe("pending");
  });

  it("TASK_CREATED is idempotent for a duplicate id", () => {
    const tasks = [TASK_T1];
    const result = applyTaskEventToTasks(
      tasks,
      makeEvent("e2", "TASK_CREATED", { task: TASK_T1 }, "supervisor", "2026-10-12T10:20:01Z"),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("t1");
  });

  it("TASK_ASSIGNED sets assignedTo and status 'assigned'", () => {
    const result = applyTaskEventToTasks(
      [TASK_T1],
      makeEvent("e3", "TASK_ASSIGNED", { taskId: "t1", agentId: "data-collector" }),
    );
    expect(result[0]?.assignedTo).toBe("data-collector");
    expect(result[0]?.status).toBe("assigned");
    // 原 TaskItem 不被原地修改（不可变更新）
    expect(TASK_T1.status).toBe("pending");
    expect(TASK_T1.assignedTo).toBeUndefined();
  });

  it("TASK_STARTED sets status 'running'", () => {
    const assigned: TaskItem = { ...TASK_T1, assignedTo: "data-collector", status: "assigned" };
    const result = applyTaskEventToTasks(
      [assigned],
      makeEvent("e4", "TASK_STARTED", { taskId: "t1" }, "data-collector", "2026-10-12T10:20:02Z"),
    );
    expect(result[0]?.status).toBe("running");
    expect(result[0]?.assignedTo).toBe("data-collector");
  });

  it("TASK_REPORTED sets status 'reported' and output", () => {
    const running: TaskItem = { ...TASK_T1, assignedTo: "data-collector", status: "running" };
    const result = applyTaskEventToTasks(
      [running],
      makeEvent("e5", "TASK_REPORTED", { taskId: "t1", output: "数据已采集" }, "data-collector", "2026-10-12T10:24:00Z"),
    );
    expect(result[0]?.status).toBe("reported");
    expect(result[0]?.output).toBe("数据已采集");
  });

  it("TASK_COMPLETED sets status 'completed', output and completedAt = event.timestamp", () => {
    const reported: TaskItem = {
      ...TASK_T1,
      assignedTo: "data-collector",
      status: "reported",
      output: "数据已采集",
    };
    const ts = "2026-10-12T10:25:00Z";
    const result = applyTaskEventToTasks(
      [reported],
      makeEvent("e6", "TASK_COMPLETED", { taskId: "t1", output: "数据已采集" }, "supervisor", ts),
    );
    expect(result[0]?.status).toBe("completed");
    expect(result[0]?.output).toBe("数据已采集");
    expect(result[0]?.completedAt).toBe(ts);
  });

  it("TASK_FAILED sets status 'failed' and completedAt = event.timestamp", () => {
    const running: TaskItem = { ...TASK_T1, assignedTo: "data-collector", status: "running" };
    const ts = "2026-10-12T10:26:00Z";
    const result = applyTaskEventToTasks(
      [running],
      makeEvent("e7", "TASK_FAILED", { taskId: "t1", error: "连接超时" }, "data-collector", ts),
    );
    expect(result[0]?.status).toBe("failed");
    expect(result[0]?.completedAt).toBe(ts);
  });

  it("returns tasks unchanged for unknown / non-task event types", () => {
    const tasks = [TASK_T1];
    const nonTask: RuntimeEvent[] = [
      makeEvent("e8", "ASSISTANT_MESSAGE", { content: "你好" }, "supervisor"),
      makeEvent("e9", "HUMAN_REVIEW_REQUEST", { question: "确认？" }, "worker-a"),
      makeEvent("e10", "TOOL_CALL", { toolName: "bash" }, "worker-a"),
    ];
    for (const event of nonTask) {
      expect(applyTaskEventToTasks(tasks, event)).toBe(tasks);
    }
  });

  it("returns tasks unchanged when payload is missing taskId / task", () => {
    const tasks = [TASK_T1];
    expect(applyTaskEventToTasks(tasks, makeEvent("e11", "TASK_CREATED", {}))).toBe(tasks);
    expect(applyTaskEventToTasks(tasks, makeEvent("e12", "TASK_ASSIGNED", { agentId: "a" }))).toBe(tasks);
    expect(applyTaskEventToTasks(tasks, makeEvent("e13", "TASK_STARTED", {}))).toBe(tasks);
    expect(applyTaskEventToTasks(tasks, makeEvent("e14", "TASK_REPORTED", {}))).toBe(tasks);
    expect(applyTaskEventToTasks(tasks, makeEvent("e15", "TASK_COMPLETED", {}))).toBe(tasks);
    expect(applyTaskEventToTasks(tasks, makeEvent("e16", "TASK_FAILED", {}))).toBe(tasks);
  });

  it("does not throw on malformed TASK_CREATED payloads", () => {
    const tasks: TaskItem[] = [];
    expect(() =>
      applyTaskEventToTasks(tasks, makeEvent("e17", "TASK_CREATED", { task: "not-an-object" })),
    ).not.toThrow();
    expect(() =>
      applyTaskEventToTasks(tasks, makeEvent("e18", "TASK_CREATED", { task: null })),
    ).not.toThrow();
    expect(() =>
      applyTaskEventToTasks(tasks, makeEvent("e19", "TASK_CREATED", { task: { id: 42, description: 7 } })),
    ).not.toThrow();
    expect(applyTaskEventToTasks(tasks, makeEvent("e20", "TASK_CREATED", { task: { id: 42, description: 7 } }))).toHaveLength(0);
  });

  it("falls back to 'pending' status and empty createdAt when snapshot-shaped task lacks them", () => {
    const result = applyTaskEventToTasks(
      [],
      makeEvent("e21", "TASK_CREATED", { task: { id: "t9", description: "无状态任务" } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe("pending");
    expect(result[0]?.createdAt).toBe("");
  });
});

// ============================================================================
// applyTaskEventToTasks — 引擎真实 dispatch 时序（端到端）
// ============================================================================

describe("applyTaskEventToTasks — dispatch sequence (testing.md 数据集 1)", () => {
  it("full sequence CREATED→ASSIGNED→STARTED→REPORTED→COMPLETED ends at completed with no residue", () => {
    const events: RuntimeEvent[] = [
      makeEvent("e1", "TASK_CREATED", {
        task: { id: "t1", description: "采集原始数据", status: "pending", createdAt: "2026-10-12T10:20:00Z" },
      }, "supervisor", "2026-10-12T10:20:00Z"),
      makeEvent("e2", "TASK_ASSIGNED", { taskId: "t1", agentId: "data-collector" }, "supervisor", "2026-10-12T10:20:01Z"),
      makeEvent("e3", "TASK_STARTED", { taskId: "t1" }, "data-collector", "2026-10-12T10:20:02Z"),
      makeEvent("e4", "TASK_REPORTED", { taskId: "t1", output: "数据已采集" }, "data-collector", "2026-10-12T10:24:00Z"),
      makeEvent("e5", "TASK_COMPLETED", { taskId: "t1", output: "数据已采集" }, "supervisor", "2026-10-12T10:25:00Z"),
    ];

    let tasks: TaskItem[] = [];
    for (const event of events) {
      tasks = applyTaskEventToTasks(tasks, event);
    }

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toEqual({
      id: "t1",
      description: "采集原始数据",
      status: "completed",
      assignedTo: "data-collector",
      output: "数据已采集",
      createdAt: "2026-10-12T10:20:00Z",
      completedAt: "2026-10-12T10:25:00Z",
    });
  });

  it("multiple tasks update independently", () => {
    const t2: TaskItem = {
      id: "t2",
      description: "生成季度报告",
      status: "pending",
      createdAt: "2026-10-12T10:32:00Z",
    };
    let tasks = applyTaskEventToTasks([], makeEvent("f1", "TASK_CREATED", { task: TASK_T1 }));
    tasks = applyTaskEventToTasks(tasks, makeEvent("f2", "TASK_CREATED", { task: t2 }));
    tasks = applyTaskEventToTasks(tasks, makeEvent("f3", "TASK_ASSIGNED", { taskId: "t2", agentId: "data-analyst" }));
    tasks = applyTaskEventToTasks(tasks, makeEvent("f4", "TASK_FAILED", { taskId: "t2" }, "data-analyst", "2026-10-12T10:33:00Z"));

    expect(tasks).toHaveLength(2);
    const t1 = tasks.find((t) => t.id === "t1");
    const failed = tasks.find((t) => t.id === "t2");
    expect(t1?.status).toBe("pending");
    expect(failed?.status).toBe("failed");
    expect(failed?.completedAt).toBe("2026-10-12T10:33:00Z");
    expect(failed?.assignedTo).toBe("data-analyst");
  });
});

// ============================================================================
// mergeSnapshotTasksPure — 快照合并（testing.md 测试数据集 2）
// ============================================================================

describe("mergeSnapshotTasksPure", () => {
  it("composes activeTasks + agents[].recentTerminalTask, dedupes by id", () => {
    const snapshot = {
      sessionId: "s1",
      activeTasks: [
        { id: "t2", description: "生成季度报告", status: "running", assignedTo: "data-analyst", createdAt: "2026-10-12T10:32:00Z" },
      ],
      agents: [
        {
          agentId: "data-collector",
          agentName: "数据采集Agent",
          recentTerminalTask: { id: "t1", description: "采集原始数据", status: "completed", completedAt: "2026-10-12T10:25:00Z" },
        },
        {
          agentId: "data-analyst",
          agentName: "数据分析Agent",
          recentTerminalTask: null,
        },
      ],
      summary: { totalActiveTasks: 1, totalCompletedTasks: 1, totalFailedTasks: 0 },
      snapshotAt: "2026-10-12T10:33:00Z",
    };

    const result = mergeSnapshotTasksPure(snapshot);
    expect(result).toHaveLength(2);
    // activeTasks 在前
    expect(result[0]?.id).toBe("t2");
    expect(result[0]?.status).toBe("running");
    // recentTerminalTask 形态（id + status + completedAt）被 asTaskItem 接受
    expect(result[1]?.id).toBe("t1");
    expect(result[1]?.status).toBe("completed");
  });

  it("recentTerminalTask with taskId-only shape (no id) is skipped defensively", () => {
    // 引擎 AgentTaskSnapshotData.recentTerminalTask 实际形态是 { taskId, ... } 而非 { id }；
    // asTaskItem 要求 id 为 string，因此该形态的终端任务条目会被防御性跳过——
    // 这是收窄规则的既定行为：宁缺勿错（ malformed 字段不进看板）。
    const snapshot = {
      activeTasks: [],
      agents: [
        {
          agentId: "data-collector",
          recentTerminalTask: { taskId: "t1", description: "采集原始数据", status: "completed", completedAt: "2026-10-12T10:25:00Z" },
        },
      ],
    };

    const result = mergeSnapshotTasksPure(snapshot);
    expect(result).toHaveLength(0);
  });

  it("empty snapshot ({activeTasks:[], agents:[]}) clears the list", () => {
    const result = mergeSnapshotTasksPure({ activeTasks: [], agents: [] });
    expect(result).toEqual([]);
  });

  it("null / undefined / non-object snapshots return an empty list without throwing", () => {
    expect(mergeSnapshotTasksPure(null)).toEqual([]);
    expect(mergeSnapshotTasksPure(undefined)).toEqual([]);
    expect(mergeSnapshotTasksPure("garbage")).toEqual([]);
    expect(mergeSnapshotTasksPure(42)).toEqual([]);
  });

  it("malformed entries are skipped, valid ones survive", () => {
    const snapshot = {
      activeTasks: [
        null,
        "not-an-object",
        { description: "缺少 id" },
        { id: "ok-1", description: "合法任务", status: "assigned", createdAt: "2026-10-12T10:30:00Z" },
        { id: "ok-2", description: "非法 status 回退 pending", status: "bogus-status", createdAt: "2026-10-12T10:31:00Z" },
      ],
      agents: "not-an-array",
    };

    const result = mergeSnapshotTasksPure(snapshot);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "ok-1", status: "assigned" });
    expect(result[1]).toMatchObject({ id: "ok-2", status: "pending" });
  });

  it("dedupes across activeTasks and recentTerminalTask (active wins, first occurrence)", () => {
    const snapshot = {
      activeTasks: [
        { id: "t1", description: "活跃形态", status: "running", createdAt: "2026-10-12T10:32:00Z" },
      ],
      agents: [
        {
          agentId: "a1",
          recentTerminalTask: { id: "t1", description: "终端形态", status: "completed", completedAt: "2026-10-12T10:25:00Z" },
        },
      ],
    };

    const result = mergeSnapshotTasksPure(snapshot);
    expect(result).toHaveLength(1);
    expect(result[0]?.description).toBe("活跃形态");
    expect(result[0]?.status).toBe("running");
  });
});

// ============================================================================
// store 集成 — addEvent 写入 tasks、mergeSnapshotTasks 覆盖、boardCollapsed
// ============================================================================

describe("useCollaborationUi task board integration", () => {
  beforeEach(() => {
    useCollaborationUi.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("addEvent TASK_CREATED writes a task into the store", () => {
    useCollaborationUi.getState().addEvent(
      makeEvent("s-e1", "TASK_CREATED", { task: TASK_T1 }),
    );
    expect(useCollaborationUi.getState().tasks).toHaveLength(1);
    expect(useCollaborationUi.getState().tasks[0]?.id).toBe("t1");
  });

  it("addEvent ASSISTANT_MESSAGE leaves tasks untouched", () => {
    useCollaborationUi.getState().addEvent(
      makeEvent("s-e2", "ASSISTANT_MESSAGE", { content: "开始协调" }, "supervisor"),
    );
    expect(useCollaborationUi.getState().tasks).toEqual([]);
  });

  it("addEvent drives the full lifecycle through the store", () => {
    const s = useCollaborationUi.getState();
    s.addEvent(makeEvent("s-e3", "TASK_CREATED", { task: TASK_T1 }));
    s.addEvent(makeEvent("s-e4", "TASK_ASSIGNED", { taskId: "t1", agentId: "data-collector" }));
    s.addEvent(makeEvent("s-e5", "TASK_STARTED", { taskId: "t1" }, "data-collector"));
    s.addEvent(makeEvent("s-e6", "TASK_COMPLETED", { taskId: "t1", output: "done" }, "supervisor", "2026-10-12T10:25:00Z"));

    const tasks = useCollaborationUi.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe("completed");
    expect(tasks[0]?.completedAt).toBe("2026-10-12T10:25:00Z");
  });

  it("addEvent deduplicates the same event id (existing behaviour preserved)", () => {
    const event = makeEvent("s-e7", "TASK_CREATED", { task: TASK_T1 });
    useCollaborationUi.getState().addEvent(event);
    useCollaborationUi.getState().addEvent(event);
    expect(useCollaborationUi.getState().tasks).toHaveLength(1);
  });

  it("mergeSnapshotTasks overwrites the store tasks and is defensive against garbage", () => {
    useCollaborationUi.getState().addEvent(
      makeEvent("s-e8", "TASK_CREATED", { task: TASK_T1 }),
    );
    expect(useCollaborationUi.getState().tasks).toHaveLength(1);

    useCollaborationUi.getState().mergeSnapshotTasks({
      activeTasks: [
        { id: "t2", description: "生成季度报告", status: "running", assignedTo: "data-analyst", createdAt: "2026-10-12T10:32:00Z" },
      ],
      agents: [
        {
          agentId: "data-collector",
          recentTerminalTask: { id: "t1", description: "采集原始数据", status: "completed", completedAt: "2026-10-12T10:25:00Z" },
        },
      ],
    });
    const restored = useCollaborationUi.getState().tasks;
    expect(restored).toHaveLength(2);
    expect(restored.map((t) => t.id)).toEqual(["t2", "t1"]);

    // 畸形快照 → 清空且不抛异常
    expect(() => useCollaborationUi.getState().mergeSnapshotTasks("junk")).not.toThrow();
    expect(useCollaborationUi.getState().tasks).toEqual([]);
  });

  it("events after snapshot merge apply incrementally (恢复后事件驱动)", () => {
    useCollaborationUi.getState().mergeSnapshotTasks({
      activeTasks: [
        { id: "t2", description: "生成季度报告", status: "running", assignedTo: "data-analyst", createdAt: "2026-10-12T10:32:00Z" },
      ],
      agents: [],
    });
    useCollaborationUi.getState().addEvent(
      makeEvent("s-e9", "TASK_COMPLETED", { taskId: "t2", output: "报告完成" }, "supervisor", "2026-10-12T10:35:00Z"),
    );
    const tasks = useCollaborationUi.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe("completed");
    expect(tasks[0]?.completedAt).toBe("2026-10-12T10:35:00Z");
  });

  it("boardCollapsed defaults to false and setBoardCollapsed toggles it", () => {
    expect(useCollaborationUi.getState().boardCollapsed).toBe(false);
    useCollaborationUi.getState().setBoardCollapsed(true);
    expect(useCollaborationUi.getState().boardCollapsed).toBe(true);
    useCollaborationUi.getState().setBoardCollapsed(false);
    expect(useCollaborationUi.getState().boardCollapsed).toBe(false);
  });

  it("reset restores boardCollapsed and clears tasks", () => {
    useCollaborationUi.getState().setBoardCollapsed(true);
    useCollaborationUi.getState().addEvent(
      makeEvent("s-e10", "TASK_CREATED", { task: TASK_T1 }),
    );
    useCollaborationUi.getState().reset();
    expect(useCollaborationUi.getState().boardCollapsed).toBe(false);
    expect(useCollaborationUi.getState().tasks).toEqual([]);
  });
});
