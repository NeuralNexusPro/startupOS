import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../ipc-protocol';
import type {
  IpcResponse,
  AgentProjectStartRequest,
  AgentProjectStartResponse,
  AgentProjectMessageRequest,
  AgentProjectMessageResponse,
  AgentProjectStopRequest,
  AgentProjectStopResponse,
  AgentProjectAbortRequest,
  AgentProjectAbortResponse,
} from '@originos/core/lib/integrations/electron/ipc-protocol';
import { persistentAgentManager } from '@originos/core/lib/features/agent/server';
import { extractDisplayContent } from '@originos/core/lib/integrations/pi-agent/display-content';
import { getVisibleStreamDelta } from '@originos/core/lib/integrations/pi-agent/stream-dedupe';
import { normalizeAgentTokenUsage, summarizeSessionTokenUsage } from '@originos/core/lib/integrations/pi-agent/token-usage';
import type { AgentMessage } from '@originos/core/types';
import { applyAssistantMessageEnd } from './assistant-stream-state';
import { persistRuntimeLLMConfig } from '@originos/core/lib/features/user-config';

const SYSTEM_TRIGGER_GREETING = '__SYSTEM_TRIGGER_GREETING__';
const SYSTEM_GREETING_PROMPT = `开始一次项目访谈。直接用自然、简短的业务语言欢迎用户，并只问一个有助于了解其日常工作的问题。不要解释或输出内部阶段判断、项目本体状态、canonical ontology、business-model.json、技能文件、工具调用或任何推理过程。`;

function extractTextContent(content: unknown): string {
  // Thinking blocks are internal reasoning. They must never become chat content.
  return extractDisplayContent(content);
}

function isToolCallOnlyContent(content: string): boolean {
  const trimmed = content.trim();
  if (/".*name".*:.*"(read_file|write_file|list_directory|bash|file)/i.test(trimmed)) return true;
  if (/tool_name\s*:/i.test(trimmed)) return true;
  if (/[a-z_]+\s*\([^)]{0,200}\)/i.test(trimmed)) return true;
  if (/[*`]*\s*[\(（]\s*(调用工具|Calling|Tool call)\s*[:：\s]/i.test(trimmed)) return true;
  if (/\*\*工具\s*[:：\s]/i.test(trimmed)) return true;
  if (/"status"\s*:/i.test(trimmed)) return true;
  return false;
}

function stripToolCodeBlocks(content: string): string {
  let result = content.replace(/```(?:json)?\s*\n([\s\S]*?)```/g, (match) => {
    return isToolCallOnlyContent(match) ? '' : match;
  });
  result = result.split('\n').filter(line => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (/[*`]*\s*[\(（]\s*(调用工具|Calling|Tool call)\s*[:：\s]/i.test(trimmed)) return false;
    if (/\*\*工具\s*[:：\s]/i.test(trimmed)) return false;
    if (/^\{?\s*"status"\s*:/i.test(trimmed)) return false;
    if (isToolCallOnlyContent(trimmed)) return false;
    return true;
  }).join('\n');
  result = result.replace(/[a-z_]+\s*\([^)]{0,200}\)/gi, '').trim();
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  return result;
}

function sendToAllWindows(projectId: string, type: string, data: unknown): void {
  if (type === 'assistant_message' || type === 'done') {
    const content = data && typeof data === 'object'
      ? (data as { content?: unknown }).content
      : undefined;
    console.info('[AgentStream] project-main-send', {
      projectId,
      eventType: type,
      contentLength: typeof content === 'string' ? content.length : 0,
    });
  }
  const payload = JSON.stringify({ projectId, type, data });
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.AGENT_EVENT, payload);
    }
  }
}

export class AgentProjectService {
  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    // ── Project Agent Start ──────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_PROJECT_START,
      async (_event, request: AgentProjectStartRequest): Promise<IpcResponse<AgentProjectStartResponse>> => {
        try {
          if (!request.projectId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'projectId is required' },
              timestamp: new Date().toISOString(),
            };
          }

          persistRuntimeLLMConfig(request.llmConfig);
          const agent = await persistentAgentManager.startAgent(request.projectId, request.llmConfig);
          return {
            success: true,
            data: { status: agent.getStatus(), messages: agent.getRestoredMessages() },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentProjectService] Start agent failed');
        }
      }
    );

    // ── Project Agent Stop ───────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_PROJECT_STOP,
      async (_event, request: AgentProjectStopRequest): Promise<IpcResponse<AgentProjectStopResponse>> => {
        try {
          if (!request.projectId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'projectId is required' },
              timestamp: new Date().toISOString(),
            };
          }

          await persistentAgentManager.stopAgent(request.projectId);
          return {
            success: true,
            data: { stopped: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentProjectService] Stop agent failed');
        }
      }
    );

    // ── Project Agent Message (streaming via AGENT_EVENT) ────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_PROJECT_MESSAGE,
      async (_event, request: AgentProjectMessageRequest): Promise<IpcResponse<AgentProjectMessageResponse>> => {
        try {
          if (!request.projectId || !request.content) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'projectId and content are required' },
              timestamp: new Date().toISOString(),
            };
          }

          persistRuntimeLLMConfig(request.llmConfig);

          // Auto-start agent if not running
          let agent = persistentAgentManager.getAgent(request.projectId);
          if (!agent) {
            console.log(`[AgentProjectService] Agent not running for ${request.projectId}, auto-starting...`);
            agent = await persistentAgentManager.startAgent(request.projectId, request.llmConfig);
          }

          // System greeting substitution
          const actualContent = request.content === SYSTEM_TRIGGER_GREETING
            ? SYSTEM_GREETING_PROMPT
            : request.content;

          // 当前 turn 仍在运行时，消息由 PersistentAgent 追加到 follow-up 队列。
          // 现有订阅会持续覆盖到该 follow-up；新请求不能再次订阅，否则会把上一轮
          // 的流式片段重复投递给同一个项目窗口。
          const isFollowUp = agent.isProcessing();
          if (isFollowUp) {
            void agent.handleMessage(actualContent, request.sessionId).catch((err: unknown) => {
              sendToAllWindows(request.projectId, 'error', {
                message: err instanceof Error ? err.message : 'Queued message processing failed',
              });
            });
            return {
              success: true,
              data: { started: true, queued: true },
              timestamp: new Date().toISOString(),
            };
          }

          // Track accumulated text for final assistant_message
          let assistantContent = '';
          let assistantMessageSent = false;
          let completionFailed = false;
          const assistantUsages: NonNullable<AgentMessage['usage']>[] = [];

          const unsubscribe = agent.subscribe((event: { type: string; [key: string]: unknown }) => {
            switch (event.type) {
              case 'message_update': {
                const asm = event['assistantMessageEvent'] as { type?: string; delta?: string } | undefined;
                if (asm?.type === 'text_delta' && typeof asm.delta === 'string') {
                  const merged = getVisibleStreamDelta(assistantContent, asm.delta);
                  assistantContent = merged.content;
                  if (merged.delta) {
                    sendToAllWindows(request.projectId, 'text_delta', { delta: merged.delta });
                  }
                }
                break;
              }
              case 'tool_execution_start':
                sendToAllWindows(request.projectId, 'tool_start', {
                  toolCallId: event['toolCallId'],
                  toolName: event['toolName'],
                  args: event['args'],
                });
                break;
              case 'tool_execution_end':
                sendToAllWindows(request.projectId, 'tool_end', {
                  toolCallId: event['toolCallId'],
                  toolName: event['toolName'],
                  result: event['result'],
                  isError: event['isError'],
                });
                // 仅通知访谈产物变化。canonical ontology 由 Core 入口维护，
                // Desktop 不再把 business-model.json 当作本体同步源。
                if (event['toolName'] === 'write_file' && !event['isError']) {
                  const result = event['result'] as Record<string, unknown> | undefined;
                  const details = result?.['details'] as Record<string, unknown> | undefined;
                  const filePath = (details?.['filePath'] as string) ?? '';
                  if (filePath.includes('interview-progress.md')) {
                    sendToAllWindows(request.projectId, 'artifact_changed', {
                      filename: filePath.split('/').pop() || filePath,
                      filePath,
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
                const messageUsage = msg?.role === 'assistant'
                  ? normalizeAgentTokenUsage((msg as { usage?: unknown }).usage)
                  : undefined;
                if (messageUsage) assistantUsages.push(messageUsage);
                if (assistantMessageSent && !msg?.completionFailure) break;
                if (msg?.role === 'assistant') {
                  const messageContent = extractTextContent(msg.content);
                  if (messageContent) {
                    if (msg.completionFailure) {
                      completionFailed = true;
                      sendToAllWindows(request.projectId, 'error', {
                        message: messageContent,
                        recoverable: true,
                      });
                      break;
                    }
                    const transition = applyAssistantMessageEnd(
                      { content: assistantContent, sent: assistantMessageSent },
                      {
                        content: messageContent,
                        completionFailure: msg.completionFailure,
                      }
                    );
                    const stripped = stripToolCodeBlocks(transition.content);
                    if (stripped) {
                      assistantContent = stripped;
                      assistantMessageSent = transition.sent;
                      if (transition.shouldSend) {
                        sendToAllWindows(request.projectId, 'assistant_message', {
                          content: stripped,
                          isStreaming: false,
                          ...(messageUsage ? { usage: messageUsage } : {}),
                        });
                      }
                    }
                  }
                }
                break;
              }
              case 'completion_accepted': {
                const content = event['content'];
                if (typeof content === 'string' && content) {
                  const stripped = stripToolCodeBlocks(content);
                  if (stripped) {
                    assistantContent = stripped;
                    assistantMessageSent = true;
                    sendToAllWindows(request.projectId, 'assistant_message', {
                      content: stripped,
                      isStreaming: false,
                      completionAccepted: true,
                    });
                  }
                }
                break;
              }
              case 'agent_error':
                sendToAllWindows(request.projectId, 'error', {
                  message: (event['error'] as { message?: string })?.message || 'Unknown error',
                });
                break;
            }
          });

          // Fire-and-forget: start processing, broadcast events, then signal done
          agent.handleMessage(actualContent, request.sessionId).then(() => {
            unsubscribe();
            const usage = summarizeSessionTokenUsage(assistantUsages.map((item) => ({ role: 'assistant', usage: item })));
            const contextTokenEstimate = agent.getAgent()?.getContextTokenEstimate();
            if (!assistantMessageSent && assistantContent) {
              const stripped = stripToolCodeBlocks(assistantContent);
              if (stripped) {
                sendToAllWindows(request.projectId, 'assistant_message', { content: stripped, isStreaming: false });
              }
            }
            sendToAllWindows(request.projectId, 'done', { content: assistantContent, failed: completionFailed, ...(usage ? { usage } : {}), ...(contextTokenEstimate ? { contextTokenEstimate } : {}) });
          }).catch((err: unknown) => {
            unsubscribe();
            sendToAllWindows(request.projectId, 'error', {
              message: err instanceof Error ? err.message : 'Message processing failed',
            });
          });

          return {
            success: true,
            data: { started: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentProjectService] Send message failed');
        }
      }
    );

    // ── Project Agent Abort ──────────────────────────────────────

    ipcMain.handle(
      IPC_CHANNELS.AGENT_PROJECT_ABORT,
      async (_event, request: AgentProjectAbortRequest): Promise<IpcResponse<AgentProjectAbortResponse>> => {
        try {
          if (!request.projectId) {
            return {
              success: false,
              error: { code: 'INVALID_REQUEST', message: 'projectId is required' },
              timestamp: new Date().toISOString(),
            };
          }

          const agent = persistentAgentManager.getAgent(request.projectId);
          if (agent) {
            agent.abort();
          }
          return {
            success: true,
            data: { aborted: true },
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return this.toErrorResponse(error, '[AgentProjectService] Abort failed');
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
}
