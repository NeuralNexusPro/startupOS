import { describe, expect, it } from "vitest";
import { Blackboard } from "../blackboard";
import type { RuntimeEvent } from "../types";

function event(
  seq: number,
  type: RuntimeEvent["type"],
  payload: Record<string, unknown>,
): RuntimeEvent {
  return {
    id: `event-${seq}`,
    sessionId: "session",
    seq,
    type,
    payload,
    source: "supervisor",
    timestamp: `2026-10-16T00:00:0${seq}.000Z`,
  };
}

describe("Blackboard task lifecycle", () => {
  it("supports every non-terminal state and resumes a blocked task", () => {
    const board = new Blackboard("session", "/tmp/task-lifecycle");
    const task = board.createTask("分析数据");
    expect(task.status).toBe("pending");

    board.assignTask(task.id, "analyst");
    expect(task.status).toBe("assigned");
    board.startTask(task.id);
    expect(task.status).toBe("running");

    board.blockTask(task.id, "等待用户确认", ["user"]);
    expect(task).toMatchObject({
      status: "blocked",
      blocked: { reason: "等待用户确认", waitingFor: ["user"], resumeStatus: "running" },
    });
    board.resumeTask(task.id);
    expect(task.status).toBe("running");

    board.reportTask(task.id, "完成分析");
    expect(task.status).toBe("reported");
    board.acceptTask(task.id);
    expect(task.status).toBe("completed");
    expect(() => board.reassignTask(task.id, "other")).toThrow(/cannot be reassigned/);
  });

  it("replays blocked, resumed, reassigned and failed transitions idempotently", () => {
    const task = { id: "task-1", description: "执行任务", status: "pending" as const, createdAt: "2026-10-16T00:00:00.000Z" };
    const events = [
      event(1, "TASK_CREATED", { task }),
      event(2, "TASK_CREATED", { task }),
      event(3, "TASK_ASSIGNED", { taskId: task.id, agentId: "worker-a" }),
      event(4, "TASK_STARTED", { taskId: task.id }),
      event(5, "TASK_BLOCKED", { taskId: task.id, reason: "等待依赖", waitingFor: ["worker-upstream"] }),
      event(6, "TASK_RESUMED", { taskId: task.id, status: "running" }),
      event(7, "TASK_REASSIGNED", { taskId: task.id, agentId: "worker-b" }),
      event(8, "TASK_FAILED", { taskId: task.id, error: "执行失败", stage: "worker-execution" }),
    ];

    const board = new Blackboard("session", "/tmp/task-lifecycle").fromEvents(events);
    expect(board.getTasks()).toHaveLength(1);
    expect(board.getTask(task.id)).toMatchObject({
      status: "failed",
      assignedTo: "worker-b",
      failure: { reason: "执行失败", stage: "worker-execution" },
    });
  });
});
