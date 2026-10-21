import { NextResponse } from "next/server";
import type { RuntimeLLMConfig } from "@originos/core/lib/integrations/pi-agent/server";
import { persistRuntimeLLMConfig } from "@originos/core/lib/features/user-config";

interface MessageRouteBody {
  message?: unknown;
  to?: unknown;
  workerId?: unknown;
  intent?: unknown;
  llmConfig?: RuntimeLLMConfig;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const raw: unknown = await request.json();
    if (typeof raw !== "object" || raw === null) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const body = raw as MessageRouteBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const to = body.to;
    const workerId = typeof body.workerId === "string" ? body.workerId : undefined;
    const intent = body.intent === "continue_previous" || body.intent === "hitl_response"
      ? body.intent
      : workerId
        ? "hitl_response"
        : "new_objective";
    const llmConfig = (body.llmConfig && typeof body.llmConfig === "object") ? body.llmConfig : undefined;
    persistRuntimeLLMConfig(llmConfig);

    if (message.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: message" },
        { status: 400 }
      );
    }

    if (to !== undefined && to !== "supervisor") {
      return NextResponse.json(
        { error: "Collaboration messages must target supervisor" },
        { status: 400 }
      );
    }

    const { sendMessageToSupervisor } = await import("@originos/core/modules/collaboration-runtime/facade");
    const { getProjectContractRuntimeComposition } = await import('@/services/ontologyCrossPackageService');
    getProjectContractRuntimeComposition();
    const result = await sendMessageToSupervisor(params.id, message, workerId, llmConfig, intent);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Failed to send message" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: { to: "supervisor" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send collaboration message" },
      { status: 500 }
    );
  }
}
