/**
 * AgentDialogContent Component
 * Main component for Agent dialog using real pi-agent core
 * Supports both built-in agents (pm, architect, etc.) and user-created role agents
 *
 * Features:
 * - Always creates a new session when opened
 * - Session history picker to view/select past sessions
 * - Delete session support
 * - Uses Launcher API for agent initialization
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Loader2, Clock, Plus, ChevronDown, Trash2, FolderOpen } from 'lucide-react';
import { usePiAgent } from '@originos/core/lib/integrations/pi-agent/hooks';
import { normalizeRuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/client';
import { useAgentRegistryStore } from '@/store/agentRegistry';
import { useSettingsStore } from '@/store/settingsStore';
import { launchEntry } from '@originos/core/lib/integrations/electron/services/misc';
import { deleteAgentSession, listAgentSessions } from '@originos/core/lib/integrations/electron/services/agent-session';
import { AgentStatus } from '@originos/core/types';
import type { EntryType } from '@originos/core/lib/features/services/launcher/base';
import MessageList, { type Message } from './MessageList';
import type { ToolExecution } from './ToolExecutionFrame';
import { ChatInputBar, type UploadedFileDisplay } from '@/components/ui/chat-input-bar';
import { useFileUpload, type UploadedFile } from '@/lib/hooks/use-file-upload';
import StatusIndicator from './StatusIndicator';
import { AppWindowManager } from '@/services/AppWindowManager';
import { WorkspaceWindow } from '@/components/os/workspace';
import { EntryExportButton } from '@/components/os/EntryExportButton';
import {
  createSessionTransitionGuard,
  shouldAutoStartSession,
} from './session-transition-guard';
import { AgentTaskDraftCard } from './AgentTaskDraftCard';
import { AgentTaskCard } from './AgentTaskCard';
import { shouldShowAgentTaskPanel } from './agent-task-panel-visibility';
import {
  supportsAgentTaskRuntime,
  useAgentTaskRuntime,
} from './use-agent-task-runtime';
import {
  createAgentTaskRequestId,
  type AgentTaskDraftInput,
} from '@/services/agent-task-runtime';

interface SessionHistoryItem {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  summary?: string;
}

interface AgentDialogContentProps {
  agentId: string;
  agentName?: string;
  agentType?: string;
  initialMessage?: string;
}

export default function AgentDialogContent({ agentId, agentName, agentType: propAgentType, initialMessage }: AgentDialogContentProps) {
  const agents = useAgentRegistryStore((state) => state.agents);
  const agent = agents ? Object.values(agents).filter(Boolean).find((a) => a?.id === agentId) : undefined;
  const setAgentStatus = useAgentRegistryStore((state) => state.setAgentStatus);

  // Resolve display name and type from props or registry
  const displayName = agentName || agent?.displayName || agent?.name || agentId;
  const resolvedAgentType = propAgentType || agent?.type || 'role-agent';
  let exportEntryType: 'agent' | 'role-agent' | null = 'agent';
  if (resolvedAgentType === 'role-agent') {
    exportEntryType = 'role-agent';
  } else if (resolvedAgentType === 'project' || resolvedAgentType === 'skill') {
    exportEntryType = null;
  }

  // Session history state
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(null);
  const transitionGuardRef = useRef(createSessionTransitionGuard());
  const pendingNewSessionRef = useRef<{ target: string; previous: string | null } | null>(null);
  const initializedSessionRef = useRef<string | null>(null);
  const isInitializingSessionRef = useRef<string | null>(null);

  // Generate a stable sessionId (survives StrictMode double-mount)
  const fallbackSessionIdRef = useRef<string | null>(null);
  if (!fallbackSessionIdRef.current) {
    fallbackSessionIdRef.current = `agent-${agentId}-${Date.now()}`;
  }
  const sessionId = activeSessionId || fallbackSessionIdRef.current;
  const taskRuntimeSupported = supportsAgentTaskRuntime(resolvedAgentType);

  const {
    initialize,
    sendMessageStream,
    isInitialized,
    isRunning,
    isThinking,
    isRestoring,
    uiState,
    messages: agentMessages,
    abort,
    subscribe,
    restoreSession,
  } = usePiAgent();

  const getEffectiveConfig = useSettingsStore((s) => s.getEffectiveConfig);
  const taskRuntime = useAgentTaskRuntime({
    sessionId: sessionId || '',
    enabled: taskRuntimeSupported && isInitialized && !isRestoring && !switchingSessionId,
  });
  const [taskDraft, setTaskDraft] = useState<AgentTaskDraftInput | null>(null);

  const hasAutoStartedRef = useRef(false);

  // Track tool execution history via subscribe
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const toolCallIdRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribe?.((event: any) => {
      if (event.type === 'tool_execution_start') {
        const id = event.toolCallId || `tool-${Date.now()}-${++toolCallIdRef.current}`;
        setToolExecutions(prev => [...prev, {
          id,
          name: event.toolName,
          status: 'running',
          args: event.args,
          timestamp: Date.now(),
        }]);
      } else if (event.type === 'tool_execution_end') {
        setToolExecutions(prev => {
          const runningTool = event.toolCallId
            ? prev.find(t => t.id === event.toolCallId)
            : [...prev].reverse().find(t => t.name === event.toolName && t.status === 'running');
          if (!runningTool) return prev;
          return prev.map(t =>
            t.id === runningTool.id
              ? { ...t, status: event.isError ? 'error' as const : 'completed' as const, result: event.result }
              : t
          );
        });
      }
    });
    return unsubscribe || undefined;
  }, [subscribe]);

  const messages: Message[] = agentMessages
    ?.map((msg: any, idx: number) => ({
        id: msg.id || `msg-${idx}`,
        role: msg.role as Message['role'],
        content: msg.content,
        timestamp: msg.timestamp,
        isStreaming: msg.isStreaming,
      }))
    // Hide only the user-side system trigger message
    .filter((msg: any) => {
      if (msg.role === 'user' && msg.content.startsWith('你好！请根据你的人设')) {
        return false;
      }
      return true;
    })
    || [];

  // No fallback welcome message — if there are no messages yet, show empty state
  const displayMessages: Message[] = messages;

  // Load session history for this agent
  const loadSessionHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const result = await listAgentSessions(agentId);
      if (result.success && (result.data as { sessions?: unknown[] })?.sessions) {
        const sessions = (result.data as { sessions: Array<{ sessionId: string; createdAt: number; updatedAt: number; messageCount: number; summary?: string }> }).sessions;
        setSessionHistory(sessions.map((s) => ({
          sessionId: s.sessionId,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
          summary: s.summary,
        })));
      }
    } catch (error) {
      console.error('Failed to load session history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadSessionHistory();
  }, [loadSessionHistory]);

  useEffect(() => {
    setTaskDraft(null);
  }, [sessionId]);

  // Create a new session: always start fresh
  const createNewSession = useCallback(() => {
    const newId = `agent-${agentId}-${Date.now()}`;
    transitionGuardRef.current.invalidate();
    pendingNewSessionRef.current = {
      target: newId,
      previous: activeSessionId ?? initializedSessionRef.current,
    };
    setSwitchingSessionId(newId);
    setActiveSessionId(newId);
    setShowHistory(false);
    hasAutoStartedRef.current = false;
  }, [activeSessionId, agentId]);

  // Select an existing session
  const selectSession = useCallback(async (selectedSessionId: string) => {
    if (selectedSessionId === activeSessionId) {
      setShowHistory(false);
      return;
    }

    hasAutoStartedRef.current = true;
    const restoreToken = transitionGuardRef.current.begin(`restore:${selectedSessionId}`);
    pendingNewSessionRef.current = null;
    isInitializingSessionRef.current = null;
    setSwitchingSessionId(selectedSessionId);
    try {
      const entryType = resolvedAgentType === 'role-agent'
        ? 'role-agent'
        : resolvedAgentType === 'skill'
          ? 'skill'
          : 'agent';
      const restored = await restoreSession({
        sessionId: selectedSessionId,
        projectId: agentId,
        entryType,
        entryId: agentId,
      });
      if (!restored || !transitionGuardRef.current.isCurrent(restoreToken)) return;
      initializedSessionRef.current = selectedSessionId;
      setActiveSessionId(selectedSessionId);
      setShowHistory(false);
      setToolExecutions([]);
    } catch (error) {
      console.error('[AgentDialogContent] Failed to restore session:', error);
      await loadSessionHistory();
    } finally {
      setSwitchingSessionId((current) => current === selectedSessionId ? null : current);
    }
  }, [activeSessionId, agentId, loadSessionHistory, resolvedAgentType, restoreSession]);

  // Delete a session
  const deleteSession = useCallback(async (e: React.MouseEvent, sessionIdToDelete: string) => {
    e.stopPropagation();
    try {
      const response = await deleteAgentSession(sessionIdToDelete);
      if (response.success) {
        // Remove from history list
        setSessionHistory(prev => prev.filter(s => s.sessionId !== sessionIdToDelete));
        // If the deleted session is currently active, start a new session
        if (activeSessionId === sessionIdToDelete) {
          createNewSession();
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [agentId, activeSessionId, createNewSession]);

  // Initialize agent via Launcher API
  useEffect(() => {
    if (
      !sessionId
      || isInitializingSessionRef.current === sessionId
      || (isInitialized && initializedSessionRef.current === sessionId)
    ) return;
    isInitializingSessionRef.current = sessionId;
    const initializationToken = transitionGuardRef.current.begin(`initialize:${sessionId}`);

    const initAgent = async () => {
      try {
        setAgentStatus(agentId, AgentStatus.RUNNING);

        // Map resolved type to entry type for launcher API
        const entryTypeMap: Record<string, EntryType> = {
          'role-agent': 'role-agent',
          'assistant': 'agent',
          'project': 'project',
          'skill': 'skill',
        };
        const entryType = entryTypeMap[resolvedAgentType] || 'role-agent';

        // Call launcher API to initialize agent with all configuration
        // No restoreSessionId — always create a new session
        const launchResult = await launchEntry({
          entryType,
          entryId: agentId,
        });

        if (!launchResult.success) {
          throw new Error(launchResult.error?.message || 'Failed to launch agent');
        }

        const { systemPrompt = '', baseDir } = launchResult.data as { systemPrompt?: string; baseDir?: string };

        const llmConfig = normalizeRuntimeLLMConfig(getEffectiveConfig());

        await initialize(
          sessionId,
          {
            projectId: agentId,
            projectName: displayName,
          },
          {
            agentType: resolvedAgentType,
            systemPrompt,
            ...(baseDir ? { agentBaseDir: baseDir } : {}),
          },
          llmConfig
        );
        if (!transitionGuardRef.current.isCurrent(initializationToken)) {
          return;
        }
        initializedSessionRef.current = sessionId;
        setActiveSessionId(sessionId);
        const pendingNewSession = pendingNewSessionRef.current;
        if (pendingNewSession?.target === sessionId) {
          pendingNewSessionRef.current = null;
          setSwitchingSessionId((current) => current === sessionId ? null : current);
        }
      } catch (error) {
        if (!transitionGuardRef.current.isCurrent(initializationToken)) {
          return;
        }
        console.error('[AgentDialogContent] Failed to initialize agent:', error);
        setAgentStatus(agentId, AgentStatus.ERROR);
        const pendingNewSession = pendingNewSessionRef.current;
        if (pendingNewSession?.target === sessionId) {
          pendingNewSessionRef.current = null;
          setActiveSessionId(pendingNewSession.previous);
          setSwitchingSessionId((current) => current === sessionId ? null : current);
        }
      } finally {
        if (transitionGuardRef.current.isCurrent(initializationToken)) {
          isInitializingSessionRef.current = null;
        }
      }
    };

    initAgent();
  }, [sessionId, isInitialized, initialize, setAgentStatus, agentId, resolvedAgentType, displayName, getEffectiveConfig]);

  useEffect(() => {
    if (
      !initialMessage?.trim()
      || !shouldAutoStartSession({
        isInitialized,
        isRestoring,
        switchingSessionId,
        hasAutoStarted: hasAutoStartedRef.current,
        messageCount: messages.length,
        isThinking,
      })
    ) return;

    hasAutoStartedRef.current = true;
    const sendInitialMessage = async () => {
      try {
        await sendMessageStream(initialMessage);
      } catch (error) {
        console.error('[AgentDialogContent] Failed to send initial message:', error);
      }
    };

    sendInitialMessage();
  }, [
    initialMessage,
    isInitialized,
    isRestoring,
    isThinking,
    messages.length,
    sendMessageStream,
    switchingSessionId,
  ]);

  // For role agents with no history, trigger dynamic welcome message generation
  useEffect(() => {
    if (
      initialMessage?.trim()
      || resolvedAgentType !== 'role-agent'
      || !shouldAutoStartSession({
        isInitialized,
        isRestoring,
        switchingSessionId,
        hasAutoStarted: hasAutoStartedRef.current,
        messageCount: messages.length,
        isThinking,
      })
    ) return;

    hasAutoStartedRef.current = true;

    const generateWelcome = async () => {
      try {
        await sendMessageStream(
          '你好！请根据你的人设做一段简短有趣的自我介绍。'
        );
      } catch (error) {
        console.error('[AgentDialogContent] Failed to generate welcome:', error);
      }
    };

    generateWelcome();
  }, [
    initialMessage,
    isInitialized,
    isRestoring,
    isThinking,
    messages.length,
    resolvedAgentType,
    sendMessageStream,
    switchingSessionId,
  ]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      setToolExecutions([]);
      if (!isInitialized || switchingSessionId || isRestoring || !content.trim()) return;
      try {
        await sendMessageStream(content);
      } catch (error) {
        console.error('[AgentDialogContent] Failed to send message:', error);
      }
    },
    [isInitialized, isRestoring, sendMessageStream, switchingSessionId]
  );

  const [agentUploadedFiles, setAgentUploadedFiles] = useState<UploadedFileDisplay[]>([]);
  const [agentUploadError, setAgentUploadError] = useState<string | null>(null);
  const [agentUploading, setAgentUploading] = useState(false);

  const handleAgentFileUploaded = useCallback((files: UploadedFile[]) => {
    setAgentUploadedFiles(prev => [...prev, ...files.map(f => ({ name: f.name, path: f.path, size: f.size }))]);
    setAgentUploadError(null);
  }, []);

  const handleAgentFileError = useCallback((error: Error) => {
    setAgentUploadError(error.message);
    setTimeout(() => setAgentUploadError(null), 5000);
  }, []);

  const handleAgentUploadStateChange = useCallback((state: 'idle' | 'uploading' | 'done' | 'error') => {
    setAgentUploading(state === 'uploading');
  }, []);

  const handleAgentRemoveFile = useCallback((index: number) => {
    if (index === -1) {
      setAgentUploadError(null);
      return;
    }
    setAgentUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number | string>>(new Set());

  const handleQuestionAnswer = useCallback((messageIndex: number | string, selectedLabels: string[]) => {
    setAnsweredQuestions(prev => new Set([...prev, messageIndex]));
    handleSendMessage(selectedLabels.join('、'));
  }, [handleSendMessage]);

  // Wrap sendMessage to include attachment info when sending, then clear chips
  const wrappedSendMessage = useCallback((content: string) => {
    if (agentUploadedFiles.length > 0) {
      const fileInfos = agentUploadedFiles.map(f => {
        if (f.path) {
          return `文件名: ${f.name}, 路径: ${f.path}`;
        }
        return f.name;
      }).join('\n');
      const fileHint = `我上传了以下文件：\n${fileInfos}\n\n请读取文件内容后，${content}`;
      setAgentUploadedFiles([]);
      handleSendMessage(fileHint);
    } else {
      handleSendMessage(content);
    }
  }, [agentUploadedFiles, handleSendMessage]);

  const handleUpload = useFileUpload({
    basePath: `data/agents/${agentId}`,
    onUploaded: handleAgentFileUploaded,
    onError: handleAgentFileError,
    onStateChange: handleAgentUploadStateChange,
  });

  const handleOpenDirectory = () => {
    const windowManager = AppWindowManager.getInstance();
    windowManager.openComponentWindow(
      `workspace-agent-${agentId}`,
      `${displayName} 的工作区`,
      WorkspaceWindow,
      {
        projectId: `agent-${agentId}`,
        projectName: displayName,
        basePath: `data/agents/${agentId}`,
        entryType: resolvedAgentType as 'agent' | 'role-agent',
        entryId: agentId,
      },
      {
        position: {
          width: 1200,
          height: 800,
        },
      }
    );
  };

  const openTaskDraft = useCallback(() => {
    if (!taskRuntimeSupported || taskRuntime.hasActiveTask || taskDraft) return;
    taskRuntime.clearError();
    setTaskDraft({
      requestId: createAgentTaskRequestId(),
      title: '',
      objective: '',
      acceptanceCriteria: [''],
    });
  }, [taskDraft, taskRuntime, taskRuntimeSupported]);

  const submitTaskDraft = useCallback(async () => {
    if (!taskDraft) return;
    if (
      taskRuntime.snapshot?.execution.status === 'failed'
      && taskRuntime.snapshot.execution.requestId === taskDraft.requestId
    ) {
      const retried = await taskRuntime.control('retry');
      if (retried) setTaskDraft(null);
      return;
    }
    const created = await taskRuntime.create(taskDraft);
    if (created) setTaskDraft(null);
  }, [taskDraft, taskRuntime]);

  const taskPanel = taskDraft ? (
    <AgentTaskDraftCard
      draft={taskDraft}
      submitting={taskRuntime.pendingAction === 'create'}
      error={taskRuntime.error}
      onChange={setTaskDraft}
      onCancel={() => {
        taskRuntime.clearError();
        setTaskDraft(null);
      }}
      onSubmit={() => void submitTaskDraft()}
    />
  ) : shouldShowAgentTaskPanel(taskRuntime.snapshot, taskRuntime.hasActiveTask) ? (
      <AgentTaskCard
        snapshot={taskRuntime.snapshot!}
        error={taskRuntime.error}
        pendingAction={taskRuntime.pendingAction}
        onControl={(action) => void taskRuntime.control(action)}
      />
    ) : taskRuntime.error ? (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        任务功能暂不可用：{taskRuntime.error}
      </div>
    ) : null;

  if (resolvedAgentType !== 'role-agent' && !agent) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Agent not found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-gray-800 dark:text-gray-200">
      <div className="native-drag-region p-4 border-b border-white/20 dark:border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{agent?.icon || '🎭'}</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-lg text-gray-900 dark:text-white">
                {displayName}
              </h2>
              {/* Workspace button */}
              <button
                onClick={handleOpenDirectory}
                className="native-no-drag flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100/20 transition-colors"
                title="打开工作区"
              >
                <FolderOpen className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {exportEntryType && (
                <EntryExportButton entryType={exportEntryType} entryId={agentId} />
              )}

              {/* Session history button */}
              <div className="native-no-drag relative">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100/20 transition-colors"
                  title="历史会话"
                >
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-xs text-gray-500">
                    {sessionHistory.length > 0 ? `${sessionHistory.length}` : ''}
                  </span>
                  <ChevronDown className="w-3 h-3 text-gray-500" />
                </button>

                {/* Session history dropdown */}
                {showHistory && (
                  <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto min-w-72 dark:bg-gray-800 dark:border-gray-700">
                    <div className="p-2">
                      {/* New session button */}
                      <button
                        onClick={createNewSession}
                        disabled={Boolean(switchingSessionId) || isRestoring}
                        className="w-full text-left px-3 py-2.5 rounded-lg bg-primary/5 hover:bg-primary/10 text-primary transition-colors border border-primary/20 mb-1"
                      >
                        <div className="flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          <span className="font-medium text-sm">新建会话</span>
                        </div>
                      </button>

                      {/* Divider */}
                      <div className="h-px bg-gray-200 my-2 dark:bg-gray-700" />

                      {/* Session history list */}
                      {isLoadingHistory ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                          <span className="ml-2 text-xs text-gray-400">加载中...</span>
                        </div>
                      ) : sessionHistory.length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-400">
                          暂无历史会话
                        </div>
                      ) : (
                        sessionHistory.map((session) => (
                          <div
                            key={session.sessionId}
                            className="group flex items-center gap-1"
                          >
                            <button
                              onClick={() => void selectSession(session.sessionId)}
                              disabled={Boolean(switchingSessionId) || isRestoring}
                              className={`flex-1 text-left px-3 py-2.5 rounded-lg transition-colors mb-1 ${
                                session.sessionId === activeSessionId
                                  ? 'bg-primary/10 text-primary'
                                  : 'hover:bg-gray-50 text-gray-700 dark:hover:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm truncate max-w-[60%]">
                                  {session.summary?.split('...')[0] || session.summary || `会话 ${session.sessionId.slice(0, 8)}`}
                                </span>
                                {switchingSessionId === session.sessionId ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                ) : (
                                  <span className="text-xs text-gray-400">
                                    {session.messageCount} 条消息
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-gray-400">
                                  {new Date(session.updatedAt).toLocaleDateString('zh-CN', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </button>
                            {/* Delete session button */}
                            <button
                              onClick={(e) => deleteSession(e, session.sessionId)}
                              className="mb-1 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all dark:hover:bg-red-900/20"
                              title="删除会话"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <StatusIndicator status={agent?.status || AgentStatus.RUNNING} isThinking={isThinking} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <MessageList
          messages={displayMessages}
          isLoading={isThinking}
          toolExecutions={toolExecutions}
          onQuestionAnswer={handleQuestionAnswer}
          answeredQuestions={answeredQuestions}
          taskContent={taskPanel}
        />
      </div>

      <ChatInputBar
        onSubmit={wrappedSendMessage}
        disabled={!isInitialized || isRunning || isRestoring || Boolean(switchingSessionId) || taskRuntime.blocksChat}
        placeholder={`向 ${displayName} 发送消息...`}
        onUpload={handleUpload}
        onStop={taskRuntime.blocksChat ? undefined : abort}
        isGenerating={isThinking}
        uploadedFiles={agentUploadedFiles}
        onRemoveFile={handleAgentRemoveFile}
        uploadError={agentUploadError}
        uploading={agentUploading}
        onCreateTask={taskRuntimeSupported ? openTaskDraft : undefined}
        createTaskDisabled={
          taskRuntime.loading
          || taskRuntime.hasActiveTask
          || Boolean(taskDraft)
          || Boolean(taskRuntime.pendingAction)
        }
      />

      {uiState.errorMessage && (
        <div className="px-4 py-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20">
          {uiState.errorMessage}
        </div>
      )}
    </div>
  );
}
