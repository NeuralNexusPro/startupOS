/**
 * usePersistentAgent - 持久化 Agent Hook
 *
 * 使用持久化 Agent API，Agent 启动时读取项目目录下的 Agent.md
 * 不依赖 systemPrompt 传入，Agent 自主理解能力
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initializeProjectAgent,
  startProjectAgent,
  stopProjectAgent,
  sendProjectAgentMessage,
  abortProjectAgent,
} from '../electron/services/agent-project';
import { appendStreamDelta, reconcileFinalStreamContent } from './stream-dedupe';
import { StreamRenderScheduler } from './stream-render-scheduler';
import type { AgentContextTokenEstimate, AgentTokenUsage } from '../../../types/agent';
import { normalizeAgentTokenUsage } from './token-usage';

export interface AgentMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  usage?: AgentTokenUsage;
  contextTokenEstimate?: AgentContextTokenEstimate;
}

export interface ToolExecution {
  id: string;       // toolCallId
  name: string;     // tool name (e.g. write_file, read_file)
  status: 'running' | 'completed' | 'error';
  args?: unknown;
  result?: unknown;
  timestamp: number;
}

export interface UsePersistentAgentState {
  isReady: boolean;       // Agent 已启动并就绪
  isThinking: boolean;    // Agent 正在处理
  messages: AgentMessage[];
  toolExecutions: ToolExecution[];  // 当前工具执行帧
  artifactVersion: number;  // 业务模型文件变更计数
  sendMessage: (content: string) => Promise<void>;
  triggerGreeting: () => Promise<void>;  // 触发 Agent 自动生成问候语（无用户消息）
  abort: () => void;
}

export interface LlmConfig {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

type ProjectAgentStartResult = Awaited<ReturnType<typeof startProjectAgent>>;

interface ProjectAgentMountState {
  leases: Set<symbol>;
  startPromise?: Promise<ProjectAgentStartResult>;
}

// Electron main 中的 Project Agent 按 projectId 共享。React StrictMode 会在开发态
// 执行 setup -> cleanup -> setup，因此不能用单个 Hook ref 判断是否真正卸载。
// 这里用跨 Hook 实例的 lease 集合保护共享 Agent：只有最后一个窗口 lease
// 释放后才停止 Agent，并且同一项目的重复挂载共用同一个启动 Promise。
const projectAgentMounts = new Map<string, ProjectAgentMountState>();

function acquireProjectAgentMount(projectId: string): { lease: symbol; state: ProjectAgentMountState } {
  const state = projectAgentMounts.get(projectId) ?? { leases: new Set<symbol>() };
  const lease = Symbol(projectId);
  state.leases.add(lease);
  projectAgentMounts.set(projectId, state);
  return { lease, state };
}

export function usePersistentAgent(projectId: string, llmConfig?: LlmConfig): UsePersistentAgentState {
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [artifactVersion, setArtifactVersion] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const abortingRef = useRef(false); // 正在中止，等待服务端确认
  // React state updates are asynchronous. Keep a synchronous queue as the source
  // of truth so a second submit cannot race an in-flight prompt.
  // pendingMessagesRef 承载串行发送队列；displayUserMessage=false 的条目
  // （如 triggerGreeting 的系统触发）不渲染用户气泡。
  const pendingMessagesRef = useRef<Array<{ content: string; displayUserMessage: boolean }>>([]);
  const greetingResolveRef = useRef<(() => void) | null>(null);
  const isSendingRef = useRef(false);
  const streamSchedulersRef = useRef(new Map<string, {
    content: string;
    scheduler: StreamRenderScheduler;
  }>());

  const getStreamState = useCallback((assistantId: string) => {
    const existing = streamSchedulersRef.current.get(assistantId);
    if (existing) {
      return existing;
    }
    const state = {
      content: '',
      scheduler: new StreamRenderScheduler({
        onCommit: (nextContent, isStreaming) => {
          setMessages(prev => prev.map(message =>
            message.id === assistantId
              ? { ...message, content: nextContent, isStreaming }
              : message
          ));
        },
        onDebug: (debugEvent) => {
          console.info('[StreamRender] persistent-scheduler', {
            projectId,
            assistantId,
            ...debugEvent,
          });
        },
      }),
    };
    streamSchedulersRef.current.set(assistantId, state);
    return state;
  }, [projectId]);

  const finalizeStream = useCallback(async (assistantId: string, finalContent?: string) => {
    const existing = streamSchedulersRef.current.get(assistantId);
    if (!existing && !finalContent) {
      return;
    }
    const state = existing ?? getStreamState(assistantId);
    if (finalContent) {
      state.content = reconcileFinalStreamContent(state.content, finalContent);
    }
    await state.scheduler.finish(state.content);
    state.scheduler.cancel();
    streamSchedulersRef.current.delete(assistantId);
  }, [getStreamState]);

  const cancelStream = useCallback((assistantId: string) => {
    const state = streamSchedulersRef.current.get(assistantId);
    state?.scheduler.cancel();
    streamSchedulersRef.current.delete(assistantId);
  }, []);

  // 启动 Agent（仅执行一次）
  useEffect(() => {
    const streamSchedulers = streamSchedulersRef.current;
    const { lease, state: mountState } = acquireProjectAgentMount(projectId);
    let active = true;

    if (!mountState.startPromise) {
      const startPromise = (async () => {
        // 1. 确保 Agent.md / Tool.md 存在
        await initializeProjectAgent(projectId);

        // 2. 启动持久化 Agent（读取 Agent.md）
        return startProjectAgent({
          projectId,
          sessionId: `project-${projectId}`,
          llmConfig,
        });
      })();
      mountState.startPromise = startPromise;
      void startPromise.catch(() => {
        if (mountState.startPromise === startPromise) {
          mountState.startPromise = undefined;
        }
      });
    }

    void mountState.startPromise.then((res) => {
        if (!active) return;
        if (res.success) {
          const restoredMessages = res.data?.messages
            ?.filter((message): message is typeof message & { role: 'user' | 'assistant' } => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              timestamp: message.timestamp,
              usage: message.usage,
              contextTokenEstimate: message.contextTokenEstimate,
            })) ?? [];
          if (restoredMessages.length > 0) {
            setMessages(restoredMessages);
          }
          setIsReady(true);
          console.log('[usePersistentAgent] Agent started for project:', projectId, { restoredMessages: restoredMessages.length });
        } else {
          console.error('[usePersistentAgent] Failed to start agent:', res.error);
        }
      }).catch((e) => {
        if (!active) return;
        console.error('[usePersistentAgent] Error starting agent:', e);
      });

    return () => {
      active = false;
      for (const state of streamSchedulers.values()) {
        state.scheduler.cancel();
      }
      streamSchedulers.clear();
      console.log('[usePersistentAgent] Cleanup scheduled for project:', projectId);
      setTimeout(() => {
        const current = projectAgentMounts.get(projectId);
        if (!current) return;
        current.leases.delete(lease);
        if (current.leases.size > 0) {
          console.log('[usePersistentAgent] Cleanup retained shared agent:', projectId, { leases: current.leases.size });
          return;
        }
        projectAgentMounts.delete(projectId);
        console.log('[usePersistentAgent] Cleanup: stopping agent for project:', projectId);
        stopProjectAgent({ projectId }).catch(() => {});
      }, 500);
    };
  }, [projectId]);

  const processStreamEvent = useCallback((
    event: { type: string; data: unknown },
    assistantId: string
  ) => {
    if (event.type === 'text_delta') {
      const delta = (event.data as { delta?: string })?.delta || '';
      const state = getStreamState(assistantId);
      state.content = appendStreamDelta(state.content, delta);
      state.scheduler.schedule(state.content);
    } else if (event.type === 'assistant_message') {
      const data = event.data as { content: string };
      const state = getStreamState(assistantId);
      state.content = reconcileFinalStreamContent(state.content, data.content);
      void state.scheduler.finish(state.content);
    } else if (event.type === 'done') {
      const data = event.data as { content?: string; usage?: unknown; contextTokenEstimate?: AgentContextTokenEstimate } | null;
      if (data?.content) {
        const state = streamSchedulersRef.current.get(assistantId);
        if (state) {
          state.content = reconcileFinalStreamContent(state.content, data.content);
        }
      }
      if (data) {
        setMessages(prev => prev.map(message => message.id === assistantId
          ? { ...message, usage: normalizeAgentTokenUsage(data.usage), contextTokenEstimate: data.contextTokenEstimate }
          : message));
      }
    } else if (event.type === 'tool_start') {
      const data = event.data as { toolCallId?: string; toolName: string; args?: unknown };
      setToolExecutions(prev => [...prev, {
        id: data.toolCallId || `tool-${Date.now()}`,
        name: data.toolName,
        status: 'running',
        args: data.args,
        timestamp: Date.now(),
      }]);
    } else if (event.type === 'tool_end') {
      const data = event.data as { toolCallId?: string; toolName: string; result?: unknown; isError?: boolean };
      setToolExecutions(prev => prev.map(t =>
        t.id === (data.toolCallId || `tool-${Date.now()}`)
          ? { ...t, status: data.isError ? 'error' : 'completed', result: data.result }
          : t
      ));
    } else if (event.type === 'artifact_changed') {
      setArtifactVersion(v => v + 1);
    }
  }, [finalizeStream, getStreamState]);

  const runSendQueue = useCallback(async () => {
    try {
      let next = pendingMessagesRef.current.shift();
      while (next !== undefined) {
        // 等待正在进行的 abort 完成（最多 3 秒）
        if (abortingRef.current) {
          const deadline = Date.now() + 3000;
          while (abortingRef.current && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 100));
          }
        }

        if (next.displayUserMessage) {
          const userMsg: AgentMessage = {
            role: 'user',
            content: next.content,
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, userMsg]);
        }
        setIsThinking(true);
        setToolExecutions([]);

        const assistantId = `assistant-${Date.now()}`;
        setMessages(prev => [...prev, {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: true,
        }]);

        abortRef.current = new AbortController();
        const isGreeting = !next.displayUserMessage;

        try {
          const res = await sendProjectAgentMessage({
            projectId,
            content: next.content,
            sessionId: `session-${projectId}`,
            llmConfig,
          }, {
            onEvent: (event) => processStreamEvent(event, assistantId),
            onDone: () => {
              void finalizeStream(assistantId).then(() => {
                setMessages(prev => prev.map(m =>
                  m.id === assistantId && m.isStreaming
                    ? { ...m, isStreaming: false }
                    : m
                ));
                setIsThinking(false);
                abortRef.current = null;
                if (isGreeting) {
                  greetingResolveRef.current?.();
                  greetingResolveRef.current = null;
                }
              });
            },
            onError: (error) => {
              cancelStream(assistantId);
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content || `[错误: ${error.message}]`, isStreaming: false }
                  : m
              ));
              setIsThinking(false);
              abortRef.current = null;
              if (isGreeting) {
                greetingResolveRef.current?.();
                greetingResolveRef.current = null;
              }
            },
          });

          if (!res.success) {
            cancelStream(assistantId);
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: `[错误: ${res.error?.message || 'Unknown error'}]`, isStreaming: false }
                : m
            ));
            setIsThinking(false);
            abortRef.current = null;
          }
        } catch (e: unknown) {
          cancelStream(assistantId);
          if (e instanceof Error && e.name !== 'AbortError') {
            console.error('[usePersistentAgent] Error sending message:', e);
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: '[发送失败，请重试]', isStreaming: false }
                : m
            ));
          }
          setIsThinking(false);
          abortRef.current = null;
        } finally {
          if (isGreeting) {
            greetingResolveRef.current?.();
            greetingResolveRef.current = null;
          }
        }

        next = pendingMessagesRef.current.shift();
      }
    } finally {
      isSendingRef.current = false;
    }
  }, [projectId, llmConfig, processStreamEvent, finalizeStream, cancelStream]);

  const sendMessage = useCallback(async (content: string) => {
    if (!isReady) return;

    pendingMessagesRef.current.push({ content, displayUserMessage: true });
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    await runSendQueue();
  }, [isReady, runSendQueue]);

  const triggerGreeting = useCallback(async () => {
    if (!isReady || isThinking) return;

    // 系统触发的问候与用户消息共用串行发送队列：不渲染用户气泡、不落用户
    // 消息内容，但复用同一条发送链路和事件订阅，保证与用户消息竞争时不会
    // 丢失回复窗口。
    const greetingCompleted = new Promise<void>((resolve) => {
      pendingMessagesRef.current.push({ content: '__SYSTEM_TRIGGER_GREETING__', displayUserMessage: false });
      greetingResolveRef.current = resolve;
    });
    if (!isSendingRef.current) {
      isSendingRef.current = true;
      void runSendQueue();
    }
    await greetingCompleted;
  }, [isReady, isThinking, runSendQueue]);

  const abort = useCallback(async () => {
    abortRef.current?.abort();
    for (const state of streamSchedulersRef.current.values()) {
      state.scheduler.cancel();
    }
    streamSchedulersRef.current.clear();
    abortingRef.current = true;
    // 停止流式消息：有内容则保留，无内容则移除占位消息，让 loading 完全消失
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last?.isStreaming) {
        if (last.content) {
          return prev.map(m => m === last ? { ...m, isStreaming: false } : m);
        }
        return prev.filter(m => m !== last);
      }
      return prev;
    });
    setIsThinking(false);
    // 通知服务端中止并等待确认
    try {
      await abortProjectAgent({ projectId });
    } catch {
      // ignore
    }
    // 等待服务端 agent 内部状态清理完成（_runLoop finally 块）
    await new Promise(r => setTimeout(r, 300));
    abortingRef.current = false;
  }, [projectId]);

  return { isReady, isThinking, messages, toolExecutions, artifactVersion, sendMessage, triggerGreeting, abort };
}
