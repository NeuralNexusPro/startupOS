/**
 * Agent Session Storage Service
 *
 * Handles persistence of agent sessions using local file system (JSON)
 */

import { v4 as uuidv4 } from 'uuid';
import { jsonStore } from '../../storage/json-store';
import type {
  AgentSession,
  SessionListItem,
  CreateSessionRequest,
  UpdateSessionRequest,
  SessionSummary,
  SessionStatistics,
  AgentMessage,
} from '../../../types/agent';

/**
 * Session directory for storage (global fallback)
 */
const SESSIONS_DIR = 'sessions';

/**
 * Get project-specific session directory
 */
function getProjectSessionsDir(projectId: string): string {
  return `projects/${projectId}/sessions`;
}

/**
 * Check if a session ID is valid (UUID or custom format)
 * UUID: 550e8400-e29b-41d4-a716-446655440000
 * Custom: session-{prefix}-{timestamp} or any alphanumeric with dashes
 */
function isValidSessionId(sessionId: string): boolean {
  // UUID pattern
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Custom session ID pattern: allows session-{prefix}-{timestamp} or similar
  const customPattern = /^[a-zA-Z0-9_-]+$/;

  return uuidPattern.test(sessionId) || (sessionId.length > 0 && customPattern.test(sessionId));
}

/**
 * Agent Session Service
 */
export class AgentSessionService {
  private store = jsonStore;

  /**
   * Create a new session
   */
  async createSession(request: CreateSessionRequest): Promise<AgentSession> {
    // Use provided sessionId or generate a new UUID
    const sessionId = request.sessionId || uuidv4();
    const now = Date.now();

    const session: AgentSession = {
      sessionId,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      messages: [],
      projectContext: {
        projectId: request.projectId,
        projectName: request.projectName,
        ...request.projectContext,
      },
      systemPrompt: request.systemPrompt || '',
      agentType: request.agentType || 'generic',
      config: {
        sessionId,
        systemPrompt: request.systemPrompt,
        agentType: request.agentType,
      },
      ...(request.llmConfig ? { llmConfig: request.llmConfig } : {}),
    };

    await this.saveSession(session);

    return session;
  }

  /**
   * Save session (create or update)
   */
  async saveSession(session: AgentSession): Promise<void> {
    session.updatedAt = Date.now();

    // Use project-specific path if projectId is available
    const projectId = session.projectContext?.projectId;

    // Note: jsonStore.write() wraps data in DataFile structure automatically
    // We only pass the session object directly
    await this.store.write(
      this.getSessionPath(session.sessionId, projectId),
      session as any,
    );
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string, projectId?: string): Promise<AgentSession | null> {
    const sessionPath = this.getSessionPath(sessionId, projectId);
    console.error(`[DEBUG] getSession: sessionId=${sessionId}, projectId=${projectId}, path=${sessionPath}`);

    const sessionData = await this.store.read<AgentSession>(sessionPath);
    console.error(`[DEBUG] getSession: sessionData=${sessionData ? 'found' : 'null'}`);

    return sessionData?.data ?? null;
  }

  /**
   * Update session partially
   */
  async updateSession(
    sessionId: string,
    updates: UpdateSessionRequest,
    projectId?: string,
  ): Promise<AgentSession | null> {
    const session = await this.getSession(sessionId, projectId);
    if (!session) {
      return null;
    }

    // Apply updates
    if (updates.messages) {
      session.messages = updates.messages;
    }
    if (updates.status) {
      session.status = updates.status;
    }
    if (updates.projectContext) {
      session.projectContext = {
        ...session.projectContext,
        ...updates.projectContext,
      };
    }
    if (updates.summary !== undefined) {
      session.summary = updates.summary;
    }
    if (updates.llmConfig !== undefined) {
      session.llmConfig = updates.llmConfig;
    }
    if (updates.taskRuntime !== undefined) {
      session.taskRuntime = updates.taskRuntime;
    }

    await this.saveSession(session);

    return session;
  }

  /**
   * Add message to session
   */
  async addMessage(
    sessionId: string,
    message: Omit<AgentMessage, 'id' | 'timestamp'>,
    projectId?: string,
  ): Promise<AgentSession | null> {
    const session = await this.getSession(sessionId, projectId);
    if (!session) {
      return null;
    }

    const newMessage: AgentMessage = {
      ...message,
      id: uuidv4(),
      timestamp: Date.now(),
    };

    session.messages.push(newMessage);
    session.updatedAt = Date.now();

    await this.saveSession(session);

    return session;
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string, projectId?: string): Promise<boolean> {
    return this.store.delete(this.getSessionPath(sessionId, projectId));
  }

  /**
   * List all sessions
   */
  async listSessions(projectId?: string): Promise<SessionListItem[]> {
    // Determine which directory to scan
    const sessionsDir = projectId
      ? `${getProjectSessionsDir(projectId)}/`
      : `${SESSIONS_DIR}/`;

    // Get all session files from the sessions directory
    const files = await this.store.listFiles(sessionsDir);

    const sessions: SessionListItem[] = [];

    for (const file of files) {
      const sessionId = file.replace('.json', '');

      // Skip files that don't match valid session ID patterns
      if (!isValidSessionId(sessionId)) {
        continue;
      }

      const session = await this.getSession(sessionId, projectId);

      if (session) {
        // Skip sessions with missing projectContext (defensive)
        if (!session.projectContext) {
          console.warn(`[AgentSessionService] Session ${sessionId} missing projectContext, skipping`);
          continue;
        }

        // Filter by projectId if provided
        if (projectId && session.projectContext.projectId !== projectId) {
          continue;
        }

        sessions.push(this.toSessionListItem(session));
      }
    }

    // Sort by updatedAt descending (most recent first)
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get session summary
   */
  async getSessionSummary(sessionId: string, projectId?: string): Promise<SessionSummary | null> {
    const session = await this.getSession(sessionId, projectId);
    if (!session) {
      return null;
    }

    return this.generateSummary(session);
  }

  /**
   * Get project statistics
   */
  async getProjectStatistics(projectId: string): Promise<SessionStatistics> {
    const sessions = await this.listSessions(projectId);

    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(s => s.status === 'active').length;
    const completedSessions = sessions.filter(
      s => s.status === 'completed',
    ).length;
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);
    const averageMessagesPerSession =
      totalSessions > 0 ? totalMessages / totalSessions : 0;

    return {
      totalSessions,
      activeSessions,
      completedSessions,
      totalMessages,
      averageMessagesPerSession: Math.round(averageMessagesPerSession),
    };
  }

  /**
   * Auto-generate summary from session messages
   */
  async autoGenerateSummary(sessionId: string, projectId?: string): Promise<string> {
    const session = await this.getSession(sessionId, projectId);
    if (!session || session.messages.length === 0) {
      return 'Empty session';
    }

    const summary = this.generateSummary(session);

    // Create a summary text
    const userMessages = session.messages.filter((m: AgentMessage) => m.role === 'user');
    const firstUserMessage =
      userMessages[0]?.content?.substring(0, 50) || 'No content';
    const topic =
      userMessages.length > 0
        ? firstUserMessage
        : 'System initialization';

    return `${topic}... (${summary.totalMessages} messages)`;
  }

  /**
   * Convert session to list item
   */
  private toSessionListItem(session: AgentSession): SessionListItem {
    // Defensive: ensure projectContext exists
    const projectContext = session.projectContext ?? {
      projectId: 'unknown',
      projectName: 'Unknown Project',
    };

    return {
      sessionId: session.sessionId,
      projectId: projectContext.projectId,
      projectName: projectContext.projectName,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages?.length ?? 0,
      summary: session.summary,
      agentType: session.agentType,
    };
  }

  /**
   * Generate summary from session
   */
  private generateSummary(session: AgentSession): SessionSummary {
    const totalMessages = session.messages.length;
    const userMessages = session.messages.filter((m: AgentMessage) => m.role === 'user').length;
    const assistantMessages = session.messages.filter(
      (m: AgentMessage) => m.role === 'assistant',
    ).length;
    const toolCalls = session.messages.reduce(
      (sum: number, m: AgentMessage) => sum + (m.toolResults?.length ?? 0),
      0,
    );
    const firstMessage = session.messages[0]?.content?.substring(0, 100);
    const lastMessage = session.messages[session.messages.length - 1]?.content?.substring(
      0,
      100,
    );

    return {
      totalMessages,
      userMessages,
      assistantMessages,
      toolCalls,
      firstMessage,
      lastMessage,
    };
  }

  /**
   * Get session file path
   * If projectId is available in session, use project-specific path
   */
  private getSessionPath(sessionId: string, projectId?: string): string {
    if (projectId) {
      return `${getProjectSessionsDir(projectId)}/${sessionId}.json`;
    }
    return `${SESSIONS_DIR}/${sessionId}.json`;
  }
}

/**
 * Export singleton instance
 */
export const agentSessionService = new AgentSessionService();
