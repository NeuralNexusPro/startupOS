/**
 * Agent Session Storage Service
 *
 * Handles persistence of agent sessions using local file system (JSON)
 */

import { v4 as uuidv4 } from 'uuid';

import { jsonStore } from '../../storage/json-store';
import { readUserConfigWithProductDefaults, userLLMConfigToRuntimeLLMConfig } from '../user-config';

import type {
  AgentSession,
  SessionListItem,
  CreateSessionRequest,
  UpdateSessionRequest,
  SessionSummary,
  SessionStatistics,
  AgentMessage,
} from '../../../types/agent';
import type { AgentTaskRuntimePersistenceV1 } from '../../integrations/pi-agent/task-runtime';

/**
 * Session directory for storage (global fallback)
 */
const SESSIONS_DIR = 'sessions';
const SESSION_TITLE_LENGTH = 32;
const INTERNAL_ROLE_INTRO_PREFIX = '你好！请根据你的人设';
const GENERIC_MESSAGE = /^(?:你好|您好|hi|hello|在吗|继续|开始|好的?|可以|收到|谢谢|ok|嗯+)[!！,.，。?？~～\s]*$/i;
const GENERIC_ACTION = /^(?:打开|打开了么|开始授权|创建(?:一个|一条)?(?:文件夹|文件|文档|待办|任务)|更新.+情况|优先级\s*\d+)$/i;

/**
 * 会话元数据索引（sidecar）。listSessions 高频且只依赖这些字段，
 * 全量读每个会话文件（含全部 messages）在历史变大后会造成主进程同步 JSON.parse 卡顿
 * （Windows 上叠加 Defender 每文件扫描可直接触发未响应）。
 * saveSession 是会话文件的唯一写入口，写会话时顺手维护索引；
 * 索引与文件 mtime/size 失配时回退全量扫描并重建。
 */
interface SessionIndexEntry {
  sessionId: string;
  projectId: string;
  projectName: string;
  status: AgentSession['status'];
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  summary?: string;
  agentType?: string;
  fileMtimeMs: number;
  fileSize: number;
}

interface SessionIndexFile {
  version: '1';
  updatedAt: string;
  entries: SessionIndexEntry[];
}

export interface AgentTaskRuntimeSessionRecord {
  readonly sessionId: string;
  readonly projectId: string;
  readonly updatedAt: number;
  readonly taskRuntime: AgentTaskRuntimePersistenceV1;
}

function userMessageText(message: AgentMessage): string {
  let content = message.content.trim();
  if (content.startsWith('{')) {
    try {
      const value: unknown = JSON.parse(content);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const text = (value as Record<string, unknown>)['text'];
        if (typeof text === 'string') {
          content = text;
        }
      }
    } catch { /* Plain user text that happens to start with `{`. */ }
  }
  if (content.startsWith('Perception event:')) {
    const bodyStart = content.indexOf('\n\n');
    if (bodyStart >= 0) {
      content = content.slice(bodyStart + 2);
    }
  }
  return content.replace(/\s+/g, ' ').trim()
    .replace(/^@\S+\s+/, '')
    .replace(/^(?:请|麻烦)?(?:再|直接|先|在)?(?:帮我|为我|给我)\s*/, '');
}

function sessionTitle(messages: readonly AgentMessage[]): string | undefined {
  const candidates = messages
    .filter((message) => message.role === 'user')
    .map(userMessageText)
    .filter((content) => content && !content.startsWith(INTERNAL_ROLE_INTRO_PREFIX) && !GENERIC_MESSAGE.test(content));
  const normalized = candidates.reduce((best, content) => {
    if (!best) {
      return content;
    }
    const score = content.length - (GENERIC_ACTION.test(content) ? 1000 : 0);
    const bestScore = best.length - (GENERIC_ACTION.test(best) ? 1000 : 0);
    return score > bestScore ? content : best;
  }, '');
  const characters = Array.from(normalized);
  if (!characters.length) {
    return undefined;
  }
  return characters.length > SESSION_TITLE_LENGTH
    ? `${characters.slice(0, SESSION_TITLE_LENGTH).join('')}…`
    : normalized;
}

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
    const sessionPath = this.getSessionPath(session.sessionId, projectId);

    // Note: jsonStore.write() wraps data in DataFile structure automatically
    // We only pass the session object directly
    await this.store.write(sessionPath, session);
    await this.upsertIndexEntry(session, sessionPath);
  }

  /**
   * Get session by ID
   *
   * skipLlmConfigBackfill：列表类场景（逐个扫描会话文件）关闭 llmConfig 兜底，
   * 避免 N 次同步 user-config.json 读（Defender 下每文件打开额外 +10~50ms）。
   * 读取方拿到 session 后自行单次回填即可。
   */
  async getSession(
    sessionId: string,
    projectId?: string,
    options?: { skipLlmConfigBackfill?: boolean },
  ): Promise<AgentSession | null> {
    const sessionPath = this.getSessionPath(sessionId, projectId);

    const sessionData = await this.store.read<AgentSession>(sessionPath);
    const session = sessionData?.data ?? null;
    if (!session || session.llmConfig || options?.skipLlmConfigBackfill) return session;
    const llmConfig = userLLMConfigToRuntimeLLMConfig(readUserConfigWithProductDefaults().llm);
    return llmConfig ? { ...session, llmConfig } : session;
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
      if (!session.summary) {
        session.summary = sessionTitle(updates.messages);
      }
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
    if (!session.summary && newMessage.role === 'user') {
      session.summary = sessionTitle(session.messages);
    }
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
   *
   * 优先读取元数据索引 sidecar（一次小文件读代替 N 次全量会话文件读），
   * 索引缺失/损坏/与文件 mtime+size 失配时回退全量扫描并重建索引。
   */
  async listSessions(projectId?: string): Promise<SessionListItem[]> {
    // Determine which directory to scan
    const sessionsDir = projectId
      ? `${getProjectSessionsDir(projectId)}/`
      : `${SESSIONS_DIR}/`;

    // Get all session files from the sessions directory
    const files = await this.store.listFiles(sessionsDir);
    const validSessionIds = files
      .map((file) => file.replace('.json', ''))
      .filter(isValidSessionId);

    const indexed = await this.tryReadIndex(sessionsDir, validSessionIds, projectId ?? null);
    if (indexed) {
      return indexed;
    }

    // Fallback: full scan (reads every session file) then rebuild the index
    const sessions: SessionListItem[] = [];
    // user-config 全程只读一次：循环内逐会话回填是同步 readFileSync，
    // 会话数大时在 Windows（Defender 实时扫描）下会长时间阻塞主进程
    let fallbackLlmConfig: AgentSession['llmConfig'] | undefined;

    for (const sessionId of validSessionIds) {
      const session = await this.getSession(sessionId, projectId, { skipLlmConfigBackfill: true });

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

        if (!session.llmConfig) {
          fallbackLlmConfig ??= userLLMConfigToRuntimeLLMConfig(readUserConfigWithProductDefaults().llm) || undefined;
        }
        sessions.push(this.toSessionListItem({
          ...(fallbackLlmConfig ? { ...session, llmConfig: fallbackLlmConfig } : session),
        }));
      }
    }

    const sorted = sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    await this.rebuildIndex(sessionsDir, validSessionIds, sessions, projectId ?? null);
    return sorted;
  }

  async listTaskRuntimeSessions(
    projectId: string,
  ): Promise<readonly AgentTaskRuntimeSessionRecord[]> {
    const files = await this.store.listFiles(`${getProjectSessionsDir(projectId)}/`);
    const records: AgentTaskRuntimeSessionRecord[] = [];
    for (const file of files) {
      const sessionId = file.replace('.json', '');
      if (!isValidSessionId(sessionId)) continue;
      const session = await this.getSession(sessionId, projectId, { skipLlmConfigBackfill: true });
      if (
        session?.projectContext?.projectId !== projectId
        || !session.taskRuntime
      ) continue;
      records.push({
        sessionId,
        projectId,
        updatedAt: session.updatedAt,
        taskRuntime: session.taskRuntime,
      });
    }
    return records.sort((left, right) => right.updatedAt - left.updatedAt);
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
      summary: sessionTitle(session.messages ?? []) || session.summary,
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

  // ── Session metadata index (sidecar) ──────────────────────────

  /**
   * 索引文件路径：`{sessionsDir}/.sessions-index.json`。
   * 文件名不以合法 session id 形态出现在 listFiles 过滤后的集合里
   * （listFiles 只保留 .json 后缀，这里以 `.` 开头 + 非 UUID 格式，isValidSessionId 会拒绝），
   * 不会与真实会话文件混淆。
   */
  private getIndexPath(sessionsDir: string): string {
    return `${sessionsDir}.sessions-index.json`;
  }

  /**
   * 尝试用索引直接返回列表。索引有效的前提：
   * 1. 索引存在且可解析；
   * 2. 条目集合与目录中的合法会话文件完全一致；
   * 3. 每个条目的 fileMtimeMs/fileSize 与会话文件当前 stat 一致。
   * 任一不满足返回 null，由调用方回退全量扫描。
   */
  private async tryReadIndex(
    sessionsDir: string,
    sessionIds: string[],
    projectId: string | null,
  ): Promise<SessionListItem[] | null> {
    try {
      const indexData = await this.store.read<SessionIndexFile>(this.getIndexPath(sessionsDir));
      if (!indexData?.data || indexData.data.version !== '1' || !Array.isArray(indexData.data.entries)) {
        return null;
      }

      const entries = new Map(indexData.data.entries.map((entry) => [entry.sessionId, entry]));
      if (entries.size !== sessionIds.length) {
        return null;
      }

      const items: SessionListItem[] = [];
      for (const sessionId of sessionIds) {
        const entry = entries.get(sessionId);
        if (!entry) {
          return null;
        }
        const stat = await this.store.stat(`${sessionsDir}${sessionId}.json`);
        if (!stat || stat.mtimeMs !== entry.fileMtimeMs || stat.size !== entry.fileSize) {
          return null;
        }
        if (projectId && entry.projectId !== projectId) {
          continue;
        }
        items.push(this.indexEntryToListItem(entry));
      }
      return items.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      // 索引读取/校验失败一律回退全量扫描，不影响功能正确性
      return null;
    }
  }

  /**
   * 全量扫描后重建索引。写索引失败静默忽略（下次继续走回退路径）。
   */
  private async rebuildIndex(
    sessionsDir: string,
    sessionIds: string[],
    items: SessionListItem[],
    projectId: string | null,
  ): Promise<void> {
    try {
      const entries: SessionIndexEntry[] = [];
      for (const item of items) {
        const stat = await this.store.stat(`${sessionsDir}${item.sessionId}.json`);
        if (!stat) continue;
        entries.push({
          ...item,
          status: item.status as SessionIndexEntry['status'],
          fileMtimeMs: stat.mtimeMs,
          fileSize: stat.size,
        });
      }
      // 扫描中被过滤掉的会话（如 projectContext 缺失）也要记录 stat，
      // 否则它们的文件存在会让条目数校验永久失配，索引永远无法生效。
      const itemIds = new Set(items.map((item) => item.sessionId));
      for (const sessionId of sessionIds) {
        if (itemIds.has(sessionId)) continue;
        const stat = await this.store.stat(`${sessionsDir}${sessionId}.json`);
        if (!stat) continue;
        const session = await this.getSession(sessionId, projectId ?? undefined);
        const item = session ? this.toSessionListItem(session) : {
          sessionId,
          projectId: projectId ?? 'unknown',
          projectName: 'Unknown',
          status: 'active' as const,
          createdAt: stat.mtimeMs,
          updatedAt: stat.mtimeMs,
          messageCount: 0,
        };
        entries.push({
          ...item,
          status: item.status as SessionIndexEntry['status'],
          fileMtimeMs: stat.mtimeMs,
          fileSize: stat.size,
        });
      }
      await this.store.write(this.getIndexPath(sessionsDir), {
        version: '1' as const,
        updatedAt: new Date().toISOString(),
        entries,
      });
    } catch (error) {
      console.warn('[AgentSessionService] Failed to rebuild session index:', error);
    }
  }

  /**
   * saveSession 是会话文件唯一写入口：写文件后同步维护索引条目，
   * 保证下次 listSessions 命中索引。
   */
  private async upsertIndexEntry(session: AgentSession, sessionPath: string): Promise<void> {
    try {
      const sessionsDir = sessionPath.slice(0, sessionPath.lastIndexOf('/') + 1);
      const stat = await this.store.stat(sessionPath);
      if (!stat) return;

      const indexPath = this.getIndexPath(sessionsDir);
      const indexData = await this.store.read<SessionIndexFile>(indexPath);
      const entries = (indexData?.data?.version === '1' && Array.isArray(indexData.data.entries))
        ? indexData.data.entries
        : [];
      const item = this.toSessionListItem(session);
      const next = entries.filter((entry) => entry.sessionId !== session.sessionId);
      next.push({
        ...item,
        status: item.status as SessionIndexEntry['status'],
        fileMtimeMs: stat.mtimeMs,
        fileSize: stat.size,
      });
      await this.store.write(indexPath, {
        version: '1' as const,
        updatedAt: new Date().toISOString(),
        entries: next,
      });
    } catch (error) {
      // 索引维护失败不影响会话写入本身；下次 listSessions 会回退全量扫描重建
      console.warn('[AgentSessionService] Failed to update session index entry:', error);
    }
  }

  private indexEntryToListItem(entry: SessionIndexEntry): SessionListItem {
    return {
      sessionId: entry.sessionId,
      projectId: entry.projectId,
      projectName: entry.projectName,
      status: entry.status,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      messageCount: entry.messageCount,
      summary: entry.summary,
      agentType: entry.agentType,
    };
  }
}

/**
 * Export singleton instance
 */
export const agentSessionService = new AgentSessionService();
