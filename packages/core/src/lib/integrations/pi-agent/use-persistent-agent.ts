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

export function usePersistentAgent(projectId: string, llmConfig?: LlmConfig): UsePersistentAgentState {
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [artifactVersion, setArtifactVersion] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const abortingRef = useRef(false); // 正在中止，等待服务端确认
  const startedRef = useRef(false); // Prevent double-start from StrictMode
  const initTimestamp = useRef(0);  // Unique ID per hook instance
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
    const instanceTs = Date.now();
    const streamSchedulers = streamSchedulersRef.current;
    initTimestamp.current = instanceTs;
    if (startedRef.current) return;
    startedRef.current = true;

    const start = async () => {
      try {
        // 1. 确保 Agent.md / Tool.md 存在
        await initializeProjectAgent(projectId);

        // 2. 启动持久化 Agent（读取 Agent.md）
        const res = await startProjectAgent({
          projectId,
          sessionId: `project-${projectId}`,
          llmConfig,
        });
        if (res.success) {
          setIsReady(true);
          console.log('[usePersistentAgent] Agent started for project:', projectId);
        } else {
          console.error('[usePersistentAgent] Failed to start agent:', res.error);
        }
      } catch (e) {
        console.error('[usePersistentAgent] Error starting agent:', e);
      }
    };

    start();

    // 组件卸载时延迟停止 Agent，给 StrictMode 双重挂载留出时间
    let timer: ReturnType<typeof setTimeout> | null = null;
    timer = setTimeout(() => {}, 0); // Placeholder
    clearTimeout(timer);

    return () => {
      for (const state of streamSchedulers.values()) {
        state.scheduler.cancel();
      }
      streamSchedulers.clear();
      console.log('[usePersistentAgent] Cleanup scheduled for project:', projectId);
      timer = setTimeout(() => {
        if (initTimestamp.current !== instanceTs) {
          console.log('[usePersistentAgent] Cleanup cancelled: component remounted (StrictMode)');
          return;
        }
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

  const sendMessage = useCallback(async (content: string) => {
    if (!isReady || isThinking) return;

    // 等待正在进行的 abort 完成（最多 3 秒）
    if (abortingRef.current) {
      const deadline = Date.now() + 3000;
      while (abortingRef.current && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // 添加用户消息
    const userMsg: AgentMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setToolExecutions([]); // 清空上一轮工具执行记录

    // 添加占位 assistant 消息（流式）
    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    }]);

    abortRef.current = new AbortController();

    try {
      const res = await sendProjectAgentMessage({
        projectId,
        content,
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
    }
  }, [projectId, isReady, isThinking, llmConfig, processStreamEvent, finalizeStream, cancelStream]);

  const triggerGreeting = useCallback(async () => {
    if (!isReady || isThinking) return;

    // 不添加用户消息，直接触发 Agent 生成问候语
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

    try {
      const res = await sendProjectAgentMessage({
        projectId,
        content: '__SYSTEM_TRIGGER_GREETING__',
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
        console.error('[usePersistentAgent] Error triggering greeting:', e);
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: '[加载失败，请重试]', isStreaming: false }
            : m
        ));
      }
      setIsThinking(false);
      abortRef.current = null;
    }
  }, [projectId, isReady, isThinking, llmConfig, processStreamEvent, finalizeStream, cancelStream]);

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
