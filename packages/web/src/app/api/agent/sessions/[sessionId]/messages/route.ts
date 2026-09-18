/**
 * API Route: Add Message to Session (with LLM Processing)
 * POST /api/agent/sessions/{sessionId}/messages
 *
 * Add a new message to a session and process with LLM
 * Returns SSE stream for streaming responses
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentSessionService } from '@originos/core/lib/features/agent';
import { agentManager } from '@originos/core/lib/features/agent/server';
import { sanitizeAgentDisplayContent } from '@originos/core/lib/integrations/pi-agent/display-content';
import { getVisibleStreamDelta, reconcileFinalStreamContent } from '@originos/core/lib/integrations/pi-agent/stream-dedupe';
import { normalizeAgentTokenUsage, summarizeSessionTokenUsage } from '@originos/core/lib/integrations/pi-agent';
import {
  assertSessionMessageOwnership,
  toRestoreAgentSessionError,
  type RestoreAgentEntryType,
} from '@originos/core/lib/integrations/pi-agent/session-restore';
import type { ApiResponse } from '@originos/core/types';
import type { AgentMessage } from '@originos/core/types';
import type { AgentEvent } from '@originos/pi-agent-adapter';

/**
 * Response message format for streaming
 *
 * Only final assistant messages and lightweight status events are pushed to clients.
 * Internal agent processing (thinking, tool calls, streaming deltas) runs silently.
 */
interface StreamMessage {
  type:
    | 'user_message'
    | 'assistant_message'
    | 'message_delta'
    | 'text_delta'
    | 'status'
    | 'error'
    | 'done'
    | 'tool_start'
    | 'tool_end';
  data: unknown;
}

/**
 * Extract text content from AgentMessage content
 * Content can be a string or array of TextContent/ImageContent objects
 */
function extractTextContent(content: unknown): string {
  return sanitizeAgentDisplayContent(content);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const body = await _request.json();
    const projectId = body.projectId;

    // Validate required fields
    if (!body.content) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'content is required',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    // Get or create session
    let session = await agentSessionService.getSession(sessionId, projectId);
    if (!session) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found. Please create a session first.',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 },
      );
    }

    try {
      assertSessionMessageOwnership(session, {
        sessionId,
        projectId,
        entryType: body.entryType as RestoreAgentEntryType | undefined,
        entryId: body.entryId,
      });
    } catch (error) {
      const ownershipError = toRestoreAgentSessionError(error);
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: ownershipError.code,
            message: ownershipError.message,
          },
          timestamp: new Date().toISOString(),
        },
        { status: ownershipError.code === 'OWNERSHIP_MISMATCH' ? 403 : 422 },
      );
    }

    // Runtime 必须先恢复持久化历史，再提交当前新消息，避免新消息被重复注入。
    const agent = await agentManager.getOrRestoreAgentRuntime(session);

    // Add user message to session
    session = await agentSessionService.addMessage(sessionId, {
      role: body.role || 'user',
      content: body.content,
      toolResults: body.toolResults,
      metadata: body.metadata,
    }, projectId);

    if (!session) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to add message to session',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 500 },
      );
    }

    // Get the user message that was just added
    const userMessage = session.messages[session.messages.length - 1]!;

    // Check if streaming is requested
    const acceptHeader = _request.headers.get('accept') || '';
    const wantsStreaming = acceptHeader.includes('text/event-stream');

    if (wantsStreaming) {
      // Return SSE stream
      const stream = createEventStream(agent, body.content, userMessage, sessionId, projectId);

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming: collect response and return
    try {
      let assistantContent = '';
      const assistantUsages: NonNullable<AgentMessage['usage']>[] = [];
      let hasError = false;
      let errorMessage = '';
      let llmCallSuccessful = false;

      // Subscribe to events
      const unsubscribe = agent.subscribe((event: AgentEvent | { type: string; [key: string]: unknown }) => {
        switch (event.type) {
          case 'text_delta':
            if (event['delta']) {
              assistantContent = getVisibleStreamDelta(assistantContent, sanitizeAgentDisplayContent(event['delta'] as string)).content;
            }
            break;
          case 'message_delta':
            if ((event as any).delta?.text) {
              assistantContent = getVisibleStreamDelta(assistantContent, sanitizeAgentDisplayContent((event as any).delta.text)).content;
            }
            break;
          case 'message_update':
            if (event.assistantMessageEvent) {
              const subEvent = event.assistantMessageEvent as any;
              if (subEvent.type === 'text_delta' && subEvent.delta) {
                assistantContent = getVisibleStreamDelta(assistantContent, sanitizeAgentDisplayContent(subEvent.delta)).content;
              }
            }
            if ((event as any).message?.content && (event as any).message?.role === 'assistant') {
              const extractedContent = extractTextContent((event as any).message.content);
              if (extractedContent) {
                assistantContent = reconcileFinalStreamContent(assistantContent, extractedContent);
              }
            }
            break;
          case 'message_end':
            if ((event as any).message?.content && (event as any).message?.role === 'assistant') {
              const extractedContent = extractTextContent((event as any).message.content);
              if (extractedContent) {
                assistantContent = reconcileFinalStreamContent(assistantContent, extractedContent);
              }
            }
            if ((event as any).message?.role === 'assistant') {
              const usage = normalizeAgentTokenUsage((event as any).message?.usage);
              if (usage) assistantUsages.push(usage);
            }
            llmCallSuccessful = true;
            break;
          case 'turn_end':
          case 'agent_end':
            llmCallSuccessful = true;
            break;
          case 'agent_error':
            hasError = true;
            errorMessage = (event as any).error?.message || 'Unknown error';
            console.error('[Messages API] Agent error:', (event as any).error);
            break;
        }
      });

      // Send prompt to LLM
      try {
        await agent.prompt(body.content);
      } catch (promptError) {
        console.error('[Messages API] Prompt error:', promptError);
        hasError = true;
        errorMessage = promptError instanceof Error ? promptError.message : 'Failed to call LLM';
      }

      // Unsubscribe
      unsubscribe();

      // If no content was captured, check agent state
      if (!assistantContent) {
        try {
          const sessionState = await agent.getSessionState();
          const messages = sessionState.messages || [];
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
            assistantContent = extractTextContent(lastMessage.content);
          }
        } catch (stateErr) {
          console.error('[Messages API] Error getting session state:', stateErr);
        }
      }

      // If still no content and error, provide helpful message
      if (!assistantContent) {
        if (hasError) {
          assistantContent = `[LLM Error: ${errorMessage}]`;
        } else if (!llmCallSuccessful) {
          assistantContent = '[LLM did not respond - check API configuration]';
        } else {
          assistantContent = 'No response generated';
        }
      }

      // Save assistant message
      const usage = summarizeSessionTokenUsage(assistantUsages.map((item) => ({ role: 'assistant', usage: item })));
      const contextTokenEstimate = agent.getContextTokenEstimate();
      const updatedSession = await agentSessionService.addMessage(sessionId, {
        role: 'assistant',
        content: assistantContent,
        ...(usage ? { usage } : {}),
        contextTokenEstimate,
      }, projectId);

      const assistantMessage = updatedSession?.messages[updatedSession!.messages.length - 1];

      return NextResponse.json<ApiResponse<{ userMessage: AgentMessage; assistantMessage?: AgentMessage }>>(
        {
          success: true,
          data: {
            userMessage,
            assistantMessage,
          },
          ...(hasError ? {
            error: {
              code: 'LLM_ERROR',
              message: errorMessage,
            }
          } : {}),
          timestamp: new Date().toISOString(),
        },
        { status: 201 },
      );
    } catch (llmError) {
      console.error('LLM processing error:', llmError);

      return NextResponse.json<ApiResponse<{ userMessage: AgentMessage }>>(
        {
          success: true,
          data: { userMessage },
          error: {
            code: 'LLM_ERROR',
            message: llmError instanceof Error ? llmError.message : 'LLM processing failed',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 201 },
      );
    }
  } catch (error) {
    console.error('Error processing message:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * Create SSE event stream for LLM responses
 *
 * Runtime mode: directly intercept RuntimeEvent from worker process,
 * bypassing bridge/event-mapper to avoid duplicate frames.
 * In-process mode: subscribe to AgentEvent from OriginOSAgent.
 */
function createEventStream(
  agent: ReturnType<typeof agentManager.getOrCreateAgent> extends Promise<infer T> ? T : never,
  userContent: string,
  userMessage: AgentMessage,
  sessionId: string,
  projectId: string | undefined
): ReadableStream<Uint8Array> {
  // Runtime mode: direct RuntimeEvent interception
  const bridgeProcess = (agent as any).__bridgeProcess;
  if (bridgeProcess && bridgeProcess.getStatus() === 'running') {
    return createRuntimeEventStream(bridgeProcess, userContent, userMessage, sessionId);
  }

  // In-process mode: original AgentEvent subscription
  return createInProcessEventStream(agent, userContent, userMessage, sessionId, projectId);
}

/**
 * Runtime mode SSE: directly intercept RuntimeEvent from worker process.
 * Mirrors the project route's createRuntimeEventStream pattern.
 */
function createRuntimeEventStream(
  process: { getStatus: () => string; prompt: (msg: string) => Promise<void> },
  userContent: string,
  userMessage: AgentMessage,
  _sessionId: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let latestCompleteMessage: string | null = null;
  let assistantMessageSent = false;
  let lastAssistantMessageContent = '';
  // 累计所有 text_delta 内容，用于检测重复
  let sentTextAccumulator = '';

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));

      send({ type: 'user_message', data: userMessage });

      const queue: StreamMessage[] = [];
      let completed = false;
      const waiterRef = { current: null as null | (() => void) };

      const enqueueEvent = (msg: StreamMessage) => {
        queue.push(msg);
        const cb = waiterRef.current;
        waiterRef.current = null;
        if (cb) cb();
      };

      const waitForEvent = () =>
        queue.length > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => { waiterRef.current = resolve; });

      const eventInterceptor = (event: { type: string; payload?: Record<string, unknown> }) => {
        switch (event.type) {
          case 'TOOL_CALL':
            enqueueEvent({
              type: 'tool_start',
              data: {
                toolCallId: event.payload?.['toolCallId'],
                toolName: event.payload?.['toolName'],
                args: event.payload?.['args'],
              },
            });
            break;
          case 'TOOL_RESULT':
            enqueueEvent({
              type: 'tool_end',
              data: {
                toolCallId: event.payload?.['toolCallId'],
                toolName: event.payload?.['toolName'],
                result: event.payload?.['result'],
                isError: event.payload?.['isError'],
              },
            });
            break;
          case 'MESSAGE_SENT': {
            const text = event.payload?.['text'];
            const delta = event.payload?.['delta'];
            const newText = typeof delta === 'string'
              ? sanitizeAgentDisplayContent(delta)
              : typeof text === 'string'
                ? sanitizeAgentDisplayContent(text)
                : null;
            if (newText) {
              const merged = getVisibleStreamDelta(sentTextAccumulator, newText);
              sentTextAccumulator = merged.content;
              if (merged.delta) {
                enqueueEvent({ type: 'text_delta', data: { delta: merged.delta } });
              }
            }
            break;
          }
          case 'ASSISTANT_MESSAGE':
            if (event.payload?.['content']) {
              const content = sanitizeAgentDisplayContent(String(event.payload['content']));
              latestCompleteMessage = content;
              if (content && content !== lastAssistantMessageContent) {
                lastAssistantMessageContent = content;
                enqueueEvent({ type: 'assistant_message', data: { content, isStreaming: false } });
              }
            }
            break;
          case 'AGENT_COMPLETE_TASK': {
            if (!promptSent) break;
            // assistant_message 只发送一次（最终回复），防止多 turn 导致重复发送。
            if (assistantMessageSent) break;
            const msg = event.payload?.['message'] as any;
            if (msg && msg.role === 'assistant' && msg.content) {
              if (Array.isArray(msg.content)) {
                const textBlock = msg.content.find(
                  (b: any) => b && b.type === 'text' && b.text
                );
                if (textBlock) latestCompleteMessage = sanitizeAgentDisplayContent(textBlock.text);
              }
              if (!latestCompleteMessage) {
                latestCompleteMessage = extractTextContent(msg.content) || '';
              }
            }
            // Only enqueue assistant_message on messages array presence AND when
            // the prompt promise has resolved (all turns finished).
            if (!Array.isArray(event.payload?.['messages'])) break;
            const messages = event.payload['messages'] as any[];
            const lastMsg = messages[messages.length - 1];
            if (!lastMsg || lastMsg.role !== 'assistant') break;

            const lastAssistantMsg = [...messages].reverse().find(
              (m) => m && m.role === 'assistant'
            );
            let fullContent = reconcileFinalStreamContent(sentTextAccumulator, latestCompleteMessage || '');
            if (lastAssistantMsg?.content) {
              if (Array.isArray(lastAssistantMsg.content)) {
                const textBlock = lastAssistantMsg.content.find(
                  (b: any) => b && b.type === 'text' && b.text
                );
                if (textBlock) fullContent = reconcileFinalStreamContent(fullContent, sanitizeAgentDisplayContent(textBlock.text));
              }
              if (!fullContent) {
                fullContent = reconcileFinalStreamContent(fullContent, extractTextContent(lastAssistantMsg.content));
              }
            }
            if (fullContent && fullContent !== lastAssistantMessageContent) {
              lastAssistantMessageContent = fullContent;
              assistantMessageSent = true;
              enqueueEvent({ type: 'assistant_message', data: { content: fullContent, isStreaming: false } });
            }
            break;
          }
          case 'AGENT_FAIL_TASK':
            if (!promptSent) break;
            enqueueEvent({
              type: 'error',
              data: { message: event.payload?.['error'] || 'Task failed' },
            });
            completed = true;
            break;
        }
      };

      // 覆盖进程级 eventHandler 为 SSE 专用拦截器
      (process as any)['eventHandler'] = eventInterceptor;

      let promptSent = false;

      try {
        const deliveryPromise = (async () => {
          while (!completed) {
            await waitForEvent();
            while (queue.length > 0) {
              const msg = queue.shift()!;
              send(msg);
              if (msg.type === 'error') {
                completed = true;
                break;
              }
            }
          }
          while (queue.length > 0) {
            send(queue.shift()!);
          }
          send({ type: 'done', data: null });
          controller.close();
        })();

        const promptPromise = process.prompt(userContent);
        promptSent = true;
        await promptPromise;

        completed = true;
        const cb = waiterRef.current;
        waiterRef.current = null;
        if (cb) cb();

        await deliveryPromise;
      } catch (error) {
        console.error('[SSE] Error during prompt:', error);
        send({ type: 'error', data: { message: error instanceof Error ? error.message : 'Unknown error' } });
        controller.close();
      }
    },
  });
}

/**
 * In-process mode SSE: subscribe to AgentEvent from OriginOSAgent.
 */
function createInProcessEventStream(
  agent: ReturnType<typeof agentManager.getOrCreateAgent> extends Promise<infer T> ? T : never,
  userContent: string,
  userMessage: AgentMessage,
  sessionId: string,
  projectId: string | undefined
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let assistantContent = '';
  let assistantMessageSent = false;
  let lastSentDelta = '';
  const assistantUsages: NonNullable<AgentMessage['usage']>[] = [];

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));

      // Confirm user message received
      send({ type: 'user_message', data: userMessage });

      const unsubscribe = agent.subscribe((event: AgentEvent | { type: string; [key: string]: unknown }) => {
        try {
          if (event.type === 'tool_execution_start') {
            console.log('[ROUTE DEBUG] tool_execution_start:', JSON.stringify(event, null, 2));
          }
          switch (event.type) {
            // Silently accumulate thinking (not pushed to client)
            case 'thinking_delta':
              break;
            case 'thinking_end':
              break;

            // Runtime mode bridge emits top-level text_delta events
            case 'text_delta': {
              const delta = sanitizeAgentDisplayContent((event as any)['delta'] as string | undefined);
              if (typeof delta === 'string') {
                if (delta === lastSentDelta) break;
                const merged = getVisibleStreamDelta(assistantContent, delta);
                assistantContent = merged.content;
                lastSentDelta = delta;
                if (merged.delta) {
                  send({ type: 'text_delta', data: { delta: merged.delta } });
                }
              }
              break;
            }

            // In-process mode: library emits message_update with nested assistantMessageEvent
            // text_delta events are emitted by the library alongside message_update,
            // causing duplicate frames if both are forwarded to the client.
            case 'message_update': {
              const asm = event['assistantMessageEvent'] as { type?: string; delta?: string } | undefined;
              if (asm?.type === 'text_delta' && typeof asm.delta === 'string') {
                const delta = sanitizeAgentDisplayContent(asm.delta);
                if (delta === lastSentDelta) break;
                const merged = getVisibleStreamDelta(assistantContent, delta);
                assistantContent = merged.content;
                lastSentDelta = delta;
                if (merged.delta) {
                  send({ type: 'text_delta', data: { delta: merged.delta } });
                }
              }
              break;
            }

            // Tool execution events with full data
            case 'tool_execution_start': {
              // Serialize full event for debugging
              const fullEvent = JSON.stringify(event);
              send({
                type: 'tool_start',
                data: { toolCallId: event['toolCallId'], toolName: event['toolName'], args: event['args'], _debugRawEvent: JSON.parse(fullEvent) },
              });
              break;
            }
            case 'tool_execution_end':
              send({
                type: 'tool_end',
                data: { toolCallId: event['toolCallId'], toolName: event['toolName'], result: event['result'], isError: event['isError'] },
              });
              break;

            // Final assistant message — push to client
            case 'message_end':
              if ((event as any)['message']?.role === 'assistant') {
                const messageUsage = normalizeAgentTokenUsage((event as any)['message'].usage);
                if (messageUsage) assistantUsages.push(messageUsage);
                const content = reconcileFinalStreamContent(
                  assistantContent,
                  extractTextContent((event as any)['message'].content)
                );
                if (content) {
                  send({
                    type: 'assistant_message',
                    data: { content, isStreaming: false, ...(messageUsage ? { usage: messageUsage } : {}) },
                  });
                  assistantMessageSent = true;
                }
              }
              break;

            // Non-streaming models emit agent_end with full message/messages payload
            case 'agent_end': {
              // Deduplicate — only send once
              if (assistantMessageSent) break;

              let content = assistantContent;
              // Single message (from message_end mapping)
              const msg = (event as any)['message'] as { role?: string; content?: unknown } | undefined;
              if (msg?.role === 'assistant' && msg.content) {
                const extracted = extractTextContent(msg.content);
                if (extracted) content = reconcileFinalStreamContent(content, extracted);
              }
              // Messages array (from agent_end mapping)
              const msgs = (event as any)['messages'] as { role?: string; content?: unknown }[] | undefined;
              if (msgs && Array.isArray(msgs)) {
                const lastAssistant = [...msgs].reverse().find(
                  (m) => m?.role === 'assistant'
                );
                if (lastAssistant?.content) {
                  const extracted = extractTextContent(lastAssistant.content);
                  if (extracted) content = reconcileFinalStreamContent(content, extracted);
                }
              }
              if (content) {
                send({
                  type: 'assistant_message',
                  data: { content, isStreaming: false },
                });
                assistantMessageSent = true;
              }
              break;
            }

            case 'agent_error':
              send({ type: 'error', data: { message: (event as any)['error']?.message || 'Unknown error' } });
              break;
          }
        } catch (err) {
          console.error('[Stream] Error processing event:', err);
        }
      });

      try {
        await agent.prompt(userContent);

        // Save assistant message to session
        const usage = summarizeSessionTokenUsage(assistantUsages.map((item) => ({ role: 'assistant', usage: item })));
        const contextTokenEstimate = agent.getContextTokenEstimate();
        if (assistantContent) {
          const messageData: Omit<AgentMessage, 'id' | 'timestamp'> = {
            role: 'assistant',
            content: sanitizeAgentDisplayContent(assistantContent),
            ...(usage ? { usage } : {}),
            contextTokenEstimate,
          };
          await agentSessionService.addMessage(sessionId, messageData, projectId);
        }

        send({ type: 'done', data: { ...(usage ? { usage } : {}), contextTokenEstimate } });
      } catch (error) {
        send({ type: 'error', data: { message: error instanceof Error ? error.message : 'Unknown error' } });
      } finally {
        unsubscribe();
        controller.close();
      }
    },
  });
}

/**
 * GET /api/agent/sessions/{sessionId}/messages
 * List all messages in a session
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;

    const session = await agentSessionService.getSession(sessionId);
    if (!session) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 },
      );
    }

    return NextResponse.json<ApiResponse<{ messages: AgentMessage[] }>>(
      {
        success: true,
        data: { messages: session.messages },
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    console.error('Error fetching messages:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
