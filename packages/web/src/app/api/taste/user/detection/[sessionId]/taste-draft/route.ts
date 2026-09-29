/**
 * GET /api/taste/user/detection/:sessionId/taste-draft
 * Get the generated TASTE profile draft
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionService, getDetectionService } from '@originos/core/lib/features/culture';
import {
  CultureDetectionError,
  ERROR_CODES,
} from '@originos/core/lib/features/culture/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    // Get session
    const sessionService = getSessionService();
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found', code: ERROR_CODES.SESSION_NOT_FOUND },
        { status: 404 }
      );
    }

    // Check if analysis is complete
    if (session.status !== 'completed') {
      return NextResponse.json(
        {
          error: 'Analysis not yet completed',
          code: ERROR_CODES.ANALYSIS_NOT_COMPLETE,
        },
        { status: 425 } // Too Early
      );
    }

    // Get taste draft
    const detectionService = getDetectionService();
    const draft = await detectionService.getTasteDraft(sessionId);

    const response = {
      sessionId: session.sessionId,
      userId: session.userId,
      projectId: session.projectId,
      draft: draft.tasteProfile,
      isComplete: session.status === 'completed',
      generatedAt: draft.analysisCompletedAt,
      confidence: draft.confidence,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof CultureDetectionError) {
      const status = error.code === ERROR_CODES.SESSION_NOT_FOUND ? 404 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status }
      );
    }

    console.error('Error getting taste draft:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
