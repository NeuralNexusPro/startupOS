'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Sparkles, Network, MessageSquare, FolderOpen } from 'lucide-react';
import { initializeSolution, listSolutions, getSolution } from '@originos/core/lib/integrations/electron/services/project';
import { CUIDialogPanel } from '@/components/interview/CUIDialogPanel';
import { SolutionGraphView } from './TopologyGraph';
import { SolutionList } from './SolutionList';
import { WorkspaceWindow } from '@/components/os/workspace';
import { usePiAgent } from '@originos/core/lib/integrations/pi-agent/client-hooks';
import { normalizeRuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/client';
import { useSettingsStore } from '@/store/settingsStore';
import { AppWindowManager } from '@/services/AppWindowManager';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface SolutionManifest {
  solutionId: string;
  solutionVersion: string;
  modelingDimension: 'task' | 'role';
  businessGoal: string;
  agents: Array<{
    id: string;
    name: string;
    type: 'agent' | 'role-agent';
    responsibility: string;
    domain: string;
    derivedFrom?: string[];
    ontologyOperations?: Array<{
      objectType: string;
      operations: string[];
    }>;
    skills?: Array<string | { name?: string; id?: string; capability?: string; code?: string; description?: string; inputContract?: unknown; outputContract?: unknown }>;
    collaborations: Array<{
      targetAgentId: string;
      targetAgentName: string;
      type: 'trigger' | 'notify' | 'depend';
      description: string;
    }>;
  }>;
  skills?: Array<{
    id: string;
    name: string;
    code: string;
    description: string;
    capability: string;
    inputContract?: unknown;
    outputContract?: unknown;
    derivedFrom?: string[];
    dependsOn?: string[];
  }>;
}

interface SolutionDesignProps {
  projectId: string;
  projectName: string;
  ontologyId?: string;
  onCancel?: () => void;
}

export function SolutionDesign({
  projectId,
  projectName,
  onCancel,
}: SolutionDesignProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const initializationRef = useRef<{ projectId: string; request: ReturnType<typeof initializeSolution> } | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [manifest, setManifest] = useState<SolutionManifest | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'topology'>('chat');
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const getEffectiveConfig = useSettingsStore((state) => state.getEffectiveConfig);
  const llmConfig = useMemo(() => {
    return normalizeRuntimeLLMConfig(getEffectiveConfig());
  }, [getEffectiveConfig]);

  // Timestamp after which messages should be displayed — hides all historical
  // messages that the server returns during `initialize()`
  const displayFromRef = useRef<number>(0);

  // Track the auto-start message content so we can hide the user bubble
  const autoStartContentRef = useRef<string | null>(null);

  const {
    isThinking,
    isRunning,
    messages: piMessages,
    artifactVersion,
    initialize,
    sendMessageStream,
    uiState,
    abort,
  } = usePiAgent();

  // Convert piMessages to CUIDialogPanel format, filtering out historical
  // messages and the auto-start user message bubble
  const messages: Message[] = useMemo(() => {
    const autoContent = autoStartContentRef.current;
    const cutoff = displayFromRef.current;
    const mapped = (piMessages || [])
      .filter((m: any) => {
        // Skip messages from before this mount (historical)
        if (m.timestamp && m.timestamp < cutoff) return false;
        // Skip the auto-start user message
        if (m.role === 'user' && autoContent && m.content === autoContent) return false;
        return true;
      })
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp || Date.now(),
        isStreaming: m.isStreaming,
      }));
    return [...localMessages, ...mapped];
  }, [localMessages, piMessages]);

  // Always create a fresh session — never restore historical ones
  useEffect(() => {
    let cancelled = false;

    setIsInitializing(true);
    setSessionId(null);
    if (initializationRef.current?.projectId !== projectId) {
      initializationRef.current = { projectId, request: initializeSolution(projectId) };
    }
    const request = initializationRef.current.request;

    const doInit = async () => {
      try {
        const result = await request;
        if (cancelled) return;

        if (!result.success || !result.data) {
          throw new Error((result as any).error?.message || 'Failed to initialize solution session');
        }

        const sid = (result.data as { sessionId: string }).sessionId;
        const baseDir = (result.data as { projectDir?: string }).projectDir || null;
        const solutionOutputDir = baseDir ? `${baseDir}/solutions` : null;

        displayFromRef.current = Date.now();

        // The auto-start effect depends on the agent being fully initialized.
        await initialize(
          sid,
          {
            projectId,
            projectName,
            entryType: 'skill',
            entryId: 'solution-design',
            ...(baseDir ? { currentPath: baseDir } : {}),
            ...(solutionOutputDir ? { outputDir: solutionOutputDir } : {}),
          },
          {
            agentType: 'skill',
            ...(baseDir ? { agentBaseDir: baseDir } : {}),
            ...(solutionOutputDir ? { outputDir: solutionOutputDir } : {}),
          },
          llmConfig,
        );

        if (cancelled) return;
        setSessionId(sid);

        // End loading only after agent initialization, so auto-start cannot race
        // with usePiAgent's internal initialized flag.
        if (!cancelled) {
          setIsInitializing(false);
        }
      } catch (err) {
        console.error('Failed to initialize solution design session:', err);
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setLocalMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `AI 解决方案启动失败：${message}`,
              timestamp: Date.now(),
            },
          ]);
          setIsInitializing(false);
        }
      }
    };

    void doInit();

    return () => { cancelled = true; };
  }, [projectId, projectName, llmConfig, initialize]);

  // Send initial message once after initialization completes (fires on every mount)
  const autoStartSentRef = useRef(false);

  useEffect(() => {
    if (isInitializing || !sessionId) return;
    if (autoStartSentRef.current) return;

    (async () => {
      try {
        autoStartSentRef.current = true;

        // Check existing solutions to pick the right opening prompt
        const solutionsResult = await listSolutions(projectId);
        const hasVersions = solutionsResult?.success && Array.isArray(solutionsResult.data) && solutionsResult.data.length > 0;

        const initialPrompt = hasVersions
          ? '项目已有方案版本，请总结当前方案状态，包括版本数量、各版本的建模维度和Agent数量，并询问用户是否需要创建新版本或调整已有方案。'
          : '请开始 AI 解决方案设计流程。请先读取项目本体文件，分析业务特征，然后推荐建模维度（事的维度 vs 人的维度），并给出推荐理由。';

        // Store the prompt content so the useMemo filter can hide the user bubble
        autoStartContentRef.current = initialPrompt;
        await sendMessageStream(initialPrompt);
      } catch (error) {
        console.error('Failed to send initial message:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setLocalMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `AI 解决方案自动启动失败：${message}`,
            timestamp: Date.now(),
          },
        ]);
      }
    })();
  }, [isInitializing, sessionId, projectId, sendMessageStream]);

  const tryFetchBundle = async (version: string): Promise<{ manifest: SolutionManifest; skills: SolutionManifest['skills'] } | null> => {
    try {
      const result = await getSolution(projectId, version);
      if (!result.success || !result.data) return null;

      const { manifest: m, agents, skills, solutionVersion } = result.data as { manifest: Record<string, unknown>; agents: unknown[]; skills: unknown[]; solutionVersion: string };
      const normalized: SolutionManifest = {
        solutionId: projectId,
        solutionVersion: solutionVersion,
        modelingDimension: (m as any).modeling?.dimension === 'role' ? 'role' : 'task',
        businessGoal: (m as any).businessModelSummary?.goal || '',
        agents: agents as SolutionManifest['agents'],
        skills: skills as SolutionManifest['skills'],
      };
      return { manifest: normalized, skills: skills as SolutionManifest['skills'] };
    } catch {
      return null;
    }
  };

  const normalizeManifest = (manifest: SolutionManifest): SolutionManifest => {
    return {
      ...manifest,
      agents: manifest.agents.map(agent => ({
        ...agent,
        collaborations: (agent.collaborations || []).map(c => ({
          targetAgentId: (c as any).targetAgentId || (c as any).target,
          targetAgentName: (c as any).targetAgentName || (c as any).target || '',
          type: c.type,
          description: c.description,
        })),
      })),
    };
  };

  const handleSelectVersion = async (version: string) => {
    setActiveVersion(version);
    const bundle = await tryFetchBundle(version);
    if (bundle) {
      setManifest(normalizeManifest(bundle.manifest));
      setActiveTab('topology');
    }
  };

  const handleSendMessage = async (content: string) => {
    try {
      await sendMessageStream(content);
    } catch (error) {
      console.error('Failed to send message:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setLocalMessages(prev => [...prev, { role: 'assistant', content: `消息发送失败：${message}`, timestamp: Date.now() }]);
    }
  };

  // Detect manifest path from Skill output and fetch topology
  useEffect(() => {
    const lastMsg = piMessages?.[piMessages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    // Match new folder format: solutions/{version}/manifest.json
    const folderMatch = lastMsg.content.match(/solutions\/([^/\s]+)\/manifest\.json/);
    if (folderMatch) {
      const version = folderMatch[1]!;
      tryFetchBundle(version).then(bundle => {
        if (bundle) {
          setManifest(normalizeManifest(bundle.manifest));
          setActiveTab('topology');
        }
      });
      return;
    }

    // Fallback: match legacy single-file format: solutions/solution-{version}.json
    const legacyMatch = lastMsg.content.match(/solutions\/solution-([^\s]+\.json)/);
    if (legacyMatch) {
      const version = legacyMatch[1]!.replace('solution-', '').replace('.json', '');
      tryFetchBundle(version).then(bundle => {
        if (bundle) {
          setManifest(normalizeManifest(bundle.manifest));
          setActiveTab('topology');
        }
      });
    }
  }, [piMessages]);

  // 监听主进程 artifact_changed 事件，刷新解决方案拓扑
  // 解决 piMessages useEffect 只检查最后一条消息的缺陷
  useEffect(() => {
    if (artifactVersion === 0) return;

    // 扫描最近的消息寻找解决方案文件路径
    const recentMessages = piMessages?.slice(-5) ?? [];
    for (const msg of [...recentMessages].reverse()) {
      if (msg.role !== 'assistant') continue;
      const folderMatch = msg.content.match(/solutions\/([^/\s]+)\/manifest\.json/);
      if (folderMatch) {
        tryFetchBundle(folderMatch[1]!).then(bundle => {
          if (bundle) {
            setManifest(normalizeManifest(bundle.manifest));
            setActiveTab('topology');
          }
        });
        return;
      }
      const legacyMatch = msg.content.match(/solutions\/solution-([^\s]+\.json)/);
      if (legacyMatch) {
        const version = legacyMatch[1]!.replace('solution-', '').replace('.json', '');
        tryFetchBundle(version).then(bundle => {
          if (bundle) {
            setManifest(normalizeManifest(bundle.manifest));
            setActiveTab('topology');
          }
        });
        return;
      }
    }
  }, [artifactVersion, piMessages]);

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-text-secondary">正在读取业务模型，分析中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col h-full min-h-[500px]">
      {/* Header */}
      <div className="native-drag-region flex items-center gap-2 px-4 py-3 border-b border-white/20">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-gray-900">AI 解决方案设计</span>

        <div className="native-no-drag flex items-center gap-1 ml-4">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${
              activeTab === 'chat'
                ? 'bg-primary/20 text-primary font-medium'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            对话
          </button>
          {manifest && (
            <button
              onClick={() => setActiveTab('topology')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${
                activeTab === 'topology'
                  ? 'bg-primary/20 text-primary font-medium'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Network className="w-3 h-3" />
              拓扑图
            </button>
          )}
        </div>

        <span className="text-xs font-medium text-gray-900 ml-auto">{projectName}</span>

        <button
          onClick={() => {
            const windowManager = AppWindowManager.getInstance();
            windowManager.openComponentWindow(
              `workspace-project-${projectId}`,
              `${projectName} 的工作区`,
              WorkspaceWindow,
              {
                projectId,
                projectName,
                basePath: `data/projects/${projectId}`,
                entryType: 'project' as const,
                entryId: projectId,
              },
              {
                position: {
                  width: 1200,
                  height: 800,
                },
                constraints: {
                  minWidth: 800,
                  minHeight: 600,
                },
              }
            );
          }}
          className="native-no-drag p-1.5 rounded-lg hover:bg-white/20 transition-colors text-gray-600 hover:text-gray-900"
          aria-label="打开工作区"
          title="打开工作区"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar: Solution list */}
        <SolutionList
          projectId={projectId}
          onSelect={handleSelectVersion}
          activeVersion={activeVersion}
        />

        {/* Main content */}
        <div className="min-w-0 flex-1 overflow-hidden">
          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="flex min-h-0 flex-col h-full">
              <div className="min-h-0 flex-1 overflow-hidden">
                <CUIDialogPanel
                  sessionId={sessionId}
                  messages={messages}
                  isLoading={isThinking}
                  onSendMessage={handleSendMessage}
                  uploadBasePath={`data/projects/${projectId}`}
                  onStop={abort}
                  isGenerating={isRunning || isThinking}
                />
              </div>

              {uiState.errorMessage && <div role="alert" className="px-4 py-2 text-sm text-red-600">{uiState.errorMessage}</div>}
              {onCancel && (
                <div className="px-4 pb-3">
                  <button
                    onClick={onCancel}
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    取消设计
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Topology Tab */}
          {activeTab === 'topology' && manifest && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  {manifest.businessGoal || 'Agent 协作拓扑'}
                </h3>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>版本 {manifest.solutionVersion}</span>
                  <span>·</span>
                  <span>{manifest.modelingDimension === 'task' ? '事的维度' : '人的维度'}</span>
                  <span>·</span>
                  <span>{manifest.agents.length} 个 Agent</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <SolutionGraphView agents={manifest.agents as any} skillDefs={manifest.skills} />
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full border border-blue-500 bg-blue-500/20" />
                  Agent
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full border border-violet-500 bg-violet-500/20" />
                  RoleAgent
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-0.5 bg-orange-500" />
                  触发
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-8 h-0.5 bg-green-500" />
                  通知
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Story P2.7: Workflow / Team 视图双模式集成 ---

export const ExtendedSolutionDesign = ({ projectId, projectName }: SolutionDesignProps) => {
  const [manifest, setManifest] = useState<SolutionManifest | null>(null);

  useEffect(() => {
    listSolutions(projectId).then(async (result) => {
      if (result?.success && Array.isArray(result.data) && result.data.length > 0) {
        const latest = result.data[0];
        const bundleResult = await getSolution(projectId, latest.version);
        if (bundleResult?.success && bundleResult.data) {
          const { manifest: m, agents, skills, solutionVersion } = bundleResult.data as { manifest: Record<string, unknown>; agents: unknown[]; skills: unknown[]; solutionVersion: string };
          setManifest({
            solutionId: projectId,
            solutionVersion: solutionVersion,
            modelingDimension: (m as any).modeling?.dimension === 'role' ? 'role' : 'task',
            businessGoal: (m as any).businessModelSummary?.goal || '',
            agents: agents as SolutionManifest['agents'],
            skills: skills as SolutionManifest['skills'],
          });
        }
      }
    });
  }, [projectId]);

  if (!manifest) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-600">
        <Loader2 className="animate-spin mr-2" /> 加载解决方案数据中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">AI 解决方案协作图谱 — {projectName}</h2>
      <SolutionGraphView agents={manifest.agents as any} skillDefs={manifest.skills} />
    </div>
  );
};
