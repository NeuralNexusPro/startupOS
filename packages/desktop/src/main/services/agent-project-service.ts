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
} from '../../../../core/src/lib/integrations/electron/ipc-protocol';
import { persistentAgentManager } from '../../../../core/src/lib/integrations/pi-agent/persistent-agent-manager';
import { extractDisplayContent } from '../../../../core/src/lib/integrations/pi-agent/display-content';
import { getVisibleStreamDelta } from '../../../../core/src/lib/integrations/pi-agent/stream-dedupe';
import { applyAssistantMessageEnd } from './assistant-stream-state';
import { persistRuntimeLLMConfig } from '../../../../core/src/lib/features/user-config';

const SYSTEM_TRIGGER_GREETING = '__SYSTEM_TRIGGER_GREETING__';
const SYSTEM_GREETING_PROMPT = `系统启动触发: 请按照你的工作模式中的"启动时状态判断"流程，先列出 output 目录；仅当 business-model.json 存在时才读取它。文件不存在是正常的全新项目状态，请直接开始 Phase 1 访谈；文件存在时按内容判断后续阶段并生成相应问候语。`;

function extractTextContent(content: unknown): string {
  return extractDisplayContent(content, { allowThinkingFallback: true });
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
            data: { status: agent.getStatus() },
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

          // Track accumulated text for final assistant_message
          let assistantContent = '';
          let assistantMessageSent = false;
          let completionFailed = false;

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
                // 检测 write_file 写入业务模型文件，主动通知前端刷新
                if (event['toolName'] === 'write_file' && !event['isError']) {
                  const result = event['result'] as Record<string, unknown> | undefined;
                  const details = result?.['details'] as Record<string, unknown> | undefined;
                  const filePath = (details?.['filePath'] as string) ?? '';
                  if (filePath.includes('business-model.json') || filePath.includes('interview-progress.md')) {
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
            if (!assistantMessageSent && assistantContent) {
              const stripped = stripToolCodeBlocks(assistantContent);
              if (stripped) {
                sendToAllWindows(request.projectId, 'assistant_message', { content: stripped, isStreaming: false });
              }
            }
            sendToAllWindows(request.projectId, 'done', { content: assistantContent, failed: completionFailed });
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
