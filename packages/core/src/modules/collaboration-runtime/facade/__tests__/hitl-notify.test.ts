/**
 * Tests for facade/hitl-notify — HITL 事件 → OriginOS 通知中心 转发（Story 9.44 模块 5）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const createNotificationMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../lib/integrations/pi-agent/notification-system", () => ({
  NotificationType: {
    ONTOLOGY_CHANGE: "ontology_change",
    SYSTEM_ALERT: "system_alert",
    TASK_COMPLETION: "task_completion",
    SYSTEM_MESSAGE: "system_message",
  },
  getNotificationManager: vi.fn(),
}));

import {
  getNotificationManager,
  NotificationType,
} from "../../../../lib/integrations/pi-agent/notification-system";
import { registerHitlNotificationForwarder } from "../hitl-notify";
import { eventEmitter } from "../event-bus";
import type { RuntimeEvent } from "../../../../modules/collaboration-runtime/session/types";

function makeHitlEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
  return {
    id: "evt-hitl-1",
    sessionId: "sess-1",
    seq: 0,
    type: "HUMAN_REVIEW_REQUEST",
    payload: { question: "需要确认 Q3 预算方案" },
    source: "supervisor",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("registerHitlNotificationForwarder", () => {
  const mockGetNotificationManager = vi.mocked(getNotificationManager);
  const disposers: Array<() => void> = [];
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 重置 HMR 去重集合与转发器集合，保证用例隔离
    globalThis.__collaborationHitlNotifiedEventIds = undefined;
    globalThis.__collaborationElectronForwarders = new Set();

    createNotificationMock.mockReset();
    createNotificationMock.mockResolvedValue({ id: "notif-1" });
    mockGetNotificationManager.mockReset();
    mockGetNotificationManager.mockImplementation(
      () =>
        ({
          createNotification: createNotificationMock,
        }) as unknown as ReturnType<typeof getNotificationManager>,
    );

    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    errorSpy.mockRestore();
  });

  it(" forwards HUMAN_REVIEW_REQUEST as SYSTEM_MESSAGE notification with hitlEventId/sessionId payload", () => {
    disposers.push(registerHitlNotificationForwarder());

    eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-a", sessionId: "sess-a", source: "supervisor" }));

    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(createNotificationMock).toHaveBeenCalledWith(
      NotificationType.SYSTEM_MESSAGE,
      "多 Agent 协作等待回复",
      "需要确认 Q3 预算方案",
      { hitlEventId: "evt-hitl-a", sessionId: "sess-a", source: "supervisor" },
      { sessionId: "sess-a" },
    );
 expect(errorSpy).not.toHaveBeenCalled();
  });

  it("ignores non-HITL events (TASK_CREATED, ASSISTANT_MESSAGE)", () => {
    disposers.push(registerHitlNotificationForwarder());

    eventEmitter.emit(makeHitlEvent({ id: "evt-task-1", type: "TASK_CREATED" }));
    eventEmitter.emit(makeHitlEvent({ id: "evt-msg-1", type: "ASSISTANT_MESSAGE" }));

    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("dedupes the same event id (exactly 1 notification)", () => {
    disposers.push(registerHitlNotificationForwarder());

    eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-dup" }));
    eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-dup" }));

    expect(createNotificationMock).toHaveBeenCalledOnce();
  });

  it("truncates question longer than 120 chars", () => {
    disposers.push(registerHitlNotificationForwarder());

    const longQuestion = "问".repeat(300);
    eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-long", payload: { question: longQuestion } }));

    expect(createNotificationMock).toHaveBeenCalledOnce();
    const body = createNotificationMock.mock.calls[0]?.[2] as string;
    expect(body).toHaveLength(120);
    expect(body).toBe("问".repeat(120));
  });

  it("falls back to default body when question is empty", () => {
    disposers.push(registerHitlNotificationForwarder());

    eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-empty", payload: {} }));

    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(createNotificationMock.mock.calls[0]?.[2]).toBe("协作会话需要你的人工输入");
  });

  it("does not throw when createNotification rejects", async () => {
    disposers.push(registerHitlNotificationForwarder());
    createNotificationMock.mockRejectedValue(new Error("disk full"));

    expect(() =>
      eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-reject" })),
    ).not.toThrow();

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain("[collaboration] HITL notification failed");
    });
  });

  it("does not throw when createNotification throws synchronously", () => {
    disposers.push(registerHitlNotificationForwarder());
    createNotificationMock.mockImplementation(() => {
      throw new Error("sync boom");
    });

    expect(() =>
      eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-sync-throw" })),
    ).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("[collaboration] HITL notification failed");
  });

  it("does not throw when getNotificationManager itself throws synchronously", () => {
    mockGetNotificationManager.mockImplementation(() => {
      throw new Error("manager boom");
    });
    disposers.push(registerHitlNotificationForwarder());

    expect(() =>
      eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-manager-throw" })),
    ).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("[collaboration] HITL notification failed");
  });

  it("registering twice does not double-notify the same event id (HMR-safe globalThis set)", () => {
    disposers.push(registerHitlNotificationForwarder());
    disposers.push(registerHitlNotificationForwarder());

    eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-hmr" }));

    expect(createNotificationMock).toHaveBeenCalledOnce();

    // 模拟 HMR：注销旧转发器后重新注册，去重集合仍在 globalThis 上
    for (const dispose of disposers.splice(0)) dispose();
    disposers.push(registerHitlNotificationForwarder());

    eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-hmr" }));
    eventEmitter.emit(makeHitlEvent({ id: "evt-hitl-hmr-2" }));

    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });
});
