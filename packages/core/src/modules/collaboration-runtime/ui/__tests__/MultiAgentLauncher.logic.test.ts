/**
 * Tests for MultiAgentLauncher UI logic — coordination folding and HITL request derivation.
 *
 * These functions are not exported from the component, so we test the logic directly
 * by duplicating the pure function implementations here (no React dependency).
 */

import { describe, it, expect } from "vitest";
import type { RuntimeEvent } from "../../../../modules/collaboration-runtime/session/types";

// ────────────────────────────────────────────────────────────────────────────
// Inline the pure logic (no React import needed)
// ────────────────────────────────────────────────────────────────────────────

interface ForegroundMessage {
  id: string;
  role: "user" | "supervisor";
  text: string;
  timestamp: string;
  isCoordination?: boolean;
  coordinationType?: string;
  isHitl?: boolean;
  workerId?: string;
}

interface CoordinationGroup {
  id: string;
  role: "coordination-group";
  items: ForegroundMessage[];
  timestamp: string;
}

interface Divider {
  id: string;
  role: "divider";
  text: string;
  timestamp: string;
}

type DisplayMessage = ForegroundMessage | CoordinationGroup | Divider;

function collapseCoordinationGroups(messages: ForegroundMessage[]): DisplayMessage[] {
  const result: DisplayMessage[] = [];
  let coordBuf: ForegroundMessage[] = [];

  const flushCoord = () => {
    if (coordBuf.length === 0) return;
    if (coordBuf.length < 3) {
      result.push(...coordBuf);
    } else {
      result.push({
        id: `coord-group-${coordBuf[0]!.id}`,
        role: "coordination-group",
        items: coordBuf,
        timestamp: coordBuf[0]!.timestamp,
      });
    }
    coordBuf = [];
  };

  for (const msg of messages) {
    if (msg.isCoordination) {
      coordBuf.push(msg);
    } else {
      flushCoord();
      result.push(msg);
    }
  }
  flushCoord();
  return result;
}

interface HitlRequest {
  eventId: string;
  workerId: string;
  workerName: string;
  question: string;
  timestamp: string;
}

function derivePendingHitlRequests(events: RuntimeEvent[]): HitlRequest[] {
  const requests: HitlRequest[] = [];
  for (const ev of events) {
    if (ev.type !== "HUMAN_REVIEW_REQUEST") continue;
    const wid = String(ev.payload?.["agentId"] ?? ev.source ?? "");
    const requestId = String(ev.payload?.["requestId"] ?? "");
    const alreadyReplied = events.some((e) => {
      if (e.type !== "USER_REPLY_TO_SUPERVISOR" && e.type !== "HUMAN_REVIEW_RESPONSE") return false;
      if (e.timestamp <= ev.timestamp) return false;
      const responseRequestId = String(e.payload?.["requestId"] ?? "");
      if (requestId) return responseRequestId === requestId;
      return !wid || String(e.payload?.["workerId"] ?? e.payload?.["agentId"] ?? "") === wid;
    });
    if (!alreadyReplied) {
      requests.push({
        eventId: ev.id,
        workerId: wid,
        workerName: String(ev.payload?.["onBehalfOfName"] ?? wid),
        question: String(ev.payload?.["question"] ?? ""),
        timestamp: ev.timestamp,
      });
    }
  }
  return requests;
}

// ────────────────────────────────────────────────────────────────────────────
// Tests: collapseCoordinationGroups
// ────────────────────────────────────────────────────────────────────────────

function makeMsg(id: string, isCoordination = false): ForegroundMessage {
  return { id, role: "supervisor", text: `msg-${id}`, timestamp: `2024-01-01T00:00:0${id}Z`, isCoordination };
}

describe("collapseCoordinationGroups", () => {
  it("returns empty array for empty input", () => {
    expect(collapseCoordinationGroups([])).toEqual([]);
  });

  it("passes through non-coordination messages unchanged", () => {
    const msgs = [makeMsg("1"), makeMsg("2")];
    const result = collapseCoordinationGroups(msgs);
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.role !== "coordination-group")).toBe(true);
  });

  it("passes through 1 consecutive coordination message individually", () => {
    const msgs = [makeMsg("1", true)];
    const result = collapseCoordinationGroups(msgs);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("supervisor");
  });

  it("passes through 2 consecutive coordination messages individually", () => {
    const msgs = [makeMsg("1", true), makeMsg("2", true)];
    const result = collapseCoordinationGroups(msgs);
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.role === "supervisor")).toBe(true);
  });

  it("collapses 3 consecutive coordination messages into a group", () => {
    const msgs = [makeMsg("1", true), makeMsg("2", true), makeMsg("3", true)];
    const result = collapseCoordinationGroups(msgs);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("coordination-group");
    expect((result[0] as CoordinationGroup).items).toHaveLength(3);
  });

  it("collapses 5 consecutive coordination messages into a single group", () => {
    const msgs = Array.from({ length: 5 }, (_, i) => makeMsg(String(i), true));
    const result = collapseCoordinationGroups(msgs);
    expect(result).toHaveLength(1);
    expect((result[0] as CoordinationGroup).items).toHaveLength(5);
  });

  it("flushes coordination buffer when a non-coordination message appears", () => {
    const msgs = [
      makeMsg("1", true),
      makeMsg("2", true),
      makeMsg("3", true),
      makeMsg("4", false), // non-coord → flush
    ];
    const result = collapseCoordinationGroups(msgs);
    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe("coordination-group");
    expect(result[1]!.role).toBe("supervisor");
  });

  it("handles interleaved coordination and non-coordination messages", () => {
    // user, 4x coord, user, 2x coord, user
    const msgs: ForegroundMessage[] = [
      { ...makeMsg("u1"), role: "user" },
      makeMsg("c1", true), makeMsg("c2", true), makeMsg("c3", true), makeMsg("c4", true),
      { ...makeMsg("u2"), role: "user" },
      makeMsg("c5", true), makeMsg("c6", true),
      { ...makeMsg("u3"), role: "user" },
    ];
    const result = collapseCoordinationGroups(msgs);
    // user, group(4), user, c5, c6 (only 2 so not grouped), user
    expect(result).toHaveLength(6);
    expect(result[0]!.role).toBe("user");
    expect(result[1]!.role).toBe("coordination-group");
    expect((result[1] as CoordinationGroup).items).toHaveLength(4);
    expect(result[2]!.role).toBe("user");
    expect(result[3]!.role).toBe("supervisor"); // c5 individually
    expect(result[4]!.role).toBe("supervisor"); // c6 individually
    expect(result[5]!.role).toBe("user");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tests: derivePendingHitlRequests
// ────────────────────────────────────────────────────────────────────────────

function makeEvent(id: string, type: string, payload: Record<string, unknown> = {}, source = "supervisor"): RuntimeEvent {
  return {
    id,
    sessionId: "sess-1",
    seq: 0,
    type: type as RuntimeEvent["type"],
    payload,
    source,
    timestamp: `2024-01-01T00:00:${id.padStart(2, "0")}Z`,
  };
}

describe("derivePendingHitlRequests", () => {
  it("returns empty when no HUMAN_REVIEW_REQUEST events", () => {
    const events = [makeEvent("01", "USER_INPUT", { message: "hello" }, "user")];
    expect(derivePendingHitlRequests(events)).toHaveLength(0);
  });

  it("returns a pending request for unanswered HUMAN_REVIEW_REQUEST", () => {
    const events = [
      makeEvent("01", "HUMAN_REVIEW_REQUEST", { question: "Proceed?", agentId: "worker-a" }, "worker-a"),
    ];
    const result = derivePendingHitlRequests(events);
    expect(result).toHaveLength(1);
    expect(result[0]!.workerId).toBe("worker-a");
    expect(result[0]!.question).toBe("Proceed?");
  });

  it("does not return request when already replied via USER_REPLY_TO_SUPERVISOR", () => {
    const events = [
      makeEvent("01", "HUMAN_REVIEW_REQUEST", { question: "Proceed?", agentId: "worker-a" }, "worker-a"),
      makeEvent("02", "USER_REPLY_TO_SUPERVISOR", { workerId: "worker-a" }, "user"),
    ];
    expect(derivePendingHitlRequests(events)).toHaveLength(0);
  });

  it("does not return request when already replied via HUMAN_REVIEW_RESPONSE", () => {
    const events = [
      makeEvent("01", "HUMAN_REVIEW_REQUEST", { question: "OK?", agentId: "worker-b" }, "worker-b"),
      makeEvent("02", "HUMAN_REVIEW_RESPONSE", { agentId: "worker-b" }, "user"),
    ];
    expect(derivePendingHitlRequests(events)).toHaveLength(0);
  });

  it("handles multiple concurrent HITL requests from different workers", () => {
    const events = [
      makeEvent("01", "HUMAN_REVIEW_REQUEST", { question: "Q1", agentId: "worker-a" }, "worker-a"),
      makeEvent("02", "HUMAN_REVIEW_REQUEST", { question: "Q2", agentId: "worker-b" }, "worker-b"),
    ];
    const result = derivePendingHitlRequests(events);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.workerId)).toContain("worker-a");
    expect(result.map((r) => r.workerId)).toContain("worker-b");
  });

  it("correctly filters when only one of two requests has been answered", () => {
    const events = [
      makeEvent("01", "HUMAN_REVIEW_REQUEST", { question: "Q1", agentId: "worker-a" }, "worker-a"),
      makeEvent("02", "HUMAN_REVIEW_REQUEST", { question: "Q2", agentId: "worker-b" }, "worker-b"),
      makeEvent("03", "USER_REPLY_TO_SUPERVISOR", { workerId: "worker-a" }, "user"),
    ];
    const result = derivePendingHitlRequests(events);
    expect(result).toHaveLength(1);
    expect(result[0]!.workerId).toBe("worker-b");
  });

  it("matches concurrent formal replies by request id even for the same worker", () => {
    const events = [
      makeEvent("01", "HUMAN_REVIEW_REQUEST", { question: "Q1", agentId: "worker-a", requestId: "hitl-1" }, "worker-a"),
      makeEvent("02", "HUMAN_REVIEW_REQUEST", { question: "Q2", agentId: "worker-a", requestId: "hitl-2" }, "worker-a"),
      makeEvent("03", "HUMAN_REVIEW_RESPONSE", { requestId: "hitl-1" }, "user"),
    ];
    const result = derivePendingHitlRequests(events);
    expect(result).toHaveLength(1);
    expect(result[0]!.question).toBe("Q2");
  });
});
