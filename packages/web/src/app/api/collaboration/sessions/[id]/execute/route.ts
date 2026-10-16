import { NextResponse } from "next/server";

/**
 * Story 9.28 — API 执行入口
 * 支持 executionMode 参数: "workflow" | "system"
 * 委托 service 层执行
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const { getProjectContractRuntimeComposition } = await import('@/services/ontologyCrossPackageService');
    getProjectContractRuntimeComposition();
    const { executeSession } = await import("@/modules/collaboration-runtime/facade");
    const result = await executeSession(params.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to execute session";
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json(
      { error: message, stack },
      { status: 500 }
    );
  }
}
