'use client';
import { useAgentTaskRuntime } from '@/components/os/agent-dialog/use-agent-task-runtime';
import { AgentTaskCard } from '@/components/os/agent-dialog/AgentTaskCard';
import { shouldShowAgentTaskPanel } from '@/components/os/agent-dialog/agent-task-panel-visibility';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2, Info, Play, X, Clock, Plus, FolderOpen } from 'lucide-react';
import { usePiAgent } from '@originos/core/lib/integrations/pi-agent/hooks';
import { normalizeRuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/client';
import { useSettingsStore } from '@/store/settingsStore';
import { ChatMessageList } from '@/components/ui/chat';
import { v4 as uuidv4 } from 'uuid';
import { AppWindowManager } from '@/services/AppWindowManager';
import { WorkspaceWindow } from '@/components/os/workspace';
import { EntryExportButton } from '@/components/os/EntryExportButton';
import {
  createSessionTransitionGuard,
  shouldAutoStartSession,
} from '@/components/os/agent-dialog/session-transition-guard';
import { useFileUpload, type UploadedFile } from '@/lib/hooks/use-file-upload';
import { ChatInputBar } from '@/components/ui/chat-input-bar';
import {
  getAvailableSkillContent,
  listAvailableSkillSessions,
  listAvailableSkills,
  runSkillEvolution,
} from '@originos/core/lib/integrations/electron/services/skill';
import { getAgentContent } from '@originos/core/lib/integrations/electron/services/agent-session';
import { isSkillExportAllowed } from './skill-export-policy';

export interface SkillMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface SkillDefinition {
  name: string;
  code: string;
  description: string;
  source?: string;
  disableModelInvocation?: boolean;
  filePath?: string;
  baseDir?: string;
  systemManaged?: boolean;
}

interface SkillDialogProps {
  skillName?: string;
  initialMessage?: string;
  onMessage?: (message: string) => Promise<void>;
  onSkillChange?: (skillName: string) => void;
  skillContent?: string;
  onClose?: () => void;
}

/**
 * 技能内容加载器 - 从 API 加载 SKILL.md 内容和元数据
 * 如果技能不存在，会回退到从 Agent API 加载 Agent.md（支持角色 Agent）
 */
async function loadSkillContent(skillName: string): Promise<{
  content: string;
  baseDir?: string;
  workingDir?: string;
  outputDir?: string;
  systemManaged: boolean;
}> {
  try {
    const data = await getAvailableSkillContent({ name: skillName });
    if (data.success && data.data?.content) {
      return {
        content: String(data.data.content),
        baseDir: data.data.baseDir,
        workingDir: data.data.workingDir,
        outputDir: data.data.outputDir,
        systemManaged: data.data.systemManaged,
      };
    }
  } catch (error) {
    console.warn(`[loadSkillContent] Failed to load skill content for ${skillName}, trying agents API...`);
  }

  // Fallback: try loading from agents API (for role agents launched as skills)
  try {
    const data = await getAgentContent(skillName);
    if (data.success && data.data?.content) {
      return {
        content: String(data.data.content),
        baseDir: data.data.baseDir,
        workingDir: data.data.workingDir,
        outputDir: data.data.outputDir,
        systemManaged: true,
      };
    }
  } catch (error) {
    console.error(`[loadSkillContent] Failed to load agent content for ${skillName}:`, error);
  }

  return { content: '', systemManaged: true };
}

/**
 * 构建 Skill 会话的系统提示词
 */
function buildSkillSystemPrompt(skillName: string, skillContent: string, skillDir?: string, workDir?: string, outputDir?: string): string {
  const lines: string[] = [];

  // === Working Directory (CWD + 认知文件目录) ===
  if (workDir) {
    lines.push(`Working directory: ${workDir}`);
    lines.push('');
    lines.push('All bash commands and cognitive files (Memory.md, practice/) are resolved from this directory.');
    lines.push('');
  }

  // === Output Directory (产物输出目录) ===
  if (outputDir && outputDir !== workDir) {
    lines.push(`Output directory for artifacts: ${outputDir}`);
    lines.push('');
    lines.push('Use `${OUTPUT_DIR}` in shell commands only when you need the native absolute artifact directory.');
    lines.push('When calling file tools, do NOT pass absolute paths. Use runtime data-root paths instead: `data/agents/{agent-id}/...` for Agents and `data/skills/{skill-code}/...` for Skills.');
    lines.push('Legacy short paths `agents/...` and `skills/...` are also mapped to the runtime data root when this skill runs from `data/skills/{skill}`.');
    lines.push('');
  } else if (outputDir && outputDir === workDir) {
    // 兜底：outputDir 与 workDir 相同时仍注入路径行，确保 Agent 即使
    // 在 bash cwd 异常（如 Windows MSYS /workspace）时也能从 prompt
    // 文本读到正确的输出目录绝对路径。
    lines.push(`Output directory for artifacts: ${outputDir}`);
    lines.push('');
  }

  // === Skill Assets Directory (技能源目录，只读) ===
  if (skillDir) {
    lines.push(`Skill assets directory: ${skillDir}`);
    lines.push('Use this directory to read reference files and templates only. Do NOT write output files here.');
    lines.push('You can use ${CLAUDE_SKILL_DIR} in shell commands to reference this directory.');
    lines.push('');
  }

  // === Skill Instructions ===
  if (!skillContent) {
    lines.push(`You are a helpful assistant for ${skillName}.`);
    lines.push('');
    lines.push('Help users with their requests in a conversational and helpful way. Provide clear, step-by-step responses and show progress as you work.');
  } else {
    // 解析 frontmatter，提取 name 和 description
    const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
    let displayName = skillName;
    if (frontmatterMatch?.[1]) {
      const nameMatch = frontmatterMatch[1].match(/^name:\s*(.+)$/m);
      if (nameMatch?.[1]) displayName = nameMatch[1].trim();

      const descMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
      if (descMatch?.[1]) displayName = descMatch[1].trim();
    }

    const bodyWithoutFrontmatter = frontmatterMatch
      ? skillContent.slice(frontmatterMatch[0].length).trim()
      : skillContent;

    lines.push(`You are ${displayName}.`);
    lines.push('');
    lines.push('## Skill Instructions');
    lines.push(bodyWithoutFrontmatter);
  }

  // === How to Execute ===
  lines.push('');
  lines.push('## How to Execute');
  lines.push('When the user gives a request:');
  lines.push('1. Understand their intent from natural language');
  lines.push('2. Determine the operation type (create, update, query, delete, etc.)');
  lines.push('3. Provide clear, step-by-step progress updates');
  lines.push('4. Deliver the final result in a clear format');
  lines.push('');
  lines.push('Be conversational and helpful! Show progress as you work.');

  // === Tool Execution Rules ===
  lines.push('');
  lines.push('## Tool Execution Rules');
  lines.push('You have access to built-in tools that can perform actions on behalf of the user.');
  lines.push('');
  lines.push('IMPORTANT: When you decide to use a tool, call it directly without asking the user for confirmation.');
  lines.push('The system automatically handles tool execution. Do NOT pause to ask "Do you want me to..." or "Should I..." before calling a tool.');
  lines.push('');
  lines.push('Examples:');
  lines.push('- GOOD: User says "save the model" → Immediately call write_file to save it.');
  lines.push('- BAD: User says "save the model" → Ask "Would you like me to save it?" → Wait for confirmation → Then save.');
  lines.push('');
  lines.push('Only ask the user for input when you need information you don\'t already have, not for tool execution approval.');

  // === Network Access Authorization ===
  lines.push('');
  lines.push('## Network Access');
  lines.push('You are explicitly authorized to make HTTP/HTTPS requests to external services using the execute_command tool.');
  lines.push('Network access to any external service is allowed for fulfilling skill requirements, including:');
  lines.push('- Fetching data from external APIs (e.g., skill market, search services)');
  lines.push('- Downloading files from URLs (e.g., GitHub ZIP, ClawHub packages)');
  lines.push('- Web scraping and content extraction from any domain');
  lines.push('Do NOT warn the user about external network access — it is a granted capability.');
  lines.push('');

  // === User Communication Rules ===
  lines.push('');
  lines.push('## User Communication Rules');
  lines.push('Never expose internal implementation details to the user.');
  lines.push('Do NOT mention file paths, directory paths, or internal technical concepts in your responses.');
  lines.push('Focus on what you are doing and the results, not how it is implemented internally.');

  let result = lines.join('\n');

  // 替换 ${CLAUDE_SKILL_DIR} 变量（指向技能源目录，用于读取参考文件）
  if (skillDir) {
    result = result.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir);
  }

  // 替换 ${OUTPUT_DIR} 变量（指向产物输出目录）
  if (outputDir) {
    result = result.replace(/\$\{OUTPUT_DIR\}/g, outputDir);
  }

  return result;
}

/**
 * SkillDialog - Skill 对话界面组件
 *
 * 使用 Pi Agent 会话执行技能，支持流式输出和技能切换
 */
export function SkillDialog({
  skillName: initialSkillName,
  initialMessage,
  onMessage,
  onSkillChange,
  skillContent: externalSkillContent,
  onClose,
}: SkillDialogProps) {
  const [currentSkill, setCurrentSkill] = useState<string | undefined>(initialSkillName);
  const [showSkillList, setShowSkillList] = useState(false);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const skillContentCacheRef = useRef<Map<string, {
    content: string;
    baseDir?: string;
    workingDir?: string;
    outputDir?: string;
    systemManaged: boolean;
  }>>(new Map());
  const currentSkillDirRef = useRef<string | undefined>(undefined);
  const [currentSkillSystemManaged, setCurrentSkillSystemManaged] = useState<boolean | null>(null);
  const [isLoadingSkillsList, setIsLoadingSkillsList] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number | string>>(new Set());
  const hasAutoStartedRef = useRef(false); // 防止重复发送初始消息
  const lastInitRef = useRef<{ skill: string | undefined; session: string | undefined }>({ skill: undefined, session: undefined });
  // 稳定的会话 ID：组件创建时生成，避免 hook 重新初始化
  const stableSessionIdRef = useRef<string>(uuidv4());
  const currentStableSessionId = stableSessionIdRef.current;

  // 关闭时派发事件，通知首页刷新 Agent 和技能列表
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('skill:session-close', {
        detail: { skillName: currentSkill },
      }));
    };
  }, [currentSkill]);

  // ===== Session History State =====
  interface SessionHistoryItem {
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
    summary?: string;
  }
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [switchingSessionId, setSwitchingSessionId] = useState<string | null>(null);
  const transitionGuardRef = useRef(createSessionTransitionGuard());
  const pendingNewSessionRef = useRef<{
    target: string;
    previous: string | null;
    skill: string;
  } | null>(null);
  const restoredSessionIdRef = useRef<string | null>(null);
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  void historyTimeoutRef; // suppress unused warning

  // 使用 Pi Agent hook
  const {
    isInitialized,
    isThinking,
    isRestoring,
    uiState,
    sessionId: runtimeSessionId,
    messages: piMessages,
    initialize,
    restoreSession,
    sendMessageStream,
    abort,
  } = usePiAgent();

  const taskRuntime = useAgentTaskRuntime({ sessionId: runtimeSessionId || '', enabled: isInitialized && !isRestoring && !switchingSessionId });

  const getEffectiveConfig = useSettingsStore((s) => s.getEffectiveConfig);

  // 懒加载技能列表（仅在打开下拉菜单时加载）
  const loadSkillsList = useCallback(async () => {
    if (skills.length > 0 || isLoadingSkillsList) return; // 已加载或正在加载

    setIsLoadingSkillsList(true);
    try {
      const data = await listAvailableSkills({ source: 'bundled' });
      if (data.success && data.data?.skills) {
        const skillsList: SkillDefinition[] = data.data.skills.map((s) => ({
          name: s.name,
          code: s.code || s.name,
          description: s.description,
          source: s.source,
          disableModelInvocation: s.disableModelInvocation,
          filePath: s.filePath,
          baseDir: s.baseDir,
          systemManaged: s.systemManaged,
        }));
        setSkills(skillsList);
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      setIsLoadingSkillsList(false);
    }
  }, [skills.length, isLoadingSkillsList]);

  // 加载当前 Skill 的历史会话
  const loadSessionHistory = useCallback(async (showLoading = true) => {
    if (!currentSkill) return;
    if (showLoading) setIsLoadingHistory(true);
    try {
      const data = await listAvailableSkillSessions({ skillName: currentSkill });
      if (data.success && data.data?.sessions) {
        setSessionHistory(data.data.sessions.map((s) => ({
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
      if (showLoading) setIsLoadingHistory(false);
    }
  }, [currentSkill]);

  useEffect(() => {
    void loadSessionHistory();
  }, [loadSessionHistory]);

  // 创建新会话
  const createNewSession = useCallback(() => {
    const newSessionId = uuidv4();
    if (!currentSkill) return;
    transitionGuardRef.current.invalidate();
    pendingNewSessionRef.current = {
      target: newSessionId,
      previous: activeSessionId ?? stableSessionIdRef.current,
      skill: currentSkill,
    };
    hasAutoStartedRef.current = false;
    setSwitchingSessionId(newSessionId);
    setActiveSessionId(newSessionId);
    setShowHistory(false);
  }, [activeSessionId, currentSkill]);

  // 选择历史会话
  const selectSession = useCallback(async (selectedSessionId: string) => {
    if (
      !currentSkill
      || selectedSessionId === activeSessionId
      || selectedSessionId === runtimeSessionId
    ) {
      if (selectedSessionId === runtimeSessionId) {
        setActiveSessionId(selectedSessionId);
      }
      setShowHistory(false);
      return;
    }

    hasAutoStartedRef.current = true;
    const restoreToken = transitionGuardRef.current.begin(`restore:${selectedSessionId}`);
    pendingNewSessionRef.current = null;
    setSwitchingSessionId(selectedSessionId);
    try {
      const restored = await restoreSession({
        sessionId: selectedSessionId,
        projectId: `skill-${currentSkill}`,
        entryType: 'skill',
        entryId: currentSkill,
      });
      if (!restored || !transitionGuardRef.current.isCurrent(restoreToken)) return;
      restoredSessionIdRef.current = selectedSessionId;
      lastInitRef.current = { skill: currentSkill, session: selectedSessionId };
      setActiveSessionId(selectedSessionId);
      setShowHistory(false);
    } catch (error) {
      console.error('[SkillDialog] Failed to restore session:', error);
      await loadSessionHistory();
    } finally {
      setSwitchingSessionId((current) => current === selectedSessionId ? null : current);
    }
  }, [activeSessionId, currentSkill, loadSessionHistory, restoreSession, runtimeSessionId]);

  // 当 currentSkill 或 activeSessionId 变化时初始化 Agent
  useEffect(() => {
    console.log('[SkillDialog] useEffect triggered:', { currentSkill, activeSessionId });

    if (!currentSkill) {
      console.log('[SkillDialog] No currentSkill, skipping init');
      return;
    }

    const init = async () => {
      // 优先使用 activeSessionId（用户创建/选择的新会话），否则使用稳定 session ID
      const effectiveSessionId = activeSessionId || currentStableSessionId;
      if (restoredSessionIdRef.current === effectiveSessionId) {
        restoredSessionIdRef.current = null;
        return;
      }

      console.log('[SkillDialog] init() started for skill:', currentSkill, 'session:', effectiveSessionId, 'lastInit:', lastInitRef.current);

      // 如果技能和会话都没变，跳过
      if (lastInitRef.current.skill === currentSkill && lastInitRef.current.session === effectiveSessionId) {
        console.log('[SkillDialog] Skill+Session already initialized, skipping');
        return;
      }
      lastInitRef.current = { skill: currentSkill, session: effectiveSessionId };
      const initializationToken = transitionGuardRef.current.begin(
        `initialize:${currentSkill}:${effectiveSessionId}`,
      );

      // 确保有有效的 skillName
      if (!currentSkill) {
        console.warn('[SkillDialog] No current skill to initialize');
        return;
      }

      // 尝试获取技能内容：优先使用外部传入的内容，否则从 ref 缓存获取
      let skillData = skillContentCacheRef.current.get(currentSkill);

      if (!skillData) {
        try {
          skillData = await loadSkillContent(currentSkill);
          if (externalSkillContent) {
            skillData = { ...skillData, content: externalSkillContent };
          }
          skillContentCacheRef.current.set(currentSkill, skillData);
        } catch (error) {
          console.error(`[SkillDialog] Failed to load skill content for: ${currentSkill}`, error);
          skillData = {
            content: externalSkillContent ?? '',
            baseDir: undefined,
            workingDir: undefined,
            outputDir: undefined,
            systemManaged: true,
          };
          skillContentCacheRef.current.set(currentSkill, skillData);
        }
      }
      setCurrentSkillSystemManaged(skillData.systemManaged);

      const content = skillData?.content ?? '';
      // skillDir：技能源目录（只读参考，用于 CLAUDE_SKILL_DIR）
      // agentWorkDir：工作目录（CWD + 认知文件写入）
      // outputDir：产物输出目录（仅注入 prompt，工具层只接收 agentWorkDir）
      const skillDir = skillData?.baseDir;
      const agentWorkDir = skillData?.workingDir ?? skillData?.outputDir ?? skillDir;
      const outputDir = skillData?.outputDir;
      currentSkillDirRef.current = agentWorkDir ?? skillDir;
      const systemPrompt = buildSkillSystemPrompt(currentSkill, content, skillDir, agentWorkDir, outputDir);

      console.log(`[SkillDialog] Initializing agent for skill: ${currentSkill}, session: ${effectiveSessionId}, prompt length: ${systemPrompt.length}${agentWorkDir ? `, workDir: ${agentWorkDir}` : ''}`);

      const llmConfig = normalizeRuntimeLLMConfig(getEffectiveConfig());

      try {
        await initialize(
          effectiveSessionId,
          {
            projectId: `skill-${currentSkill}`,
            projectName: `技能: ${currentSkill}`,
          },
          {
            agentType: 'skill',
            systemPrompt,
            ...(agentWorkDir && { agentBaseDir: agentWorkDir }),
            ...(outputDir && { outputDir }),
          },
          llmConfig
        );
        if (!transitionGuardRef.current.isCurrent(initializationToken)) {
          return;
        }
        setActiveSessionId(effectiveSessionId);
        const pendingNewSession = pendingNewSessionRef.current;
        if (
          pendingNewSession?.target === effectiveSessionId
          && pendingNewSession.skill === currentSkill
        ) {
          pendingNewSessionRef.current = null;
          setSwitchingSessionId((current) => current === effectiveSessionId ? null : current);
        }
        console.log(`[SkillDialog] Initialized agent for skill: ${currentSkill}, session: ${effectiveSessionId}`);
      } catch (error) {
        if (!transitionGuardRef.current.isCurrent(initializationToken)) {
          return;
        }
        console.error(`[SkillDialog] Failed to initialize skill session: ${currentSkill}`, error);
        const pendingNewSession = pendingNewSessionRef.current;
        if (
          pendingNewSession?.target === effectiveSessionId
          && pendingNewSession.skill === currentSkill
        ) {
          pendingNewSessionRef.current = null;
          lastInitRef.current = {
            skill: currentSkill,
            session: pendingNewSession.previous ?? undefined,
          };
          setActiveSessionId(pendingNewSession.previous);
          setSwitchingSessionId((current) => current === effectiveSessionId ? null : current);
        }
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSkill, activeSessionId]);

  // 发送初始消息
  useEffect(() => {
    if (
      !initialMessage
      || !shouldAutoStartSession({
        isInitialized,
        isRestoring,
        switchingSessionId,
        hasAutoStarted: hasAutoStartedRef.current,
        messageCount: piMessages?.length ?? 0,
        isThinking,
      })
    ) {
      return;
    }

    // 直接调用 sendMessageStream 以避免循环依赖
    hasAutoStartedRef.current = true;
    (async () => {
      try {
        await sendMessageStream(initialMessage);
      } catch (error) {
        console.error('[SkillDialog] Failed to send initial message:', error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialMessage,
    isInitialized,
    isRestoring,
    isThinking,
    piMessages?.length,
    sendMessageStream,
    switchingSessionId,
  ]);

  // 转换 Pi Agent 消息为 SkillMessage 格式
  const skillMessages = useMemo<SkillMessage[]>(() => {
    return (piMessages ?? []).map((msg: { role: string; content: string; timestamp?: number }) => ({
      role: (msg.role === 'tool' || msg.role === 'toolResult') ? 'system' : msg.role as 'user' | 'assistant' | 'system',
      content: msg.content || '',
      timestamp: msg.timestamp || Date.now(),
      isStreaming: (msg as { isStreaming?: boolean }).isStreaming,
    }));
  }, [piMessages]);

  // 找到初始系统消息的索引（第一条用户消息），渲染时跳过它
  const initialMessageIndex = useMemo(() => {
    if (!initialMessage) return -1;
    for (let i = 0; i < skillMessages.length; i++) {
      if (skillMessages[i]?.role === 'user' && skillMessages[i]?.content === initialMessage) {
        return i;
      }
    }
    return -1;
  }, [skillMessages, initialMessage]);

  // 发送消息
  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isThinking || isRestoring || switchingSessionId || !isInitialized) return;

    const startTime = Date.now();

    // 调用外部处理器（如果提供）
    if (onMessage) {
      await onMessage(content);
    } else {
      // 使用 Pi Agent 流式发送
      let success = true;
      try {
        await sendMessageStream(content);
      } catch (error) {
        success = false;
        console.error('Failed to send message:', error);
      }

      // Fire-and-forget: 记录执行信号，检查是否触发进化
      const skillDir = currentSkillDirRef.current;
      const sessionId = activeSessionId || stableSessionIdRef.current;
      if (skillDir && currentSkill) {
        runSkillEvolution({
          skillDir,
          skillName: currentSkill,
          run: {
            timestamp: new Date().toISOString(),
            sessionId,
            success,
            turnCount: (piMessages?.length ?? 0) + 1,
            duration: Date.now() - startTime,
          },
        }).catch(() => {}); // fire-and-forget
      }
    }
  }, [isThinking, isRestoring, switchingSessionId, isInitialized, onMessage, sendMessageStream, currentSkill, activeSessionId, piMessages]);

  // 停止生成
  const handleStop = useCallback(() => {
    abort();
  }, [abort]);

  const handleQuestionAnswer = useCallback((messageIndex: number | string, selectedLabels: string[]) => {
    setAnsweredQuestions(prev => new Set(prev).add(messageIndex));
    handleSendMessage(selectedLabels.join(', '));
  }, [handleSendMessage]);

  const handleSkillSelect = (skillName: string) => {
    transitionGuardRef.current.invalidate();
    pendingNewSessionRef.current = null;
    setSwitchingSessionId(null);
    setCurrentSkillSystemManaged(null);
    setActiveSessionId(null);
    hasAutoStartedRef.current = false;
    lastInitRef.current = { skill: undefined, session: undefined };
    setCurrentSkill(skillName);
    setShowSkillList(false);
    onSkillChange?.(skillName);
  };

  // 获取技能显示名称
  const displaySkillName = useMemo(() => {
    const skill = skills.find(s => s.code === currentSkill);
    return skill?.name || currentSkill || 'skills';
  }, [currentSkill, skills]);

  // 打开技能目录
  const handleOpenDirectory = useCallback(async () => {
    if (!currentSkill) return;

    const skillBaseDir = skillContentCacheRef.current.get(currentSkill)?.baseDir;

    // Convert absolute path to relative path for workspace API
    let basePath = skillBaseDir;
    if (basePath && basePath.startsWith('/')) {
      // Try to strip /Users/.../workspace-originos/ prefix
      const match = basePath.match(/originos\/(.+)$/);
      if (match) {
        basePath = match[1];
      }
    }

    // 打开 WorkspaceWindow — entryType + entryId, 路径由服务端解析
    const windowManager = AppWindowManager.getInstance();
    windowManager.openComponentWindow(
      `workspace-skill-${currentSkill}`,
      `技能目录: ${displaySkillName}`,
      WorkspaceWindow,
      {
        projectId: `skill-${currentSkill}`,
        projectName: displaySkillName,
        basePath,
        entryType: 'skill' as const,
        entryId: currentSkill,
      },
      {
        position: {
          width: 1200,
          height: 800,
        },
      }
    );
  }, [currentSkill, displaySkillName]);

  // Upload file state
  const [skillUploadedFiles, setSkillUploadedFiles] = useState<Array<{ name: string; size: number }>>([]);
  const [skillUploadError, setSkillUploadError] = useState<string | null>(null);
  const [skillUploading, setSkillUploading] = useState(false);

  const handleSkillFileUploaded = useCallback((files: UploadedFile[]) => {
    setSkillUploadedFiles(prev => [...prev, ...files.map(f => ({ name: f.name, size: f.size }))]);
    setSkillUploadError(null);
  }, []);

  const handleSkillFileError = useCallback((error: Error) => {
    setSkillUploadError(error.message);
    setTimeout(() => setSkillUploadError(null), 5000);
  }, []);

  const handleSkillUploadStateChange = useCallback((state: 'idle' | 'uploading' | 'done' | 'error') => {
    setSkillUploading(state === 'uploading');
  }, []);

  const handleSkillRemoveFile = useCallback((index: number) => {
    if (index === -1) {
      setSkillUploadError(null);
      return;
    }
    setSkillUploadedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Wrap sendMessage to include attachment info when sending, then clear chips
  const wrappedSendMessage = useCallback((content: string) => {
    if (skillUploadedFiles.length > 0) {
      const fileNames = skillUploadedFiles.map(f => f.name).join('、');
      const fileHint = `[附件: ${fileNames}]\n${content}`;
      setSkillUploadedFiles([]);
      handleSendMessage(fileHint);
    } else {
      handleSendMessage(content);
    }
  }, [skillUploadedFiles, handleSendMessage]);

  // 上传文件到技能目录（使用共享 hook）
  const handleUpload = useFileUpload({
    basePath: () => {
      if (!currentSkill) return null;
      const skillData = skillContentCacheRef.current.get(currentSkill);
      return skillData?.outputDir ?? skillData?.workingDir ?? currentSkillDirRef.current ?? skillData?.baseDir ?? null;
    },
    onUploaded: handleSkillFileUploaded,
    onError: handleSkillFileError,
    onStateChange: handleSkillUploadStateChange,
  });

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header with Skill Selector */}
      <div className="native-drag-region flex items-center justify-between px-4 py-3 border-b border-white/20 bg-transparent">
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => {
                loadSkillsList(); // 懒加载技能列表
                setShowSkillList(!showSkillList);
              }}
              className="native-no-drag flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <Play className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-900">
                {displaySkillName}
              </span>
            </button>

            {/* Skill Selector Dropdown */}
            {showSkillList && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto min-w-64">
                <div className="p-2">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    可用技能
                  </div>
                  {isLoadingSkillsList ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      <span className="ml-2 text-xs text-gray-400">加载中...</span>
                    </div>
                  ) : (
                    skills.map((skill) => (
                      <button
                        key={skill.code}
                        onClick={() => handleSkillSelect(skill.code)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          currentSkill === skill.code
                            ? 'bg-primary text-white'
                            : 'hover:bg-gray-100 text-gray-900'
                        }`}
                      >
                        <div className="font-medium">{skill.name}</div>
                        <div className="text-xs opacity-80 mt-0.5">{skill.description}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Session History Button */}
          <div className="native-no-drag relative">
            <button
              onClick={() => {
                const opening = !showHistory;
                setShowHistory(opening);
                if (opening) void loadSessionHistory(false);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              title="历史会话"
            >
              <Clock className="w-4 h-4 text-gray-600" />
              <span className="text-xs text-gray-500">
                {sessionHistory.length > 0 ? `${sessionHistory.length} 个会话` : ''}
              </span>
            </button>

            {/* Session History Dropdown */}
            {showHistory && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto min-w-72">
                <div className="p-2">
                  {/* 新建会话按钮 */}
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

                  {/* 分隔线 */}
                  <div className="h-px bg-gray-200 my-2" />

                  {/* 历史会话列表 */}
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
                      <button
                        key={session.sessionId}
                        onClick={() => void selectSession(session.sessionId)}
                        disabled={Boolean(switchingSessionId) || isRestoring}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-1 ${
                          session.sessionId === activeSessionId
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-gray-50 text-gray-700'
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
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="native-no-drag flex items-center gap-2">
          {currentSkill && isSkillExportAllowed(currentSkillSystemManaged) && (
            <EntryExportButton entryType="skill" entryId={currentSkill} />
          )}
          <button
            onClick={handleOpenDirectory}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="打开技能目录"
          >
            <FolderOpen className="w-4 h-4 text-gray-600" />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="技能说明"
          >
            <Info className="w-4 h-4 text-gray-600" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              title="关闭"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="relative flex-1 overflow-hidden">
        {!isInitialized ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">正在初始化技能...</p>
            </div>
          </div>
        ) : (
          <ChatMessageList
            footerContent={shouldShowAgentTaskPanel(taskRuntime.snapshot, taskRuntime.hasActiveTask) ? (
              <AgentTaskCard snapshot={taskRuntime.snapshot!} error={taskRuntime.error} pendingAction={taskRuntime.pendingAction} onControl={(action) => void taskRuntime.control(action)} />
            ) : undefined}
            messages={skillMessages.filter(m => m.role !== 'system') as import('@/components/ui/chat').ChatMessageItem[]}
            isLoading={!isInitialized}
            isThinking={isThinking}
            onQuestionAnswer={handleQuestionAnswer}
            answeredQuestions={answeredQuestions}
            skipIndices={initialMessageIndex >= 0 ? new Set([initialMessageIndex]) : new Set()}
            className="h-full"
            emptyState={
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-200 flex items-center justify-center">
                    <Play className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-sm">开始与 {currentSkill} 对话</p>
                </div>
              </div>
            }
          />
        )}
      </div>

      {/* Input Area */}
      <ChatInputBar
        onSubmit={wrappedSendMessage}
        disabled={!isInitialized || isThinking || isRestoring || Boolean(switchingSessionId) || taskRuntime.blocksChat}
        placeholder="输入你的指令..."
        onUpload={handleUpload}
        onStop={isThinking && !taskRuntime.blocksChat ? handleStop : undefined}
        isGenerating={isThinking}
        lightBg
        className="bg-transparent"
        uploadedFiles={skillUploadedFiles}
        onRemoveFile={handleSkillRemoveFile}
        uploadError={skillUploadError}
        uploading={skillUploading}
      />
      {taskRuntime.error && <div role="alert" className="px-4 py-2 text-sm text-red-600">任务功能暂不可用：{taskRuntime.error}</div>}
      {uiState.errorMessage && (
        <div className="px-4 py-2 text-sm text-red-500 bg-red-50">
          {uiState.errorMessage}
        </div>
      )}
    </div>
  );
}
