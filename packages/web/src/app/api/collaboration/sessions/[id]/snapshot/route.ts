import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const { getSessionTaskSnapshot } = await import('@/modules/collaboration-runtime/facade');
    const snapshot = await getSessionTaskSnapshot(params.id);
    if (!snapshot) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: snapshot });
  } catch {
    return NextResponse.json({ error: 'Failed to get task snapshot' }, { status: 500 });
  }
}
