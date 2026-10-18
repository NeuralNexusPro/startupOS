/**
 * Tests for facade/session-store — Session CRUD and ID generation
 */

import { rm } from "node:fs/promises";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildContinuationGoal,
  createSession,
  generateId,
  getProjectStateDir,
  queueSessionMessage,
  sessions,
  saveProjectSessions,
  takeSessionMessages,
  updateFormalObjective,
} from "../session-store";
import { OrphanReconciler } from "../../session/orphan-reconciler";
import type { EventEmitter } from "../../../../modules/collaboration-runtime";
import type { CollaborationSession } from "../../../../modules/collaboration-runtime/session/types";

// Minimal stub emitter
const stubEmitter: EventEmitter = {
  emit: () => {},
  on: () => {},
  off: () => {},
};

describe("generateId", () => {
  it("returns a string starting with cs-", () => {
    const id = generateId();
    expect(id).toMatch(/^cs-\d+-[a-z0-9]{6}$/);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });
});

describe("createSession", () => {
  const mergeProjectId = "proj-session-merge-test";

  beforeEach(() => {
    sessions.clear();
  });

  afterEach(async () => {
    sessions.clear();
    await rm(getProjectStateDir(mergeProjectId), { recursive: true, force: true });
  });

  it("stores session in memory map", async () => {
    const session = await createSession({ projectId: "test-proj" }, stubEmitter);
    expect(sessions.has(session.id)).toBe(true);
  });

  it("sets status to created", async () => {
    const session = await createSession({ projectId: "test-proj" }, stubEmitter);
    expect(session.status).toBe("created");
  });

  it("normalizes projectId with proj- prefix", async () => {
    const session = await createSession({ projectId: "myproject" }, stubEmitter);
    expect(session.projectId).toBe("proj-myproject");
  });

  it("does not double-prefix projectId", async () => {
    const session = await createSession({ projectId: "proj-myproject" }, stubEmitter);
    expect(session.projectId).toBe("proj-myproject");
  });

  it("propagates globalGoal", async () => {
    const session = await createSession(
      { projectId: "p1", globalGoal: "Build something" },
      stubEmitter
    );
    expect(session.globalGoal).toBe("Build something");
  });

  it("stores config fields", async () => {
    const session = await createSession(
      { projectId: "p1", maxIterations: 5, timeoutMs: 30000, mode: "workflow" },
      stubEmitter
    );
    expect(session.config?.maxIterations).toBe(5);
    expect(session.config?.timeoutMs).toBe(30000);
    expect(session.config?.mode).toBe("workflow");
  });

  it("merges a new in-memory session without deleting persisted history", async () => {
    const historical: CollaborationSession = {
      id: "historical-session",
      projectId: mergeProjectId,
      globalGoal: "历史目标",
      status: "completed",
      createdAt: "2026-10-16T00:00:00.000Z",
      updatedAt: "2026-10-16T00:01:00.000Z",
      config: {},
    };
    const active: CollaborationSession = {
      id: "active-session",
      projectId: mergeProjectId,
      status: "created",
      createdAt: "2026-10-18T00:00:00.000Z",
      updatedAt: "2026-10-18T00:00:00.000Z",
      config: {},
    };
    const reconciler = new OrphanReconciler(getProjectStateDir(mergeProjectId));
    await reconciler.saveSessions([historical]);
    sessions.set(active.id, active);

    await saveProjectSessions(mergeProjectId);

    await expect(reconciler.loadSessions()).resolves.toEqual([historical, active]);
  });
});

describe("formal run continuation queue", () => {
  beforeEach(() => {
    takeSessionMessages("session-queue");
  });

  it("drains queued messages once in FIFO order", () => {
    queueSessionMessage("session-queue", "先补充验收标准");
    queueSessionMessage("session-queue", "再指定交付格式");

    expect(takeSessionMessages("session-queue")).toEqual([
      "先补充验收标准",
      "再指定交付格式",
    ]);
    expect(takeSessionMessages("session-queue")).toEqual([]);
  });

  it("builds a bounded continuation objective with prior goal and updates", () => {
    const goal = buildContinuationGoal("完成供应商准入", ["补充风险分级", "输出 Markdown"]);

    expect(goal).toContain("上一轮目标：\n完成供应商准入");
    expect(goal).toContain("用户最新补充：\n补充风险分级\n输出 Markdown");
    expect(goal.length).toBeLessThanOrEqual(8_100);
  });

  it("keeps the binding for the same objective and clears it for a new objective", () => {
    const session: CollaborationSession = {
      id: "session-queue",
      projectId: "proj-test",
      globalGoal: "原始目标",
      status: "completed" as const,
      createdAt: "2026-10-16T00:00:00.000Z",
      updatedAt: "2026-10-16T00:00:00.000Z",
      config: {},
    };
    updateFormalObjective(session, "原始目标");
    const requestId = session.executionRequestId;
    session.formalExecution = {
      requestId: requestId!,
      parentTaskId: "task-1",
      parentStepId: "step-1",
      runId: "run-1",
    };

    updateFormalObjective(session, "原始目标");
    expect(session.executionRequestId).toBe(requestId);
    expect(session.formalExecution?.runId).toBe("run-1");

    updateFormalObjective(session, "新的目标");
    expect(session.executionRequestId).not.toBe(requestId);
    expect(session.formalExecution).toBeUndefined();
  });
});
