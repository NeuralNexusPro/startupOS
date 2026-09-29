'use client';

/**
 * useCultureDetection Hook
 * React Hook for user taste detection
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { startTasteDetection, sendTasteDetectionMessage, analyzeTasteDetection, getTasteDraft as fetchGetTasteDraft } from '../../../integrations/electron/services/misc';

interface UseCultureDetectionOptions {
  onSessionCreated?: (sessionId: string) => void;
  onAnalysisComplete?: (tasteProfile: any) => void;
  onError?: (error: Error) => void;
}

interface UseCultureDetectionReturn {
  // Session state
  sessionId: string | null;
  currentQuestion: string | null;
  turnCount: number;
  isComplete: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  startSession: (userId: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  analyzeDialogue: () => Promise<void>;
  getTasteDraft: () => Promise<any>;

  // Analysis result
  tasteProfile: any | null;
  confidence: number;
}

export function useCultureDetection(options: UseCultureDetectionOptions = {}): UseCultureDetectionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasteProfile, setTasteProfile] = useState<any>(null);
  const [confidence, setConfidence] = useState(0);

  // Use refs to store callbacks to avoid recreating functions on every render
  const onSessionCreatedRef = useRef(options.onSessionCreated);
  const onAnalysisCompleteRef = useRef(options.onAnalysisComplete);
  const onErrorRef = useRef(options.onError);

  // Update refs when options change
  useEffect(() => {
    onSessionCreatedRef.current = options.onSessionCreated;
    onAnalysisCompleteRef.current = options.onAnalysisComplete;
    onErrorRef.current = options.onError;
  }, [options.onSessionCreated, options.onAnalysisComplete, options.onError]);

  // Start new detection session
  const startSession = useCallback(async (userId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await startTasteDetection({ userId });
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to start session');
      }

      const data = result.data as { sessionId: string; firstQuestion: string };
      setSessionId(data.sessionId);
      setCurrentQuestion(data.firstQuestion);
      setTurnCount(0);
      setIsComplete(false);
      setTasteProfile(null);

      onSessionCreatedRef.current?.(data.sessionId);
    } catch (err: any) {
      setError(err.message);
      onErrorRef.current?.(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Send user message
  const sendMessage = useCallback(async (message: string) => {
    if (!sessionId) {
      setError('No active session');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await sendTasteDetectionMessage(sessionId, message, turnCount);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to send message');
      }

      const data = result.data as { suggestedNextQuestion?: string; turn: number; isComplete: boolean };
      setCurrentQuestion(data.suggestedNextQuestion || null);
      setTurnCount(data.turn);
      setIsComplete(data.isComplete);

      if (data.isComplete) {
        onAnalysisCompleteRef.current?.(null); // Will be filled after getTasteDraft
      }
    } catch (err: any) {
      setError(err.message);
      onErrorRef.current?.(err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, turnCount]);

  // Trigger dialogue analysis
  const analyzeDialogue = useCallback(async () => {
    if (!sessionId) {
      setError('No active session');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await analyzeTasteDetection(sessionId);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to analyze dialogue');
      }

      // Analysis is complete, call getTasteDraft to get result
      await getTasteDraftInternal(sessionId);
    } catch (err: any) {
      setError(err.message);
      onErrorRef.current?.(err);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Internal getTasteDraft that can be called from other functions
  const getTasteDraftInternal = useCallback(async (sid: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await fetchGetTasteDraft(sid);
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to get taste draft');
      }

      const data = result.data as { draft: unknown; confidence?: number };
      setTasteProfile(data.draft);
      setConfidence(data.confidence ?? 0);

      onAnalysisCompleteRef.current?.(data.draft);
    } catch (err: any) {
      setError(err.message);
      onErrorRef.current?.(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get taste draft
  const getTasteDraft = useCallback(async () => {
    if (!sessionId) {
      setError('No active session');
      return;
    }

    await getTasteDraftInternal(sessionId);
  }, [sessionId, getTasteDraftInternal]);

  return {
    sessionId,
    currentQuestion,
    turnCount,
    isComplete,
    isLoading,
    error,
    startSession,
    sendMessage,
    analyzeDialogue,
    getTasteDraft,
    tasteProfile,
    confidence,
  };
}
