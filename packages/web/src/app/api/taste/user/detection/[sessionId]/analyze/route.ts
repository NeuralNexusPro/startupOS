/**
 * POST /api/taste/user/detection/:sessionId/analyze
 * Trigger LLM analysis of the dialogue
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionService, getDetectionService } from '@originos/core/lib/features/culture';
import {
  CultureDetectionError,
  ERROR_CODES,
} from '@originos/core/lib/features/culture/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await req.json().catch(() => ({}));
    const { options } = body;
    const forceReanalyze = options?.forceReanalyze ?? false;

    // Get session
    const sessionService = getSessionService();
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found', code: ERROR_CODES.SESSION_NOT_FOUND },
        { status: 404 }
      );
    }

    // Check if session is ready for analysis
    if (!sessionService.isReadyForAnalysis(session) && !forceReanalyze) {
      return NextResponse.json(
        {
          error: 'Session not ready for analysis. Need more dialogue turns.',
          code: ERROR_CODES.SESSION_NOT_READY,
        },
        { status: 400 }
      );
    }

    // Check if already analyzing
    if (session.status === 'analyzing') {
      return NextResponse.json(
        { error: 'Analysis already in progress', code: ERROR_CODES.ANALYSIS_IN_PROGRESS },
        { status: 409 }
      );
    }

    // Check if already completed (unless force reanalyze)
    if (session.status === 'completed' && !forceReanalyze) {
      return NextResponse.json(
        { error: 'Session already analyzed', code: ERROR_CODES.SESSION_ALREADY_COMPLETED },
        { status: 409 }
      );
    }

    // Trigger analysis
    const detectionService = getDetectionService();
    const result = await detectionService.analyzeDialogue(sessionId);

    const response = {
      sessionId: session.sessionId,
      analysisId: `analysis-${sessionId}-${Date.now()}`,
      status: 'completed' as const,
      cultureLayer: result.cultureLayer,
      confidence: result.confidence,
      tasteDraftId: result.tasteDraftId,
      message: 'Analysis completed successfully',
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

    console.error('Error analyzing dialogue:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
