import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSendMessageToSupervisor = vi.fn();
const mockGetProjectContractRuntimeComposition = vi.fn();

vi.mock("@originos/core/modules/collaboration-runtime/facade", () => ({
  sendMessageToSupervisor: mockSendMessageToSupervisor,
}));
vi.mock('@/services/ontologyCrossPackageService', () => ({
  getProjectContractRuntimeComposition: mockGetProjectContractRuntimeComposition,
}));

const { POST } = await import("../route");

describe("POST /api/collaboration/sessions/[id]/messages — Story 9.31", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessageToSupervisor.mockResolvedValue({ success: true });
  });

  it("accepts messages routed to supervisor", async () => {
    const request = new NextRequest("http://localhost/api/collaboration/sessions/cs-test/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "supervisor", message: "请创建一个新项目" }),
    });

    const response = await POST(request, { params: { id: "cs-test" } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.to).toBe("supervisor");
    expect(mockSendMessageToSupervisor).toHaveBeenCalledWith(
      "cs-test",
      "请创建一个新项目",
      undefined,
      undefined,
      "new_objective",
    );
  });

  it("passes explicit continuation intent without inferring it from message text", async () => {
    const request = new NextRequest("http://localhost/api/collaboration/sessions/cs-test/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "supervisor",
        message: "把遗漏项补上",
        intent: "continue_previous",
      }),
    });

    const response = await POST(request, { params: { id: "cs-test" } });

    expect(response.status).toBe(200);
    expect(mockSendMessageToSupervisor).toHaveBeenCalledWith(
      "cs-test",
      "把遗漏项补上",
      undefined,
      undefined,
      "continue_previous",
    );
  });

  it("rejects messages addressed to non-supervisor targets", async () => {
    const request = new NextRequest("http://localhost/api/collaboration/sessions/cs-test/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "project-config", message: "直接问 worker" }),
    });

    const response = await POST(request, { params: { id: "cs-test" } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("supervisor");
    expect(mockSendMessageToSupervisor).not.toHaveBeenCalled();
  });

  it("rejects empty messages", async () => {
    const request = new NextRequest("http://localhost/api/collaboration/sessions/cs-test/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "supervisor", message: "   " }),
    });

    const response = await POST(request, { params: { id: "cs-test" } });

    expect(response.status).toBe(400);
    expect(mockSendMessageToSupervisor).not.toHaveBeenCalled();
  });
});
