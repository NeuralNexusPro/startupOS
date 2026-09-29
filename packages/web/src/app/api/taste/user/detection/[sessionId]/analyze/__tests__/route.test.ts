/**
 * API Tests: POST /api/taste/user/detection/:sessionId/analyze
 * Story C.1: User TASTE Generation
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

// Mock the session and detection services
const mockSession = {
  sessionId: 'test-session-123',
  userId: 'test-user-001',
  status: 'active',
  currentTurn: 3,
  maxTurns: 3,
};

const mockAnalysisResult = {
  cultureLayer: {
    technology: ['React', 'TypeScript'],
    methodology: ['Agile'],
    domain: ['Enterprise'],
  },
  confidence: 0.85,
  tasteDraftId: 'draft-123',
};

vi.mock('@originos/core/lib/features/culture/services/CultureSessionService', () => ({
  getSessionService: vi.fn(() => ({
    getSession: vi.fn().mockResolvedValue(mockSession),
    isReadyForAnalysis: vi.fn().mockReturnValue(true),
    markAsAnalyzing: vi.fn().mockResolvedValue(undefined),
    storeAnalysisResult: vi.fn().mockResolvedValue('draft-123'),
  })),
}));

vi.mock('@originos/core/lib/features/culture/services/CultureDetectionService', () => ({
  getDetectionService: vi.fn(() => ({
    analyzeDialogue: vi.fn().mockResolvedValue(mockAnalysisResult),
  })),
}));

describe('POST /api/taste/user/detection/:sessionId/analyze', () => {
  describe('TC-API-008: 正常触发分析', () => {
    it('should trigger analysis successfully', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('test-session-123');
      expect(data.analysisId).toBeDefined();
      expect(data.status).toBe('completed');
      expect(data.cultureLayer).toBeDefined();
      expect(data.confidence).toBe(0.85);
      expect(data.tasteDraftId).toBe('draft-123');
    });

    it('should return cultureLayer with correct structure', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cultureLayer.technology).toBeDefined();
      expect(Array.isArray(data.cultureLayer.technology)).toBe(true);
    });

    it('should return success message', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Analysis completed successfully');
    });
  });

  describe('TC-API-009: 会话未准备好分析', () => {
    it('should return 400 when session has insufficient dialogue turns', async () => {
      // Override mock for this test
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockResolvedValue({ ...mockSession, currentTurn: 1, maxTurns: 3 }),
        isReadyForAnalysis: vi.fn().mockReturnValue(false),
        markAsAnalyzing: vi.fn(),
        storeAnalysisResult: vi.fn(),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('not ready for analysis');
      expect(data.code).toBe('SESSION_NOT_READY');
    });
  });

  describe('TC-API-010: 分析已在进行中', () => {
    it('should return 409 when session status is analyzing', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockResolvedValue({ ...mockSession, status: 'analyzing' }),
        isReadyForAnalysis: vi.fn().mockReturnValue(true),
        markAsAnalyzing: vi.fn(),
        storeAnalysisResult: vi.fn(),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('Analysis already in progress');
      expect(data.code).toBe('ANALYSIS_IN_PROGRESS');
    });
  });

  describe('TC-API-011: 强制重新分析', () => {
    it('should allow force reanalyze when session is completed', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockResolvedValue({ ...mockSession, status: 'completed' }),
        isReadyForAnalysis: vi.fn().mockReturnValue(true),
        markAsAnalyzing: vi.fn(),
        storeAnalysisResult: vi.fn().mockResolvedValue('draft-456'),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: { forceReanalyze: true }
        }),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('completed');
    });

    it('should return 409 when session is completed without forceReanalyze', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockResolvedValue({ ...mockSession, status: 'completed' }),
        isReadyForAnalysis: vi.fn().mockReturnValue(true),
        markAsAnalyzing: vi.fn(),
        storeAnalysisResult: vi.fn(),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: { forceReanalyze: false }
        }),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('Session already analyzed');
      expect(data.code).toBe('SESSION_ALREADY_COMPLETED');
    });
  });

  describe('TC-API-012: 会话不存在', () => {
    it('should return 404 when session not found', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockResolvedValue(null),
        isReadyForAnalysis: vi.fn(),
        markAsAnalyzing: vi.fn(),
        storeAnalysisResult: vi.fn(),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/nonexistent-session/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'nonexistent-session' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Session not found');
      expect(data.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('TC-API-013: 错误处理', () => {
    it('should handle service errors gracefully', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        isReadyForAnalysis: vi.fn(),
        markAsAnalyzing: vi.fn(),
        storeAnalysisResult: vi.fn(),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
      expect(data.code).toBe('INTERNAL_ERROR');
    });

    it('should handle invalid JSON body', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });

      // Should handle gracefully (empty body defaults to no options)
      expect(response.status).toBe(200);
    });
  });

  describe('TC-API-014: 选项参数', () => {
    it('should accept generateDraft option', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: { generateDraft: true }
        }),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      expect(response.status).toBe(200);
    });

    it('should accept empty options object', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: {} }),
      });

      const response = await POST(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      expect(response.status).toBe(200);
    });
  });
});
