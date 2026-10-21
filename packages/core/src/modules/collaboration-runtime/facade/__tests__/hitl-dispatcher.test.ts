/**
 * Tests for facade/hitl-dispatcher — HITL routing and message dispatch
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  sendMessageToSupervisor,
  respondToHumanReview,
  setStartDag,
  setResumeSupervisorHitl,
} from "../hitl-dispatcher";
import { sessions, eventStores, takeSessionMessages } from "../session-store";
import type { CollaborationSession } from "../../../../modules/collaboration-runtime/session/types";

// Minimal FsEventStore stub
const stubStore = {
  append: vi.fn().mockResolvedValue(undefined),
};

function makeSession(overrides: Partial<CollaborationSession> = {}): CollaborationSession {
  return {
    id: "sess-1",
    projectId: "proj-test",
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {},
    ...overrides,
  };
}

describe("sendMessageToSupervisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessions.clear();
    eventStores.clear();
    takeSessionMessages("sess-1");
    setStartDag(null as never);
    setResumeSupervisorHitl(null as never);
  });

  it("returns error when session not found", async () => {
    const result = await sendMessageToSupervisor("nonexistent", "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/);
  });

  it("returns error when session is not running or greeting", async () => {
    sessions.set("sess-1", makeSession({ status: "created" }));
    const result = await sendMessageToSupervisor("sess-1", "hello");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not running/);
  });

  it.each(["completed", "aborted", "terminated"] as const)("starts a fresh run after a %s run", async (status) => {
    const startDag = vi.fn().mockResolvedValue({ status: "running", result: null });
    setStartDag(startDag);
    const session = makeSession({
      status,
      globalGoal: "上一轮目标",
      executionRequestId: "request:old",
      formalExecution: {
        requestId: "request:old",
        parentTaskId: "task-old",
        parentStepId: "step-old",
        runId: "run-old",
      },
    });
    sessions.set("sess-1", session);
    eventStores.set("sess-1", stubStore as never);

    const result = await sendMessageToSupervisor("sess-1", "continue with a new goal");

    expect(result.success).toBe(true);
    expect(session.globalGoal).toBe("continue with a new goal");
    expect(session.executionRequestId).toMatch(/^request:[a-f0-9]{64}$/);
    expect(session.executionRequestId).not.toBe("request:old");
    expect(session.formalExecution).toBeUndefined();
    expect(startDag).toHaveBeenCalledOnce();
  });

  it("triggers startDag on greeting status", async () => {
    const startDag = vi.fn().mockResolvedValue({ status: "ok", result: null });
    setStartDag(startDag);
    sessions.set("sess-1", makeSession({ status: "greeting" }));

    const result = await sendMessageToSupervisor("sess-1", "My goal");
    expect(result.success).toBe(true);
    expect(startDag).toHaveBeenCalledOnce();
  });

  it("sets globalGoal on greeting", async () => {
    setStartDag(vi.fn().mockResolvedValue({ status: "ok", result: null }));
    const session = makeSession({ status: "greeting" });
    sessions.set("sess-1", session);

    await sendMessageToSupervisor("sess-1", "My new goal");
    expect(session.globalGoal).toBe("My new goal");
  });

  it("calls resumeSupervisorHitl when session is running", async () => {
    const resume = vi.fn().mockReturnValue(true);
    setResumeSupervisorHitl(resume);
    sessions.set("sess-1", makeSession({ status: "running" }));
    eventStores.set("sess-1", stubStore as never);

    const result = await sendMessageToSupervisor("sess-1", "user reply");
    expect(result.success).toBe(true);
    expect(resume).toHaveBeenCalledWith("sess-1", "user reply", undefined);
  });

  it("passes workerId to resumeSupervisorHitl", async () => {
    const resume = vi.fn().mockReturnValue(true);
    setResumeSupervisorHitl(resume);
    sessions.set("sess-1", makeSession({ status: "running" }));
    eventStores.set("sess-1", stubStore as never);

    await sendMessageToSupervisor("sess-1", "reply", "worker-42");
    expect(resume).toHaveBeenCalledWith("sess-1", "reply", "worker-42");
  });

  it("returns success even if resumeSupervisorHitl returns false (new goal path)", async () => {
    const resume = vi.fn().mockReturnValue(false);
    const startDag = vi.fn().mockResolvedValue({ status: "ok", result: null });
    setResumeSupervisorHitl(resume);
    setStartDag(startDag);
    sessions.set("sess-1", makeSession({ status: "running" }));
    eventStores.set("sess-1", stubStore as never);

    const result = await sendMessageToSupervisor("sess-1", "new objective");
    expect(result.success).toBe(true);
    expect(startDag).toHaveBeenCalledOnce();
  });

  it("queues a follow-up while a formal WorkItem run is active", async () => {
    const resume = vi.fn().mockReturnValue(false);
    const startDag = vi.fn().mockResolvedValue({ status: "ok", result: null });
    setResumeSupervisorHitl(resume);
    setStartDag(startDag);
    sessions.set("sess-1", makeSession({
      status: "running",
      formalExecution: {
        requestId: "request-1",
        parentTaskId: "task-1",
        parentStepId: "step-1",
        runId: "run-1",
      },
    }));
    eventStores.set("sess-1", stubStore as never);

    const result = await sendMessageToSupervisor("sess-1", "补充新的验收要求");

    expect(result.success).toBe(true);
    expect(resume).not.toHaveBeenCalled();
    expect(startDag).not.toHaveBeenCalled();
    expect(takeSessionMessages("sess-1")).toEqual(["补充新的验收要求"]);
  });

  it("queues a follow-up while the formal run binding is still pending", async () => {
    const resume = vi.fn().mockReturnValue(false);
    const startDag = vi.fn().mockResolvedValue({ status: "ok", result: null });
    setResumeSupervisorHitl(resume);
    setStartDag(startDag);
    sessions.set("sess-1", makeSession({
      status: "running",
      executionRequestId: "request-formal-binding",
    }));
    eventStores.set("sess-1", stubStore as never);

    const result = await sendMessageToSupervisor("sess-1", "绑定期间的补充信息");

    expect(result.success).toBe(true);
    expect(resume).not.toHaveBeenCalled();
    expect(startDag).not.toHaveBeenCalled();
    expect(takeSessionMessages("sess-1")).toEqual(["绑定期间的补充信息"]);
  });
});

describe("respondToHumanReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessions.clear();
    eventStores.clear();
    setResumeSupervisorHitl(null as never);
  });

  it("delegates to sendMessageToSupervisor", async () => {
    const resume = vi.fn().mockReturnValue(true);
    setResumeSupervisorHitl(resume);
    sessions.set("sess-1", makeSession({ status: "running" }));
    eventStores.set("sess-1", stubStore as never);

    const result = await respondToHumanReview("sess-1", "agent-x", "approved");
    expect(result.success).toBe(true);
  });
});
