/**
 * API Route: Send Message to Project Agent
 * POST /api/agent/projects/{projectId}/messages
 *
 * 向持久化 Agent 发送消息（支持 SSE 流式响应）
 * 支持 runtime 模式（子进程）和 in-process 模式
 */

import { NextRequest, NextResponse } from 'next/server';
import { persistentAgentManager } from '@originos/core/lib/integrations/pi-agent/persistent-agent-manager';
import { sanitizeAgentDisplayContent } from '@originos/core/lib/integrations/pi-agent/display-content';
import { getVisibleStreamDelta, reconcileFinalStreamContent } from '@originos/core/lib/integrations/pi-agent/stream-dedupe';
import { getRuntimeAgent, setRuntimeAgent, type ProjectRuntimeAgent } from '@/app/api/agent/_runtime-agent-registry';
import { getGlobalSpawner } from '@originos/core/modules/collaboration-runtime/sandbox/agent-spawner';
import type { ApiResponse } from '@originos/core/types';
import type { AgentEvent } from '@originos/pi-agent-adapter';
import type { RuntimeEvent } from '@originos/core/modules/collaboration-runtime/session/types';
import type { RuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/server';
import path from 'path';
import fs from 'fs/promises';
import { getDataRoot } from '@originos/core/lib/paths';
import { persistRuntimeLLMConfig } from '@originos/core/lib/features/user-config';

// 运行时模式：通过环境变量控制
const USE_RUNTIME_MODE = process.env['USE_COLLABORATION_RUNTIME'] === 'true';

/**
 * SSE 消息格式
 */
interface StreamMessage {
  type: 'user_message' | 'assistant_message' | 'text_delta' | 'status' | 'error' | 'done' | 'tool_start' | 'tool_end';
  data: unknown;
}

/**
 * 提取文本内容
 */
function extractTextContent(content: unknown): string {
  return sanitizeAgentDisplayContent(content);
}

/**
 * 判断文本是否仅为工具调用描述（不含实质性回复）
 */
function isToolCallOnlyContent(content: string): boolean {
  const trimmed = content.trim();
  // 包含 JSON 工具调用块: {"name": "read_file", ...}
  if (/".*name".*:.*"(read_file|write_file|list_directory|bash|file)/i.test(trimmed)) return true;
  // 包含 YAML 工具调用: tool_name: xxx
  if (/tool_name\s*:/i.test(trimmed)) return true;
  // 包含函数调用语法: func(...)
  if (/[a-z_]+\s*\([^)]{0,200}\)/i.test(trimmed)) return true;
  // 匹配: *(调用工具: xxx) 等自然语言工具调用标记
  if (/[*`]*\s*[\(（]\s*(调用工具|Calling|Tool call)\s*[:：\s]/i.test(trimmed)) return true;
  // 匹配 **工具: xxx** 格式
  if (/\*\*工具\s*[:：\s]/i.test(trimmed)) return true;
  // 匹配纯 JSON 结果: {"status": "..."}
  if (/"status"\s*:/i.test(trimmed)) return true;
  return false;
}

/** 从文本中移除工具调用的 code block 和内联工具语法 */
function stripToolCodeBlocks(content: string): string {
  // 1. 移除 code block（如果是工具调用或纯 JSON 结果）
  let result = content.replace(/```(?:json)?\s*\n([\s\S]*?)```/g, (match) => {
    return isToolCallOnlyContent(match) ? '' : match;
  });
  // 2. 逐行过滤：移除工具调用描述行
  result = result.split('\n').filter(line => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (/[*`]*\s*[\(（]\s*(调用工具|Calling|Tool call)\s*[:：\s]/i.test(trimmed)) return false;
    if (/\*\*工具\s*[:：\s]/i.test(trimmed)) return false;
    if (/^\{?\s*"status"\s*:/i.test(trimmed)) return false;
    if (isToolCallOnlyContent(trimmed)) return false;
    return true;
  }).join('\n');
  // 3. 移除行内的 functionName(...) 模式
  result = result.replace(/[a-z_]+\s*\([^)]{0,200}\)/gi, '').trim();
  // 4. 清理空行
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  return result;
}

/**
 * 系统触发问候消息 —— 替换为隐藏的系统指令
 */
const SYSTEM_TRIGGER_GREETING = '__SYSTEM_TRIGGER_GREETING__';
const SYSTEM_GREETING_PROMPT = `系统启动触发: 请按照你的工作模式中的"启动时状态判断"流程，先列出 output 目录；仅当 business-model.json 存在时才读取它。文件不存在是正常的全新项目状态，请直接开始 Phase 1 访谈；文件存在时按内容判断后续阶段并生成相应问候语。`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();

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
        { status: 400 }
      );
    }

    // 系统触发消息处理：替换为隐藏指令，不暴露给用户
    const actualContent = body.content === SYSTEM_TRIGGER_GREETING
      ? SYSTEM_GREETING_PROMPT
      : body.content;
    const isSystemTriggered = body.content === SYSTEM_TRIGGER_GREETING;
    const llmConfig = body?.llmConfig as RuntimeLLMConfig | undefined;
    persistRuntimeLLMConfig(llmConfig);

    console.log(`[API] POST /api/agent/projects/${projectId}/messages`, {
      isSystemTriggered,
      sessionId: body.sessionId,
      contentPreview: actualContent.slice(0, 80),
      runtimeMode: USE_RUNTIME_MODE,
    });

    // 检查是否请求流式响应
    const acceptHeader = request.headers.get('accept') || '';
    const wantsStreaming = acceptHeader.includes('text/event-stream');

    if (USE_RUNTIME_MODE) {
      return await sendRuntimeMessage(projectId, actualContent, body.sessionId, isSystemTriggered, wantsStreaming);
    }

    // 获取运行中的 Agent（如果未启动则自动启动）
    let agent = persistentAgentManager.getAgent(projectId);
    if (!agent) {
      console.log(`[API] Agent not running for ${projectId}, attempting auto-start...`);
      try {
        agent = await persistentAgentManager.startAgent(projectId, llmConfig);
      } catch (startError) {
        console.error('[API] Auto-start failed:', startError);
        return NextResponse.json<ApiResponse<unknown>>(
          {
            success: false,
            error: {
              code: 'AGENT_NOT_RUNNING',
              message: 'Agent is not running. Please start the agent first.',
            },
            timestamp: new Date().toISOString(),
          },
          { status: 400 }
        );
      }
    }

    if (wantsStreaming) {
      // 返回 SSE 流
      const stream = createEventStream(agent, actualContent, body.sessionId, isSystemTriggered);
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // 非流式响应
    await agent.handleMessage(actualContent, body.sessionId);

    return NextResponse.json<ApiResponse<{ message: string }>>(
      {
        success: true,
        data: {
          message: 'Message sent successfully',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Error sending message:', error);
    console.error('[API] Error stack:', error instanceof Error ? error.stack : 'N/A');

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'MESSAGE_SEND_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * 创建 SSE 事件流
 */
function createEventStream(
  agent: ReturnType<typeof persistentAgentManager.getAgent>,
  userContent: string,
  sessionId?: string,
  isSystemTriggered?: boolean
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let assistantContent = '';
  let completionFailed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: StreamMessage) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));

      // 系统触发时不发送 user_message，避免前端显示隐藏意图
      if (!isSystemTriggered) {
        send({
          type: 'user_message',
          data: { content: userContent, timestamp: Date.now() },
        });
      }

      // 订阅 Agent 事件
      const piAgent = agent?.getAgent();
      if (!piAgent) {
        send({ type: 'error', data: { message: 'Agent not available' } });
        controller.close();
        return;
      }

      const unsubscribe = piAgent.subscribe((rawEvent: AgentEvent) => {
        const event = rawEvent as any;
        try {
          switch (event.type) {
            case 'thinking_delta':
              break;
            case 'thinking_end':
              break;

            case 'message_update':
              if (event['assistantMessageEvent']?.type === 'text_delta' &&
                  typeof event['assistantMessageEvent'].delta === 'string') {
                const delta = sanitizeAgentDisplayContent(event['assistantMessageEvent'].delta);
                const merged = getVisibleStreamDelta(assistantContent, delta);
                assistantContent = merged.content;
                if (merged.delta) {
                  send({ type: 'text_delta', data: { delta: merged.delta } });
                }
              }
              break;

            case 'tool_execution_start':
              send({
                type: 'tool_start',
                data: { toolCallId: event['toolCallId'], toolName: event['toolName'], args: event['args'] },
              });
              break;
            case 'tool_execution_end':
              send({
                type: 'tool_end',
                data: { toolCallId: event['toolCallId'], toolName: event['toolName'], result: event['result'], isError: event['isError'] },
              });
              break;

            case 'message_end':
              if (event['message']?.role === 'assistant') {
                if (event['message']?.completionFailure === true) {
                  completionFailed = true;
                  const failure = extractTextContent(event['message']['content']);
                  if (failure) {
                    send({ type: 'error', data: { message: failure, recoverable: true } });
                  }
                  break;
                }
                let content = reconcileFinalStreamContent(
                  assistantContent,
                  extractTextContent(event['message']['content'])
                );
                if (content) {
                  content = stripToolCodeBlocks(content);
                  if (content) {
                    send({
                      type: 'assistant_message',
                      data: { content, isStreaming: false },
                    });
                  }
                }
              }
              break;

            case 'agent_error':
              send({ type: 'error', data: { message: event['error']?.message || 'Unknown error' } });
              break;
          }
        } catch (err) {
          console.error('[Stream] Error processing event:', err);
        }
      });

      try {
        console.log(`[Stream] sending message to agent, isSystemTriggered=${isSystemTriggered}`);
        await agent?.handleMessage(userContent, sessionId);
        console.log(`[Stream] Agent handleMessage completed`);

        send({ type: 'done', data: { failed: completionFailed } });
      } catch (error) {
        console.error('[Stream] Error in handleMessage:', error);
        send({ type: 'error', data: { message: error instanceof Error ? error.message : 'Unknown error' } });
        console.error('[Stream] Error stack:', error instanceof Error ? error.stack : 'N/A');
      } finally {
        unsubscribe();
        controller.close();
      }
    },
  });
}

// ============================================================================
// Runtime mode helpers
// ============================================================================

/**
 * Runtime 模式：通过子进程发送消息
 */
async function sendRuntimeMessage(
  projectId: string,
  content: string,
  _sessionId: string,
  isSystemTriggered: boolean,
  wantsStreaming: boolean
): Promise<NextResponse | Response> {
  // 从共享注册表获取 runtime agent
  let runtimeEntry = getRuntimeAgent(projectId);
  if (!runtimeEntry) {
    console.log(`[API] Runtime mode: No agent in registry for ${projectId}, attempting auto-start...`);
    runtimeEntry = await startProjectAgentViaRuntime(projectId, _sessionId);
  }

  if (!runtimeEntry || runtimeEntry.process.getStatus() !== 'running') {
    console.error(`[API] Runtime mode: Agent not running for ${projectId}, status=${runtimeEntry?.process.getStatus()}`);
    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'AGENT_NOT_RUNNING',
          message: 'Agent is not running',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 400 }
    );
  }

  console.log(`[API] Runtime mode: Sending message to agent ${projectId}, streaming=${wantsStreaming}`);

  if (wantsStreaming) {
    return createRuntimeEventStream(runtimeEntry, content, isSystemTriggered);
  }

  // 非流式：发送 prompt 并等待完成
  try {
    await runtimeEntry.process.prompt(content);
  } catch (error) {
    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'MESSAGE_SEND_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }

  return NextResponse.json<ApiResponse<{ message: string }>>(
    {
      success: true,
      data: { message: 'Message sent successfully' },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

/**
 * Runtime 模式：启动项目 Agent（注册到共享表）
 */
async function startProjectAgentViaRuntime(projectId: string, sessionId?: string): Promise<ProjectRuntimeAgent> {
  const existing = getRuntimeAgent(projectId);
  if (existing) return existing;

  const projectDir = path.join(getDataRoot(), 'projects', projectId);
  try {
    await fs.access(projectDir);
  } catch {
    throw new Error(`Project directory not found: ${projectDir}`);
  }

  // 根据 Agent.md frontmatter 中的 agentType 决定运行时类型
  let agentType: 'persistent' | 'originos' = 'persistent';
  let systemPrompt: string | undefined;
  try {
    const agentMd = await fs.readFile(path.join(projectDir, 'Agent.md'), 'utf-8');
    systemPrompt = agentMd;
    const fmMatch = agentMd.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch?.[1]) {
      const agentTypeMatch = fmMatch[1].match(/^agentType:\s*(.+)$/m);
      if (agentTypeMatch?.[1]) {
        const rawType = agentTypeMatch[1].trim().toLowerCase();
        agentType = rawType === 'interview' ? 'persistent' : 'originos';
      }
    }
  } catch {
    console.warn(`[API] Agent.md not found for project ${projectId}`);
    systemPrompt = 'You are a helpful project assistant.';
  }

  console.log(`[API] Runtime mode: Spawning project agent for ${projectId}, agentType=${agentType}`);

  const spawner = getGlobalSpawner();
  const agentId = sessionId ?? `project-${projectId}`;
  const agentProcess = await spawner.spawn(
    {
      projectId,
      agentId,
      workingDirectory: projectDir,
      agentType,
      systemPrompt,
    },
    (event: RuntimeEvent) => {
      console.log(`[API] Runtime event from project ${projectId}: ${event.type}`);
    }
  );

  const entry: ProjectRuntimeAgent = { process: agentProcess, projectId };
  setRuntimeAgent(projectId, entry);
  console.log(`[API] Runtime mode: Project agent started for ${projectId}`);
  return entry;
}

/**
 * 创建 Runtime 模式的 SSE 事件流
 */
function createRuntimeEventStream(
  runtimeEntry: ProjectRuntimeAgent,
  userContent: string,
  isSystemTriggered: boolean
): Response {
  const encoder = new TextEncoder();
  const assistantContent: string[] = [];
  let latestCompleteMessage: string | null = null;
  let assistantMessageSent = false;
  // Track all text_delta content already forwarded. After a tool call, the agent
  // library re-emits accumulated text from previous turns as a single MESSAGE_SENT
  // event. This tracker lets us detect and skip those duplicates.
  let sentTextAccumulator = '';

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (msg: StreamMessage) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));

        if (!isSystemTriggered) {
          send({
            type: 'user_message',
            data: { content: userContent, timestamp: Date.now() },
          });
        }

        // Queue-based event delivery: events are pushed to the queue
        // from the stdout callback, and a separate loop delivers them
        // to the stream controller via process.nextTick.
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

        const eventInterceptor = (event: RuntimeEvent) => {
          switch (event.type) {
            case 'TOOL_CALL':
              enqueueEvent({
                type: 'tool_start',
                data: {
                  toolName: event.payload?.['toolName'],
                  args: event.payload?.['args'],
                },
              });
              break;
            case 'TOOL_RESULT':
              enqueueEvent({
                type: 'tool_end',
                data: {
                  toolName: event.payload?.['toolName'],
                  result: event.payload?.['result'],
                  isError: event.payload?.['isError'],
                },
              });
              break;
            case 'AGENT_THINKING':
              break;
            case 'MESSAGE_SENT': {
              // After tool calls, the agent library re-emits accumulated text from
              // previous turns as a single MESSAGE_SENT event. Compare against what
              // was already forwarded — only pass genuinely new content.
              const delta = event.payload?.['delta'];
              const text = event.payload?.['text'];
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
                assistantContent.push(content);
                enqueueEvent({ type: 'assistant_message', data: { content, isStreaming: false } });
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
                  if (textBlock) {
                    latestCompleteMessage = sanitizeAgentDisplayContent(textBlock.text);
                  }
                }
                if (!latestCompleteMessage) {
                  latestCompleteMessage = extractTextContent(msg.content) || '';
                }
              }

              if (!Array.isArray(event.payload?.['messages'])) break;

              const messages = event.payload['messages'] as any[];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg || lastMsg.role !== 'assistant') {
                break;
              }

              const lastAssistantMsg = [...messages].reverse().find(
                (m) => m && m.role === 'assistant'
              );
              let fullContent = reconcileFinalStreamContent(
                sentTextAccumulator,
                latestCompleteMessage || assistantContent.join('')
              );
              if (lastAssistantMsg?.content) {
                if (Array.isArray(lastAssistantMsg.content)) {
                  const textBlock = lastAssistantMsg.content.find(
                    (b: any) => b && b.type === 'text' && b.text
                  );
                  if (textBlock) {
                    fullContent = reconcileFinalStreamContent(fullContent, sanitizeAgentDisplayContent(textBlock.text));
                  }
                }
                if (!fullContent) {
                  fullContent = reconcileFinalStreamContent(fullContent, extractTextContent(lastAssistantMsg.content));
                }
              }

              // Mark as sent immediately — prevents duplicate on subsequent turns.
              assistantMessageSent = true;

              if (fullContent) {
                fullContent = stripToolCodeBlocks(fullContent);
                if (fullContent) {
                  enqueueEvent({ type: 'assistant_message', data: { content: fullContent, isStreaming: false } });
                }
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

        // 替换事件处理器为 SSE 专用的拦截器
        runtimeEntry.process['eventHandler'] = eventInterceptor;

        let promptSent = false;

        try {
          // Start the delivery loop FIRST so events are flushed in real-time
          // as they arrive from stdout, not batched after prompt() resolves.
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
            // Drain any remaining events after prompt resolved
            while (queue.length > 0) {
              send(queue.shift()!);
            }
            send({ type: 'done', data: null });
            controller.close();
          })();

          // Send the prompt — promptSent must flip to true IMMEDIATELY
          const promptPromise = runtimeEntry.process.prompt(userContent);
          promptSent = true;
          await promptPromise;

          // Signal completion — delivery loop will drain remaining events then close
          completed = true;
          const cb = waiterRef.current;
          waiterRef.current = null;
          if (cb) cb();

          // Wait for the delivery loop to drain remaining events
          await deliveryPromise;
        } catch (error) {
          console.error('[SSE] Error during prompt:', error);
          send({ type: 'error', data: { message: error instanceof Error ? error.message : 'Unknown error' } });
          controller.close();
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }
  );
}

/**
 * GET /api/agent/projects/{projectId}/messages
 * 获取 Agent 状态
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const agent = persistentAgentManager.getAgent(projectId);
    const runtimeEntry = getRuntimeAgent(projectId);

    if (!agent && !runtimeEntry) {
      return NextResponse.json<ApiResponse<unknown>>(
        {
          success: false,
          error: {
            code: 'AGENT_NOT_RUNNING',
            message: 'Agent is not running',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 404 }
      );
    }

    const status = agent?.getStatus() ?? runtimeEntry?.process?.getStatus();

    return NextResponse.json<ApiResponse<{ status: any }>>(
      {
        success: true,
        data: { status },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[API] Error getting agent status:', error);

    return NextResponse.json<ApiResponse<unknown>>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
