/**
 * API Tests: GET /api/taste/user/detection/:sessionId/taste-draft
 * Story C.1: User TASTE Generation
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

// Mock the session and detection services
const mockSession = {
  sessionId: 'test-session-123',
  userId: 'test-user-001',
  projectId: 'project-001',
  status: 'completed',
  currentTurn: 3,
  maxTurns: 3,
};

const mockTasteDraft = {
  tasteProfile: {
    technology: ['React', 'TypeScript', 'Node.js'],
    methodology: ['Agile', 'TDD'],
    domain: ['Enterprise Applications', 'Web Development'],
    preferences: {
      codeStyle: 'functional',
      documentationLevel: 'comprehensive',
    },
  },
  confidence: 0.92,
  analysisCompletedAt: new Date().toISOString(),
};

vi.mock('@originos/core/lib/features/culture/services/CultureSessionService', () => ({
  getSessionService: vi.fn(() => ({
    getSession: vi.fn().mockResolvedValue(mockSession),
  })),
}));

vi.mock('@originos/core/lib/features/culture/services/CultureDetectionService', () => ({
  getDetectionService: vi.fn(() => ({
    getTasteDraft: vi.fn().mockResolvedValue(mockTasteDraft),
  })),
}));

describe('GET /api/taste/user/detection/:sessionId/taste-draft', () => {
  describe('TC-API-012: 正常获取 TASTE 草稿', () => {
    it('should return taste draft successfully', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.sessionId).toBe('test-session-123');
      expect(data.userId).toBe('test-user-001');
      expect(data.projectId).toBe('project-001');
      expect(data.draft).toBeDefined();
      expect(data.confidence).toBe(0.92);
    });

    it('should return complete taste profile structure', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.draft.technology).toBeDefined();
      expect(Array.isArray(data.draft.technology)).toBe(true);
      expect(data.draft.methodology).toBeDefined();
      expect(data.draft.domain).toBeDefined();
      expect(data.draft.preferences).toBeDefined();
    });

    it('should return isComplete flag as true', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isComplete).toBe(true);
    });

    it('should return generatedAt timestamp', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.generatedAt).toBeDefined();
      expect(new Date(data.generatedAt).toISOString()).toBe(data.generatedAt);
    });

    it('should return confidence score', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.confidence).toBeGreaterThanOrEqual(0);
      expect(data.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('TC-API-013: 分析未完成', () => {
    it('should return 425 when analysis is not completed', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockResolvedValue({ ...mockSession, status: 'analyzing' }),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(425); // Too Early
      expect(data.error).toBe('Analysis not yet completed');
      expect(data.code).toBe('ANALYSIS_NOT_COMPLETE');
    });

    it('should return 425 when session is active', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockResolvedValue({ ...mockSession, status: 'active' }),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(425);
      expect(data.code).toBe('ANALYSIS_NOT_COMPLETE');
    });
  });

  describe('TC-API-014: 会话不存在', () => {
    it('should return 404 when session not found', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockResolvedValue(null),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/nonexistent-session/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'nonexistent-session' }) });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Session not found');
      expect(data.code).toBe('SESSION_NOT_FOUND');
    });
  });

  describe('TC-API-015: 错误处理', () => {
    it('should handle service errors gracefully', async () => {
      const { getSessionService } = await import('@originos/core/lib/features/culture/services/CultureSessionService');
      const mockGetSessionService = vi.mocked(getSessionService);

      mockGetSessionService.mockReturnValueOnce({
        getSession: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
      expect(data.code).toBe('INTERNAL_ERROR');
    });

    it('should handle detection service errors', async () => {
      const { getDetectionService } = await import('@originos/core/lib/features/culture/services/CultureDetectionService');
      const mockGetDetectionService = vi.mocked(getDetectionService);

      mockGetDetectionService.mockReturnValueOnce({
        getTasteDraft: vi.fn().mockRejectedValue(new Error('Draft not found')),
      } as any);

      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('TC-API-016: 数据结构验证', () => {
    it('should return valid technology array', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.draft.technology).toBeInstanceOf(Array);
      expect(data.draft.technology.length).toBeGreaterThan(0);
    });

    it('should return valid methodology array', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.draft.methodology).toBeInstanceOf(Array);
    });

    it('should return valid domain array', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.draft.domain).toBeInstanceOf(Array);
    });

    it('should return preferences object', async () => {
      const request = new NextRequest('http://localhost/api/taste/user/detection/test-session-123/taste-draft', {
        method: 'GET',
      });

      const response = await GET(request, { params: Promise.resolve({ sessionId: 'test-session-123' }) });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.draft.preferences).toBeDefined();
      expect(typeof data.draft.preferences).toBe('object');
    });
  });
});
