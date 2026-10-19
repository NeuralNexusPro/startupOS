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
} from '@originos/core/lib/integrations/electron';
import { persistentAgentManager } from '@originos/core/lib/features/agent/server';
import { extractDisplayContent } from '@originos/core/lib/integrations/pi-agent/display-content';
import { getVisibleStreamDelta } from '@originos/core/lib/integrations/pi-agent/stream-dedupe';
import { normalizeAgentTokenUsage, summarizeSessionTokenUsage } from '@originos/core/lib/integrations/pi-agent/token-usage';
import type { AgentMessage } from '@originos/core/types';
import { applyAssistantMessageEnd } from './assistant-stream-state';
import { persistRuntimeLLMConfig } from '@originos/core/lib/features/user-config';

const SYSTEM_TRIGGER_GREETING = '__SYSTEM_TRIGGER_GREETING__';
const SYSTEM_GREETING_PROMPT = `系统启动触发：先检查已恢复的对话历史，判断访谈进行到哪个阶段（尚未开始、领域发现中、业务精炼中、行为确认中或模型审阅中）；历史中以“系统启动触发”开头的内容不是用户回答。再依据已注入的只读项目本体上下文判断当前访谈阶段。若尚未开始，用一句自然的介绍开场，直接问用户平时主要做什么工作；若访谈已在进行，从历史中断处自然继续，不要重复已确认的内容，更不要从头开始访谈；若概念与关系已确认而业务行为尚未建模，直接用自然、简短的业务语言说明接下来要确认处理动作、状态变化和规则。每次开场都只问一个能推进当前阶段的具体问题，不要停在泛泛的问候。不要读取或提及 business-model.json、输出目录、内部阶段判断、工具调用或推理过程。`;

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

interface PendingProjectTurn {
  request: AgentProjectMessageRequest;
  content: string;
  agent: NonNullable<ReturnType<typeof persistentAgentManager.getAgent>>;
}

export class AgentProjectService {
  // 每个项目的 turn 在服务层串行执行。当前 turn 未结束时到达的消息进入项目
  // 队列，在当前 turn 完整收尾（done/error 已广播、订阅已解除）后按顺序执行，
  // 让每条消息拥有自己的订阅窗口。不能依赖底层 follow-up 队列：在 agent_end
  // 之后的 judge 窗口期间入队的消息要等到下一次 prompt() 才会运行，而届时
  // 本请求的订阅已解除，回复会全部丢失（表现为“发送消息没有响应”）。
  private projectTurns = new Map<string, { running: boolean; pending: PendingProjectTurn[] }>();

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

          return this.enqueueProjectTurn(request, actualContent, agent);
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

  private enqueueProjectTurn(
    request: AgentProjectMessageRequest,
    content: string,
    agent: NonNullable<ReturnType<typeof persistentAgentManager.getAgent>>,
  ): IpcResponse<AgentProjectMessageResponse> {
    const state = this.projectTurns.get(request.projectId) ?? { running: false, pending: [] };
    const queued = state.running;
    state.pending.push({ request, content, agent });
    this.projectTurns.set(request.projectId, state);
    if (!state.running) {
      state.running = true;
      void this.drainProjectTurns(request.projectId, state);
    }
    return {
      success: true,
      data: { started: true, ...(queued ? { queued: true } : {}) },
      timestamp: new Date().toISOString(),
    };
  }

  private async drainProjectTurns(
    projectId: string,
    state: { running: boolean; pending: PendingProjectTurn[] },
  ): Promise<void> {
    try {
      while (state.pending.length > 0) {
        const turn = state.pending.shift();
        if (!turn) continue;
        try {
          await this.runProjectTurn(turn);
        } catch (error) {
          sendToAllWindows(projectId, 'error', {
            message: error instanceof Error ? error.message : 'Message processing failed',
          });
        }
      }
    } finally {
      state.running = false;
      if (state.pending.length === 0 && this.projectTurns.get(projectId) === state) {
        this.projectTurns.delete(projectId);
      }
    }
  }

  private async runProjectTurn(turn: PendingProjectTurn): Promise<void> {
    const { request, content, agent } = turn;
    let assistantContent = '';
    let assistantMessageSent = false;
    let completionFailed = false;
    const assistantUsages: NonNullable<AgentMessage['usage']>[] = [];

    const unsubscribe = agent.subscribe((event: { type: string; [key: string]: unknown }) => {
      switch (event.type) {
        case 'message_update': {
          const assistantEvent = event['assistantMessageEvent'] as { type?: string; delta?: string } | undefined;
          if (assistantEvent?.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
            const merged = getVisibleStreamDelta(assistantContent, assistantEvent.delta);
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
        case 'tool_execution_end': {
          sendToAllWindows(request.projectId, 'tool_end', {
            toolCallId: event['toolCallId'],
            toolName: event['toolName'],
            result: event['result'],
            isError: event['isError'],
          });
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
        }
        case 'message_end': {
          const message = event['message'] as {
            role?: string;
            content?: unknown;
            completionFailure?: boolean;
            usage?: unknown;
          } | undefined;
          const messageUsage = message?.role === 'assistant'
            ? normalizeAgentTokenUsage(message.usage)
            : undefined;
          if (messageUsage) assistantUsages.push(messageUsage);
          if (assistantMessageSent && !message?.completionFailure) break;
          if (message?.role !== 'assistant') break;
          const messageContent = extractTextContent(message.content);
          if (!messageContent) break;
          if (message.completionFailure) {
            completionFailed = true;
            sendToAllWindows(request.projectId, 'error', {
              message: messageContent,
              recoverable: true,
            });
            break;
          }
          const transition = applyAssistantMessageEnd(
            { content: assistantContent, sent: assistantMessageSent },
            { content: messageContent, completionFailure: message.completionFailure },
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
          break;
        }
        case 'completion_accepted': {
          const acceptedContent = event['content'];
          if (typeof acceptedContent !== 'string' || !acceptedContent) break;
          const stripped = stripToolCodeBlocks(acceptedContent);
          if (stripped) {
            assistantContent = stripped;
            assistantMessageSent = true;
            sendToAllWindows(request.projectId, 'assistant_message', {
              content: stripped,
              isStreaming: false,
              completionAccepted: true,
            });
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

    try {
      await agent.handleMessage(content, request.sessionId);
      const usage = summarizeSessionTokenUsage(
        assistantUsages.map((item) => ({ role: 'assistant', usage: item })),
      );
      const contextTokenEstimate = agent.getAgent()?.getContextTokenEstimate();
      if (!assistantMessageSent && assistantContent) {
        const stripped = stripToolCodeBlocks(assistantContent);
        if (stripped) {
          sendToAllWindows(request.projectId, 'assistant_message', {
            content: stripped,
            isStreaming: false,
          });
        }
      }
      // 空回复兜底：模型偶发在隐藏思考上耗尽预算后返回空文本（stopReason=length）。
      // core 侧已有 EmptyResponseRecovery 重试，这里覆盖仍未产出可见内容的情况。
      if (!assistantMessageSent && !assistantContent && !completionFailed) {
        completionFailed = true;
        sendToAllWindows(request.projectId, 'error', {
          message: '模型本轮未返回可显示内容，请重试上一条消息。',
          recoverable: true,
        });
      }
      sendToAllWindows(request.projectId, 'done', {
        content: assistantContent,
        failed: completionFailed,
        ...(usage ? { usage } : {}),
        ...(contextTokenEstimate ? { contextTokenEstimate } : {}),
      });
    } finally {
      unsubscribe();
    }
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