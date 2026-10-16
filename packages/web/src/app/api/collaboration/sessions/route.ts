import { NextResponse } from "next/server";
import { createSession } from "@originos/core/modules/collaboration-runtime/facade";
import { getProjectContractRuntimeComposition } from '@/services/ontologyCrossPackageService';

export async function POST(request: Request) {
  try {
    getProjectContractRuntimeComposition();
    const body = await request.json();
    const session = await createSession(body);
    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create session" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const { listSessions } = await import("@/modules/collaboration-runtime/facade");
    const sessions = await listSessions();
    return NextResponse.json(sessions);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list sessions" },
      { status: 500 }
    );
  }
}
