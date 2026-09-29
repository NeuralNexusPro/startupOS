/**
 * POST /api/taste/user/detection/start
 * Start a new user taste detection session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionService } from '@originos/core/lib/features/culture';
import {
  CultureDetectionError,
} from '@originos/core/lib/features/culture/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, projectId, maxTurns } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // Validate maxTurns
    const validMaxTurns = Math.max(3, Math.min(5, maxTurns || 3));

    // Create new session
    const sessionService = getSessionService();
    const session = await sessionService.createSession(userId, projectId, validMaxTurns);

    // Get first question
    const firstQuestion = await sessionService.getFirstQuestion(session.sessionId);

    const response = {
      sessionId: session.sessionId,
      userId: session.userId,
      status: session.status,
      currentTurn: session.currentTurn,
      maxTurns: session.maxTurns,
      firstQuestion,
      createdAt: session.createdAt,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof CultureDetectionError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 400 }
      );
    }

    console.error('Error starting detection session:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
