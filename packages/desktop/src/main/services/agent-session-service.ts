import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../ipc-protocol';
import type { IpcResponse } from '../../../../core/src/lib/integrations/electron/ipc-protocol';
import { agentSessionService } from '../../../../core/src/lib/features/agent';
import { persistRuntimeLLMConfig } from '../../../../core/src/lib/features/user-config';
import { agentManager } from '../../../../core/src/lib/integrations/pi-agent/agent-manager';
import { extractDisplayContent } from '../../../../core/src/lib/integrations/pi-agent/display-content';
import { getVisibleStreamDelta, reconcileFinalStreamContent } from '../../../../core/src/lib/integrations/pi-agent/stream-dedupe';
import type { RuntimeLLMConfig } from '../../../../core/src/lib/integrations/pi-agent/llm-config';
import { MemoryConsolidator } from '../../../../core/src/modules/memory-core/core/consolidator';
import { getDataRoot, getClaudeDir } from '../../../../core/src/lib/paths';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { StreamEventBatcher } from './stream-event-batcher';
import { applyAssistantMessageEnd } from './assistant-stream-state';
import { processHealthMonitor } from './process-health-monitor';
import {
  AgentTaskRuntimeIpcController,
  routeAgentSessionUserMessage,
} from './agent-task-runtime-ipc';
import {
  assertSessionMessageOwnership,
  restoreSessionAtBoundary,
  toRestoreAgentSessionError,
  type RestoreAgentEntryType,
  type RestoreAgentSessionRequest,
} from '../../../../core/src/lib/integrations/pi-agent/session-restore';

function extractTextContent(content: unknown): string {
  return extractDisplayContent(content, { allowThinkingFallback: true });
}

function formatVisibleAgentError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const compact = raw.replace(/\s+/g, ' ').trim();
  const jsonStart = compact.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const payload = JSON.parse(compact.slice(jsonStart)) as {
        error?: { code?: string; message?: string; type?: string };
        request_id?: string;
      };
      const providerError = payload.error;
      const parts = [
        providerError?.code,
        providerError?.type,
        providerError?.message,
        payload.request_id ? `request_id=${payload.request_id}` : undefined,
      ].filter((part): part is string => Boolean(part));
      if (parts.length > 0) {
        return `LLM 请求失败：${parts.join(' · ')}`;
      }
    } catch {
      // Fall through to compact text.
    }
  }
  return `LLM 请求失败：${compact || 'Unknown error'}`;
}

const ENTRY_TYPE_DIRS: Record<string, string> = {
  project: 'projects',
  solution: 'projects',
  agent: 'agents',
  'role-agent': 'agents',
  skill: 'skills',
};

export class AgentSessionService {
  private readonly taskRuntimeIpc = new AgentTaskRuntimeIpcController();

  constructor() {
    this.registerHandlers();
    this.taskRuntimeIpc.registerHandlers();
  }

  private registerHandlers(): void {
    // ── Session List ──────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_LIST,
      async (_event, request?: { projectId?: string }): Promise<IpcResponse<unknown>> => {
        console.log('[IPC] AGENT_SESSION_LIST', request);
        try {
          const sessions = await agentSessionService.listSessions(request?.projectId);
          return {
            success: true,
            data: { sessions, count: sessions.length },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] List sessions failed');
        }
      }
    );

    // ── Session Create ────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_CREATE,
      async (event, request: {
        projectId: string;
        projectName: string;
        systemPrompt?: string;
        agentType?: string;
        projectContext?: Record<string, unknown>;
        sessionId?: string;
        llmConfig?: RuntimeLLMConfig;
        agentBaseDir?: string;
        outputDir?: string;
      }): Promise<IpcResponse<unknown>> => {
        console.log('[IPC] AGENT_SESSION_CREATE', {
          projectId: request.projectId,
          projectName: request.projectName,
          agentType: request.agentType,
          agentBaseDir: request.agentBaseDir,
          outputDir: request.outputDir,
          sessionId: request.sessionId,
        });
        try {
          if (!request.projectId || !request.projectName) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'projectId and projectName are required' },
              timestamp: new Date().toISOString(),
            };
          }

          persistRuntimeLLMConfig(request.llmConfig);

          // If sessionId provided, check for existing session
          if (request.sessionId) {
            const existing = await agentSessionService.getSession(request.sessionId, request.projectId);
            if (existing) {
              const session = await agentSessionService.updateSession(
                request.sessionId,
                {
                  ...(request.llmConfig ? { llmConfig: request.llmConfig } : {}),
                  ...(request.agentType ? { agentType: request.agentType } : {}),
                  projectContext: {
                    ...request.projectContext,
                    ...(request.agentBaseDir ? { currentPath: request.agentBaseDir } : {}),
                    ...(request.outputDir ? { outputDir: request.outputDir } : {}),
                  },
                },
                request.projectId,
              ) ?? existing;
              this.taskRuntimeIpc.rememberSession(session, event.sender);
              return {
                success: true,
                data: session,
                timestamp: new Date().toISOString(),
              };
            }
          }

          // Ensure agentBaseDir exists
          if (request.agentBaseDir) {
            const fs = await import('fs');
            fs.mkdirSync(request.agentBaseDir, { recursive: true });
          }

          const createRequest = {
            projectId: request.projectId,
            projectName: request.projectName,
            systemPrompt: request.systemPrompt,
            agentType: request.agentType,
            projectContext: {
              ...request.projectContext,
              ...(request.agentBaseDir ? { currentPath: request.agentBaseDir } : {}),
              ...(request.outputDir ? { outputDir: request.outputDir } : {}),
            },
            sessionId: request.sessionId,
            llmConfig: request.llmConfig,
          };

          const session = await agentSessionService.createSession(createRequest);
          this.taskRuntimeIpc.rememberSession(session, event.sender);
          return {
            success: true,
            data: session,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Create session failed');
        }
      }
    );

    // ── Session Get ───────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_GET,
      async (event, request: RestoreAgentSessionRequest): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId || !request.projectId || !request.entryType || !request.entryId) {
            return {
              success: false,
              error: {
                code: 'RESTORE_FAILED',
                message: 'sessionId, projectId, entryType, and entryId are required',
              },
              timestamp: new Date().toISOString(),
            };
          }
          const session = await restoreSessionAtBoundary(request, {
            getSession: (sessionId, projectId) =>
              agentSessionService.getSession(sessionId, projectId),
            hydrateRuntime: async (storedSession) => {
              await agentManager.restoreAgentRuntime(storedSession);
            },
          });
          await this.taskRuntimeIpc.restoreForSession(session, event.sender);
          return {
            success: true,
            data: session,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toRestoreErrorResponse(error, '[AgentSessionService] Get session failed');
        }
      }
    );

    // ── Session Update ────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_UPDATE,
      async (_event, request: { sessionId: string; updates: Record<string, unknown>; projectId?: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const session = await agentSessionService.updateSession(request.sessionId, request.updates, request.projectId);
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: session,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Update session failed');
        }
      }
    );

    // ── Session Delete ────────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_DELETE,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const deleted = await agentSessionService.deleteSession(request.sessionId);
          if (!deleted) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: { deleted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Delete session failed');
        }
      }
    );

    // ── Session Destroy (runtime agent cleanup) ───────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_DESTROY,
      async (_event, request: { sessionId?: string; projectId?: string }): Promise<IpcResponse<unknown>> => {
        try {
          // In-process mode: try direct removal by sessionId
          let removed = request.sessionId ? await agentManager.finalizeAndRemoveAgent(request.sessionId) : false;

          // Fallback: resolve projectId from session and try removing by projectId
          if (!removed && request.sessionId) {
            const session = await agentSessionService.getSession(request.sessionId);
            if (session?.projectContext?.projectId) {
              const actualProjectId = session.projectContext.projectId;
              const stats = agentManager.getStats();
              for (const entry of stats.sessions) {
                const agentEntry = (agentManager as unknown as { agents: Map<string, { projectId?: string }> }).agents.get(entry.sessionId);
                if (agentEntry?.projectId === actualProjectId) {
                  await agentManager.finalizeAndRemoveAgent(entry.sessionId);
                  removed = true;
                  break;
                }
              }
            }
          }

          // Fallback: try by projectId directly
          if (!removed && request.projectId) {
            const stats = agentManager.getStats();
            for (const entry of stats.sessions) {
              const agentEntry = (agentManager as unknown as { agents: Map<string, { projectId?: string }> }).agents.get(entry.sessionId);
              if (agentEntry?.projectId === request.projectId) {
                await agentManager.finalizeAndRemoveAgent(entry.sessionId);
                removed = true;
                break;
              }
            }
          }

          return {
            success: true,
            data: {
              sessionId: request.sessionId ?? request.projectId ?? 'unknown',
              agentDestroyed: removed,
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Destroy session failed');
        }
      }
    );

    // ── Session Statistics ────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_STATISTICS,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const session = await agentSessionService.getSession(request.sessionId);
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          const statistics = await agentSessionService.getProjectStatistics(session.projectContext.projectId);
          return {
            success: true,
            data: statistics,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Get statistics failed');
        }
      }
    );

    // ── Session Summary ───────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_SUMMARY,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          const summary = await agentSessionService.getSessionSummary(request.sessionId);
          if (!summary) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }
          return {
            success: true,
            data: summary,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Get summary failed');
        }
      }
    );

    // ── Session Message (non-streaming) ──────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_MESSAGE,
      async (event, request: {
        sessionId: string;
        content: string;
        role?: string;
        projectId?: string;
        entryType?: RestoreAgentEntryType;
        entryId?: string;
      }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId || !request.content) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId and content are required' },
              timestamp: new Date().toISOString(),
            };
          }

          const session = await agentSessionService.getSession(request.sessionId, request.projectId);
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }

          this.taskRuntimeIpc.rememberSession(session, event.sender);
          assertSessionMessageOwnership(session, request);
          const agent = await agentManager.getOrRestoreAgentRuntime(session);

          const updatedSession = await agentSessionService.addMessage(request.sessionId, {
            role: (request.role || 'user') as 'user' | 'assistant' | 'system' | 'tool' | 'toolResult',
            content: request.content,
          }, request.projectId);

          if (!updatedSession) {
            return {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Failed to add message' },
              timestamp: new Date().toISOString(),
            };
          }

          const userMessage = updatedSession.messages[updatedSession.messages.length - 1];

          let assistantContent = '';
          let hasError = false;
          let errorMessage = '';

          const unsubscribe = agent.subscribe((event: { type: string; [key: string]: unknown }) => {
            switch (event.type) {
              case 'agent_start':
              case 'turn_start':
                processHealthMonitor.setAgentActivity(request.sessionId, 'model_wait');
                break;
              case 'message_update': {
                processHealthMonitor.setAgentActivity(request.sessionId, 'model_stream');
                const asm = event['assistantMessageEvent'] as { type?: string; delta?: string } | undefined;
                if (asm?.type === 'text_delta' && typeof asm.delta === 'string') {
                  assistantContent = getVisibleStreamDelta(assistantContent, asm.delta).content;
                }
                break;
              }
              case 'tool_execution_start':
                processHealthMonitor.setAgentActivity(
                  request.sessionId,
                  'tool_running',
                  typeof event['toolName'] === 'string' ? event['toolName'] : undefined
                );
                break;
              case 'tool_execution_end':
                processHealthMonitor.setAgentActivity(request.sessionId, 'model_wait');
                break;
              case 'message_end': {
                const msg = event['message'] as {
                  role?: string;
                  content?: unknown;
                  completionFailure?: boolean;
                } | undefined;
                if (msg?.role === 'assistant' && msg.content) {
                  const extracted = extractTextContent(msg.content);
                  if (msg.completionFailure) {
                    hasError = true;
                    errorMessage = extracted || '任务未能自动完成';
                    break;
                  }
                  if (extracted) assistantContent = reconcileFinalStreamContent(assistantContent, extracted);
                }
                break;
              }
              case 'agent_end': {
                processHealthMonitor.setAgentActivity(request.sessionId, 'completion_check');
                const msg = event['message'] as {
                  role?: string;
                  content?: unknown;
                  completionFailure?: boolean;
                } | undefined;
                if (msg?.role === 'assistant' && msg.content && !msg.completionFailure) {
                  const extracted = extractTextContent(msg.content);
                  if (extracted) assistantContent = reconcileFinalStreamContent(assistantContent, extracted);
                }
                const msgs = event['messages'] as {
                  role?: string;
                  content?: unknown;
                  completionFailure?: boolean;
                }[] | undefined;
                if (msgs && Array.isArray(msgs)) {
                  const lastAssistant = [...msgs]
                    .reverse()
                    .find((m) => m?.role === 'assistant' && !m.completionFailure);
                  if (lastAssistant?.content) {
                    const extracted = extractTextContent(lastAssistant.content);
                    if (extracted) assistantContent = reconcileFinalStreamContent(assistantContent, extracted);
                  }
                }
                break;
              }
              case 'completion_accepted': {
                const content = event['content'];
                if (typeof content === 'string' && content) {
                  assistantContent = content;
                }
                break;
              }
              case 'agent_error':
                hasError = true;
                errorMessage = (event['error'] as { message?: string })?.message || 'Unknown error';
                break;
            }
          });

          processHealthMonitor.setAgentActivity(request.sessionId, 'prompt_start');
          try {
            await routeAgentSessionUserMessage({
              controller: this.taskRuntimeIpc,
              session,
              sender: event.sender,
              content: request.content,
              promptChat: async () => {
                this.taskRuntimeIpc.setUserMessagePending(request.sessionId, true);
                try {
                  await agent.prompt(request.content);
                } finally {
                  this.taskRuntimeIpc.setUserMessagePending(request.sessionId, false);
                }
              },
            });
          } catch (promptError) {
            hasError = true;
            errorMessage = promptError instanceof Error ? promptError.message : 'Failed to call LLM';
          } finally {
            processHealthMonitor.clearAgentActivity(request.sessionId);
          }

          unsubscribe();

          if (!assistantContent) {
            try {
              const state = await agent.getSessionState();
              const msgs = state.messages || [];
              const last = [...msgs].reverse().find((message) => {
                const candidate = message as typeof message & { completionFailure?: boolean };
                return candidate.role === 'assistant' && !candidate.completionFailure;
              }) as { content?: unknown } | undefined;
              if (last?.content) {
                assistantContent = extractTextContent(last.content);
              }
            } catch {}
            if (!assistantContent) {
              assistantContent = hasError ? `[LLM Error: ${errorMessage}]` : 'No response generated';
            }
          }

          const savedSession = await agentSessionService.addMessage(request.sessionId, {
            role: 'assistant',
            content: assistantContent,
          }, request.projectId);

          const assistantMessage = savedSession?.messages[savedSession.messages.length - 1];

          return {
            success: true,
            data: {
              userMessage,
              assistantMessage,
              ...(hasError ? { completionFailure: errorMessage } : {}),
            },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          const restoreError = toRestoreAgentSessionError(error);
          if (restoreError.code === 'OWNERSHIP_MISMATCH' || restoreError.code === 'CORRUPT_SESSION') {
            return this.toRestoreErrorResponse(
              restoreError,
              '[AgentSessionService] Message ownership failed',
            );
          }
          return this.toErrorResponse(error, '[AgentSessionService] Send message failed');
        }
      }
    );

    // ── Session Message Stream ──────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_MESSAGE_STREAM,
      async (event, request: {
        sessionId: string;
        content: string;
        role?: string;
        projectId?: string;
        entryType?: RestoreAgentEntryType;
        entryId?: string;
        streamId?: string;
      }): Promise<IpcResponse<unknown>> => {
        console.log('[IPC] AGENT_SESSION_MESSAGE_STREAM', {
          sessionId: request.sessionId,
          content: request.content?.slice(0, 100),
          role: request.role,
          projectId: request.projectId,
        });
        try {
          if (!request.sessionId || !request.content) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId and content are required' },
              timestamp: new Date().toISOString(),
            };
          }

          const session = await agentSessionService.getSession(request.sessionId, request.projectId);
          if (!session) {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Session not found' },
              timestamp: new Date().toISOString(),
            };
          }

          this.taskRuntimeIpc.rememberSession(session, event.sender);
          assertSessionMessageOwnership(session, request);
          const agent = await agentManager.getOrRestoreAgentRuntime(session);

          await agentSessionService.addMessage(request.sessionId, {
            role: (request.role || 'user') as 'user' | 'assistant' | 'system' | 'tool' | 'toolResult',
            content: request.content,
          }, request.projectId);

          const sender = event.sender;
          const sendPayload = (payload: Record<string, unknown>) => {
            if (!sender.isDestroyed()) {
              sender.send(IPC_CHANNELS.AGENT_EVENT, payload);
            }
          };
          const batcher = new StreamEventBatcher({
            onFlush: (events) => sendPayload({
              type: 'batch_events',
              sessionId: request.sessionId,
              streamId: request.streamId,
              events,
            }),
          });

          const sendToRenderer = (eventType: string, data: unknown) => {
            if (eventType === 'text_delta') {
              batcher.push({ type: eventType, data });
              return;
            }
            batcher.flush();
            if (eventType === 'assistant_message' || eventType === 'done') {
              const content = data && typeof data === 'object'
                ? (data as { content?: unknown }).content
                : undefined;
              console.info('[AgentStream] main-send', {
                sessionId: request.sessionId,
                streamId: request.streamId,
                eventType,
                contentLength: typeof content === 'string' ? content.length : 0,
                accumulatedLength: assistantContent.length,
              });
            }
            sendPayload({
              type: eventType,
              sessionId: request.sessionId,
              streamId: request.streamId,
              data,
            });
          };

          let assistantContent = '';
          let assistantMessageSent = false;
          let completionFailed = false;

          const unsubscribe = agent.subscribe((event: { type: string; [key: string]: unknown }) => {
            switch (event.type) {
              case 'agent_start':
              case 'turn_start':
                processHealthMonitor.setAgentActivity(request.sessionId, 'model_wait');
                break;
              // In-process mode: library emits message_update with nested assistantMessageEvent
              case 'message_update': {
                processHealthMonitor.setAgentActivity(request.sessionId, 'model_stream');
                const asm = event['assistantMessageEvent'] as { type?: string; delta?: string } | undefined;
                if (asm?.type === 'text_delta' && typeof asm.delta === 'string') {
                  const merged = getVisibleStreamDelta(assistantContent, asm.delta);
                  assistantContent = merged.content;
                  if (merged.delta) {
                    sendToRenderer('text_delta', { delta: merged.delta });
                  }
                }
                break;
              }
              case 'tool_execution_start':
                processHealthMonitor.setAgentActivity(
                  request.sessionId,
                  'tool_running',
                  typeof event['toolName'] === 'string' ? event['toolName'] : undefined
                );
                sendToRenderer('tool_start', { toolName: event['toolName'] });
                break;
              case 'tool_execution_end':
                processHealthMonitor.setAgentActivity(request.sessionId, 'model_wait');
                sendToRenderer('tool_end', { toolName: event['toolName'] });
                // 检测 write_file 写入解决方案文件，主动通知前端刷新
                if (event['toolName'] === 'write_file') {
                  const result = event['result'] as Record<string, unknown> | undefined;
                  const details = result?.['details'] as Record<string, unknown> | undefined;
                  const filePath = (details?.['filePath'] as string) ?? '';
                  if (filePath.includes('solutions/') && filePath.includes('manifest.json')) {
                    sendToRenderer('artifact_changed', {
                      filename: filePath.split('/').pop() || filePath,
                      filePath,
                      artifactType: 'solution',
                    });
                  }
                }
                break;
              case 'message_end': {
                const msg = event['message'] as {
                  role?: string;
                  content?: unknown;
                  completionFailure?: boolean;
                } | undefined;
                if (msg?.role === 'assistant') {
                  const extracted = extractTextContent(msg.content);
                  console.info('[AgentStream] message-end', {
                    sessionId: request.sessionId,
                    streamId: request.streamId,
                    extractedLength: extracted.length,
                    accumulatedLength: assistantContent.length,
                    assistantMessageSent,
                    completionFailure: msg.completionFailure === true,
                  });
                  if (extracted) {
                    if (msg.completionFailure) {
                      completionFailed = true;
                      sendToRenderer('error', {
                        message: extracted,
                        recoverable: true,
                      });
                      break;
                    }
                    const transition = applyAssistantMessageEnd(
                      { content: assistantContent, sent: assistantMessageSent },
                      {
                        content: extracted,
                        completionFailure: msg.completionFailure,
                      }
                    );
                    assistantContent = transition.content;
                    assistantMessageSent = transition.sent;
                    if (transition.shouldSend) {
                      sendToRenderer('assistant_message', {
                        content: assistantContent,
                        isStreaming: false,
                      });
                    }
                  }
                }
                break;
              }
              case 'agent_end': {
                processHealthMonitor.setAgentActivity(request.sessionId, 'completion_check');
                if (assistantMessageSent) break;
                const msg = event['message'] as {
                  role?: string;
                  content?: unknown;
                  completionFailure?: boolean;
                } | undefined;
                if (msg?.role === 'assistant' && msg.content && !msg.completionFailure) {
                  const extracted = extractTextContent(msg.content);
                  if (extracted) assistantContent = reconcileFinalStreamContent(assistantContent, extracted);
                }
                const msgs = event['messages'] as {
                  role?: string;
                  content?: unknown;
                  completionFailure?: boolean;
                }[] | undefined;
                if (msgs && Array.isArray(msgs)) {
                  const lastAssistant = [...msgs]
                    .reverse()
                    .find((m) => m?.role === 'assistant' && !m.completionFailure);
                  if (lastAssistant?.content) {
                    const extracted = extractTextContent(lastAssistant.content);
                    if (extracted) assistantContent = reconcileFinalStreamContent(assistantContent, extracted);
                  }
                }
                if (assistantContent) {
                  sendToRenderer('assistant_message', { content: assistantContent });
                  assistantMessageSent = true;
                }
                break;
              }
              case 'completion_accepted': {
                const content = event['content'];
                if (typeof content === 'string' && content) {
                  assistantContent = content;
                  assistantMessageSent = true;
                  sendToRenderer('assistant_message', {
                    content,
                    isStreaming: false,
                    completionAccepted: true,
                  });
                }
                break;
              }
              case 'agent_error':
                sendToRenderer('error', { message: (event['error'] as { message?: string })?.message || 'Unknown error' });
                break;
            }
          });

          processHealthMonitor.setAgentActivity(request.sessionId, 'prompt_start');
          this.taskRuntimeIpc.setActiveStream(request.sessionId, request.streamId);
          routeAgentSessionUserMessage({
            controller: this.taskRuntimeIpc,
            session,
            sender: event.sender,
            content: request.content,
            promptChat: async () => {
              this.taskRuntimeIpc.setUserMessagePending(request.sessionId, true);
              try {
                await agent.prompt(request.content);
              } finally {
                this.taskRuntimeIpc.setUserMessagePending(request.sessionId, false);
              }
            },
          }).then(async () => {
            this.taskRuntimeIpc.setActiveStream(request.sessionId);
            unsubscribe();
            if (assistantContent) {
              await agentSessionService.addMessage(request.sessionId, {
                role: 'assistant',
                content: assistantContent,
              }, request.projectId);
            }
            sendToRenderer('done', { content: assistantContent, failed: completionFailed });
            batcher.dispose();
          }).catch(async (err: unknown) => {
            this.taskRuntimeIpc.setActiveStream(request.sessionId);
            unsubscribe();
            const visibleError = formatVisibleAgentError(err);
            await agentSessionService.addMessage(request.sessionId, {
              role: 'assistant',
              content: visibleError,
            }, request.projectId);
            sendToRenderer('assistant_message', { content: visibleError, isStreaming: false });
            sendToRenderer('error', { message: visibleError });
            sendToRenderer('agent_error', { message: visibleError });
            sendToRenderer('done', { content: visibleError });
            batcher.dispose();
          }).finally(() => {
            processHealthMonitor.clearAgentActivity(request.sessionId);
          });

          return {
            success: true,
            data: { started: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          const restoreError = toRestoreAgentSessionError(error);
          if (restoreError.code === 'OWNERSHIP_MISMATCH' || restoreError.code === 'CORRUPT_SESSION') {
            return this.toRestoreErrorResponse(
              restoreError,
              '[AgentSessionService] Stream message ownership failed',
            );
          }
          return this.toErrorResponse(error, '[AgentSessionService] Stream message failed');
        }
      }
    );

    // ── Session Abort ──────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_SESSION_ABORT,
      async (_event, request: { sessionId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.sessionId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'sessionId is required' },
              timestamp: new Date().toISOString(),
            };
          }
          agentManager.removeAgent(request.sessionId);
          return {
            success: true,
            data: { aborted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Abort failed');
        }
      }
    );

    // ── Agent Content Get ─────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_CONTENT_GET,
      async (_event, request: { agentId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.agentId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'agentId is required' },
              timestamp: new Date().toISOString(),
            };
          }

          const dataAgentDir = path.join(getDataRoot(), 'agents', request.agentId);
          const dataAgentFilePath = path.join(dataAgentDir, 'Agent.md');
          const claudeAgentDir = path.join(getClaudeDir(), 'skills', request.agentId);
          const claudeAgentFilePath = path.join(claudeAgentDir, 'Agent.md');

          let agentDir: string;
          let agentFilePath: string;

          if (existsSync(dataAgentFilePath)) {
            agentDir = dataAgentDir;
            agentFilePath = dataAgentFilePath;
          } else if (existsSync(claudeAgentFilePath)) {
            agentDir = claudeAgentDir;
            agentFilePath = claudeAgentFilePath;
          } else {
            return {
              success: false,
              error: { code: 'NOT_FOUND', message: `Agent "${request.agentId}" not found` },
              timestamp: new Date().toISOString(),
            };
          }

          const content = readFileSync(agentFilePath, 'utf-8');
          const outputDir = path.join(getDataRoot(), 'agents', request.agentId);

          return {
            success: true,
            data: { content, baseDir: agentDir, outputDir },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Get agent content failed');
        }
      }
    );

    // ── Memory Consolidate ────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_MEMORY_CONSOLIDATE,
      async (_event, request: { entryType: string; entryId: string }): Promise<IpcResponse<unknown>> => {
        try {
          if (!request.entryType || !request.entryId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'entryType and entryId are required' },
              timestamp: new Date().toISOString(),
            };
          }
          const baseDir = ENTRY_TYPE_DIRS[request.entryType];
          if (!baseDir) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: `Unknown entryType: ${request.entryType}` },
              timestamp: new Date().toISOString(),
            };
          }
          const agentDir = path.join(getDataRoot(), baseDir, request.entryId);
          const consolidator = new MemoryConsolidator(agentDir);
          const result = await consolidator.consolidate();
          return {
            success: true,
            data: result,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentSessionService] Memory consolidate failed');
        }
      }
    );
  }

  private toErrorResponse<T>(error: unknown, logMessage: string): IpcResponse<T> {
    console.error(logMessage, error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      timestamp: new Date().toISOString(),
    };
  }

  private toRestoreErrorResponse<T>(error: unknown, logMessage: string): IpcResponse<T> {
    console.error(logMessage, error);
    const restoreError = toRestoreAgentSessionError(error);
    return {
      success: false,
      error: {
        code: restoreError.code,
        message: restoreError.message,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
