/**
 * POST /api/taste/user/detection/:sessionId/message
 * Send user message and get next question
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionService } from '@originos/core/lib/features/culture';
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
    const body = await req.json();
    const { content, turn } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Message content is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (content.length < 1 || content.length > 2000) {
      return NextResponse.json(
        { error: 'Message content must be between 1 and 2000 characters', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Get session and validate
    const sessionService = getSessionService();
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found', code: ERROR_CODES.SESSION_NOT_FOUND },
        { status: 404 }
      );
    }

    if (session.status === 'completed') {
      return NextResponse.json(
        { error: 'Session already completed', code: ERROR_CODES.SESSION_ALREADY_COMPLETED },
        { status: 409 }
      );
    }

    if (session.status === 'analyzing') {
      return NextResponse.json(
        { error: 'Session is analyzing', code: ERROR_CODES.ANALYSIS_IN_PROGRESS },
        { status: 409 }
      );
    }

    // Add message and get response
    const result = await sessionService.addMessage(sessionId, content, turn);

    const response = {
      sessionId: session.sessionId,
      message: result.message,
      role: 'assistant' as const,
      turn: result.turn,
      isComplete: result.isComplete,
      suggestedNextQuestion: result.nextQuestion,
      nextAction: result.isComplete ? 'analyze' : 'continue',
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

    console.error('Error adding message:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
