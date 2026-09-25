import { NextResponse } from "next/server";

/**
 * GET /api/collaboration/topology?projectId=...
 *
 * Load project collaboration topology from solution manifest.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (projectId === null) {
      return NextResponse.json(
        { error: "Missing projectId" },
        { status: 400 }
      );
    }

    const { loadProjectSolutionTopologyProjection } = await import("@originos/core/lib/features/solution");
    const topology = await loadProjectSolutionTopologyProjection({ projectId });

    if (topology === null) {
      return NextResponse.json(
        { error: "No topology found for project" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: topology });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load topology" },
      { status: 500 }
    );
  }
}
