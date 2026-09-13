/**
 * OriginOS 主页面 - macOS/FluentOS 风格
 *
 * 全屏桌面布局，移除 OSFramework，使用 Dock 作为唯一底部导航
 *
 * 参考：Windows 11 Fluent OS + macOS
 */
/* eslint-disable react/function-component-definition */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable max-lines-per-function */
/* eslint-disable import/order */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-template */
/* eslint-disable curly */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */

'use client';

import * as React from 'react';
import { Settings, HelpCircle, Trash2, Sparkles, LayoutGrid, Network, Search, FolderOpen, Command, Clock3, Layers, Workflow, Star } from 'lucide-react';
import type { ProjectStatus, ProjectListItem } from '@originos/core/types';

import AgentInitializer from '@/components/os/AgentInitializer';
import { DesktopOnboarding } from '@/components/os/DesktopOnboarding';
import { SettingsDialog } from '@/components/os/settings/SettingsDialog';
import { openSenseCenter, PerceptionStatusButton } from '@/components/os/sense-center';
import AgentDialogContent from '@/components/os/agent-dialog/AgentDialogContent';
import Dock from '@/components/os/dock';
import NotificationBell from '@/components/os/notification/NotificationBell';
import { SystemNotificationToastHost } from '@/components/os/notification/SystemNotificationToastHost';
import type { SystemNotificationActivationTarget } from '@/components/os/notification/SystemNotificationToastHost';
import { ScheduleButton } from '@/components/os/schedules';
import { AppWindowContainer } from '@/components/os/window/AppWindowContainer';
import { WorkspaceWindow } from '@/components/os/workspace';
import { AppCard } from '@/components/framework/AppCard';
import { InterviewWindow } from '@/components/interview';
import { SandboxWindow } from '@/components/sandbox';
import { SkillDialog } from '@/components/skills';
import { SolutionDesign } from '@/components/solution/SolutionDesign';
import { Button } from '@/components/ui/button';
import { HOME_APPS } from '@/config/homeApps';
import { getIpcRenderer, isElectron } from '@originos/core/lib/integrations/electron/env';
import { IPC_CHANNELS } from '@originos/core/lib/integrations/electron/ipc-protocol';
import { subscribeToNativeWindowClosed } from '@originos/core/lib/integrations/electron/window';
import { normalizeRuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/client';
import { useProjects } from '@/lib/hooks/use-projects';
import { cn } from '@originos/core/lib/utils';
import { MultiAgentLauncher } from '@originos/core/modules/collaboration-runtime/ui/MultiAgentLauncher';
import { MarkdownContent, AskUserQuestionComponent, parseAskUserQuestion, removeYamlBlock } from '@/components/ui/chat-message';
import { ChatInputBar } from '@/components/ui/chat-input-bar';
import { useFileUpload } from '@/lib/hooks/use-file-upload';
import { AppWindowManager } from '@/services/AppWindowManager';
import useSandboxStore from '@/store/sandboxStore';
import { useSpotlightStore } from '@/store/spotlightStore';
import { listUserAgents, listUserSkills, deleteUserAgent, deleteUserSkill } from '@originos/core/lib/integrations/electron/services/user-registry';
import { deleteProject } from '@originos/core/lib/integrations/electron/services/project';
import type { SpotlightItem } from '@originos/core/types';
import { SpotlightItemType } from '@originos/core/types';
import { hasConfiguredLLM, useSettingsStore } from '@/store/settingsStore';
import { usePerceptionStore } from '@/store/perceptionStore';

// ============================================================================
// Types
// ============================================================================

interface ProjectCardProps {
  id: string;
  name: string;
  description: string;
  domain: string;
  lastModified: number;
  ontologySize: number;
  color: string;
  status?: string;
  hasSolution: boolean;
}

interface UserAgent {
  id: string;
  name: string;
  description: string;
  agentType: 'assistant' | 'role-agent' | 'unknown';
  role?: string;
  domain?: string;
  version?: string;
  dirPath?: string;
}

interface DockActionDetail {
  action: string;
  projectId?: string;
  skillId?: string;
  entryType?: string;
  entryId?: string;
  title?: string;
  appId?: string;
  agentId?: string;
  agentName?: string;
  agentType?: string;
  windowId?: string;
}

// ============================================================================
// Mock Data
// ============================================================================

const DESKTOP_WIDGETS = [
  { label: '工作区', value: 'Workspace', icon: FolderOpen },
  { label: '快捷指令', value: 'Command K', icon: Command },
];

function formatRelativeTime(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours < 1) {
    return '刚刚更新';
  }
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseNotificationActivationTarget(payload: unknown): SystemNotificationActivationTarget | null {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : null;
  const rawTarget = record && "activationTarget" in record
    ? record["activationTarget"]
    : record;
  const target = rawTarget && typeof rawTarget === 'object'
    ? rawTarget as Record<string, unknown>
    : null;
  if (!target) return null;
  const entryType = target["entryType"];
  const entryId = target["entryId"];
  const title = target["title"];
  const initialMessage = target["initialMessage"];
  if (
    (entryType === 'project' || entryType === 'agent' || entryType === 'role-agent' || entryType === 'skill') &&
    typeof entryId === 'string'
  ) {
    return {
      entryType,
      entryId,
      ...(typeof title === 'string' ? { title } : {}),
      ...(typeof initialMessage === 'string' ? { initialMessage } : {}),
    };
  }
  return null;
}

// ============================================================================
// Component: Welcome Section
// ============================================================================

function WelcomeSection({ onCreateProject }: {
  onCreateProject: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.35)] backdrop-blur-2xl md:p-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.2),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_32%)]" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center justify-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <Star className="h-3.5 w-3.5 text-amber-300" />
          桌面已就绪
        </div>

        <div className="w-24 h-24 mx-auto mb-8 rounded-[1.75rem] bg-gradient-to-br from-primary/30 via-sky-400/20 to-emerald-400/10 flex items-center justify-center border border-primary/30 shadow-[0_20px_60px_rgba(37,99,235,0.25)]">
          <div className="relative scale-[2]">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <div className="absolute -right-4 top-0 w-2 h-2 rounded-full bg-primary" />
            <div className="absolute -left-2 top-2 w-2 h-2 rounded-full bg-primary" />
            <div className="absolute -right-2 top-2 w-2 h-2 rounded-full bg-primary" />
          </div>
        </div>

        <h1 className="mb-3 text-4xl font-bold text-text-primary md:text-5xl">
          欢迎进入 OriginOS
        </h1>
        <p className="mb-8 max-w-2xl text-lg text-white/70 md:text-xl">
          这是一个可对话、可编排、可打开多个工作窗口的 AI Native 桌面。先创建一个项目，或者直接从应用启动器进入工作流。
        </p>

        <div className="mb-10 flex flex-wrap items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={onCreateProject}
            className="gap-2 rounded-2xl bg-primary px-6 text-primary-foreground shadow-[0_12px_40px_rgba(37,99,235,0.35)] hover:bg-primary/90"
          >
            <span className="text-xl">✦</span>
            创建项目
          </Button>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
            <Search className="h-4 w-4" />
            按下 Command/Ctrl + K 打开 Spotlight
          </div>
        </div>

        <div className="mx-auto mb-8 grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-2">
          {DESKTOP_WIDGETS.map((widget) => (
            <div key={widget.label} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-left backdrop-blur-xl">
              <widget.icon className="mb-3 h-5 w-5 text-primary" />
              <div className="text-xs uppercase tracking-[0.24em] text-white/45">{widget.label}</div>
              <div className="mt-1 text-base font-semibold text-white/90">{widget.value}</div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            document.querySelector('[data-tour="apps-section"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 transition-colors hover:border-primary/30 hover:bg-white/10"
        >
          <LayoutGrid className="h-4 w-4 text-primary" />
          打开应用启动器
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Component: Project Card
// ============================================================================

function ProjectCard({ project, onClick, onDelete, onSolutionDesign, onCollaborate }: {
  project: ProjectCardProps;
  onClick?: () => void;
  onDelete?: (projectId: string) => void;
  onSolutionDesign?: (projectId: string) => void;
  onCollaborate?: (projectId: string) => void;
}) {
  const isDraft = project.status === 'draft';
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(project.id);
    setShowDeleteConfirm(false);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:bg-white/[0.08]',
        'from-[var(--tw-gradient-from)] to-[var(--tw-gradient-to)] border-0'
      )}
      style={
        {
          '--tw-gradient-from': `${project.color}20`,
          '--tw-gradient-to': `${project.color}10`,
        } as React.CSSProperties
      }
    >
      {/* Draft Badge */}
      {isDraft && (
        <div className="absolute top-3 right-3 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-600 text-xs font-medium">
          访谈中
        </div>
      )}

      {/* Delete Confirmation Overlay */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3 z-10">
          <p className="text-white text-sm font-medium px-4 text-center">
            确定要删除项目 "{project.name}" 吗？
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmDelete}
              className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-medium"
            >
              删除
            </button>
            <button
              onClick={cancelDelete}
              className="px-4 py-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors text-sm font-medium"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* App Icon */}
      <div className="flex items-start justify-between mb-4">
        <div
          className={cn(
            'w-14 h-14 rounded-xl flex items-center justify-center text-3xl font-bold bg-gradient-to-br',
            'from-[var(--tw-gradient-from)] to-[var(--tw-gradient-to)]',
            'shadow-md'
          )}
          style={{
            '--tw-gradient-from': `${project.color}`,
            '--tw-gradient-to': `${project.color}88`,
          } as React.CSSProperties}
        >
          {isDraft ? '📝' : '📁'}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
            title="删除项目"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>

      {/* Project Info */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2 group-hover:text-primary transition-colors">
          {project.name}
        </h3>
        <p className="text-sm text-text-secondary mb-4 line-clamp-2 min-h-[2.5rem]">
          {project.description}
        </p>

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 21l-4.44-4.44M10.07 10.07l1.59 1.59" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
            </svg>
            {project.ontologySize} 节点
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="2" y="2" width="20" height="20" rx="2" strokeWidth={1.5} />
              <path d="M12 20v-2M10 14H6m12 4h-6m12-4h-4l-2 2" strokeWidth={1.5} />
            </svg>
            {formatRelativeTime(project.lastModified)}
          </span>
        </div>

        {/* Action Buttons */}
        {(onSolutionDesign || onCollaborate) && project.ontologySize > 0 && (
          <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
            {onCollaborate && project.hasSolution && (
              <button
                onClick={(e) => { e.stopPropagation(); onCollaborate(project.id); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 text-xs font-medium transition-colors"
              >
                <Network className="w-3.5 h-3.5" />
                多 Agent 协作
              </button>
            )}
            {onSolutionDesign && (
              <button
                onClick={(e) => { e.stopPropagation(); onSolutionDesign(project.id); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI 解决方案设计
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hover Effect */}
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="absolute inset-0 rounded-[1.75rem] bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}

// ============================================================================
// Component: App Center Section
// ============================================================================

// ============================================================================
// Component: Top Menu Bar
// ============================================================================

function TopMenuBar({ onOpenGuide, onOpenSettings }: { onOpenGuide: () => void; onOpenSettings: () => void }) {
  const [currentTime, setCurrentTime] = React.useState(new Date());
  const connectors = usePerceptionStore((state) => state.connectors);
  const health = usePerceptionStore((state) => state.health);
  const eventTraces = usePerceptionStore((state) => state.eventTraces);
  const perceptionLoading = usePerceptionStore((state) => state.loading);
  const perceptionError = usePerceptionStore((state) => state.error);
  const loadPerception = usePerceptionStore((state) => state.load);

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => { void loadPerception(); }, [loadPerception]);

  return (
    <>
    <div className="fixed top-0 left-0 right-0 z-40 h-10 px-4 flex items-center justify-between border-b border-white/10 bg-black/30 backdrop-blur-2xl">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">OriginOS</span>
        <div className="hidden items-center gap-2 text-xs text-white/50 md:flex">
          <Layers className="h-3.5 w-3.5" />
          Desktop Session
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65 md:flex">
          <Search className="h-3.5 w-3.5" />
          Spotlight
        </div>
        {/* Network status */}
        <div className="flex items-center text-white/80" title="离线">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 1 L15 15" />
            <path d="M2 4 L6 8" />
            <path d="M6 7 L10 11" />
            <path d="M10 10 L14 14" />
          </svg>
        </div>

        {/* Time */}
        <div className="flex items-center gap-2 text-xs text-white/80">
          <Clock3 className="h-3.5 w-3.5" />
          <span>{currentTime.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}</span>
          <span>{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Notifications */}
        <PerceptionStatusButton connectors={connectors} health={health} eventTraces={eventTraces} loading={perceptionLoading} error={perceptionError} onManage={openSenseCenter} />
        <NotificationBell />

        {/* System icons */}
        <div className="flex items-center gap-3">
          <ScheduleButton />
          <button data-tour="settings-button" className="text-white/80 hover:text-white transition-colors" title="设置" onClick={onOpenSettings}>
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button data-tour="help-guide" className="text-white/80 hover:text-white transition-colors" title="桌面引导" onClick={onOpenGuide}>
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function OSHomePage() {
  const llm = useSettingsStore((state) => state.llm);
  const getEffectiveConfig = useSettingsStore((state) => state.getEffectiveConfig);
  const llmConfigured = React.useMemo(() => hasConfiguredLLM(llm), [llm]);
  const llmConfig = React.useMemo(
    () => normalizeRuntimeLLMConfig(getEffectiveConfig()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getEffectiveConfig, llm],
  );

  // Hydration-safe Electron detection (false on server, true on client after mount)
  const [isElectronEnv, setIsElectronEnv] = React.useState(false);
  const [showDesktopOnboarding, setShowDesktopOnboarding] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [dockGuideHighlight, setDockGuideHighlight] = React.useState(false);
  React.useEffect(() => {
    setIsElectronEnv(isElectron());
  }, []);

  // Load user config to check onboarding status
  React.useEffect(() => {
    const loadUserConfig = async () => {
      try {
        const response = await fetch('/api/user-config');
        if (response.ok) {
          const result = await response.json();
          console.log('[DesktopOnboarding] API response:', result);

          const config = result.data || result;
          console.log('[DesktopOnboarding] Parsed config:', config);

          const showOnboarding = config.preferences?.showOnboarding ?? true;
          console.log('[DesktopOnboarding] User config loaded, showOnboarding:', showOnboarding, 'preferences:', config.preferences);

          if (showOnboarding) {
            console.log('[DesktopOnboarding] Showing onboarding (showOnboarding is true or undefined)');
            const timer = window.setTimeout(() => setShowDesktopOnboarding(true), 650);
            return () => window.clearTimeout(timer);
          } else {
            console.log('[DesktopOnboarding] Skipping onboarding (showOnboarding is false)');
          }
        } else {
          console.error('[DesktopOnboarding] API response not ok:', response.status);
        }
      } catch (error) {
        console.error('[DesktopOnboarding] Failed to load user config:', error);
        // Fallback: show onboarding if config load fails
        const timer = window.setTimeout(() => setShowDesktopOnboarding(true), 650);
        return () => window.clearTimeout(timer);
      }
      return undefined;
    };

    void loadUserConfig();
  }, []);

  const handleDismissOnboarding = React.useCallback(async () => {
    try {
      console.log('[DesktopOnboarding] Saving dismissed status to user-config');
      const response = await fetch('/api/user-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: { showOnboarding: false }
        }),
      });

      if (!response.ok) {
        console.error('[DesktopOnboarding] Failed to save onboarding status');
      }
    } catch (error) {
      console.error('[DesktopOnboarding] Error saving onboarding status:', error);
    }
  }, []);

  React.useEffect(() => {
    const handleDockGuideHighlight = (event: Event) => {
      const detail = (event as CustomEvent<{ highlighted?: boolean }>).detail;
      setDockGuideHighlight(Boolean(detail?.highlighted));
    };
    window.addEventListener('dock:guide-highlight-local', handleDockGuideHighlight);
    return () => window.removeEventListener('dock:guide-highlight-local', handleDockGuideHighlight);
  }, []);

  // User-created agents, skills
  const [userAgents, setUserAgents] = React.useState<UserAgent[]>([]);
  const [userSkills, setUserSkills] = React.useState<Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    skillName: string;
  }>>([]);

  // Load user agents and skills (extracted for re-fetch after delete)
  const loadUserAgents = React.useCallback(() => {
    listUserAgents()
      .then(result => {
        if (result.success) setUserAgents(result.data as UserAgent[]);
      })
      .catch(() => {});
  }, []);

  const loadUserSkills = React.useCallback(() => {
    listUserSkills()
      .then(result => {
        if (result.success) {
          const skills = (result.data || []) as Array<{ id: string; name: string; description: string }>;
          setUserSkills(skills.map((s) => ({
            id: `user-skill-${s.id}`,
            name: s.name,
            description: s.description,
            icon: '⚡',
            color: 'from-amber-500',
            skillName: s.id,
          })));
        }
      })
      .catch(() => {});
  }, []);

  // Delete handlers
  const handleDeleteAgent = React.useCallback(async (agentId: string) => {
    try {
      await deleteUserAgent(agentId);
      loadUserAgents();
    } catch (error) {
      console.error('[HomePage] Failed to delete agent:', error);
    }
  }, [loadUserAgents]);

  const handleDeleteSkill = React.useCallback(async (skillId: string) => {
    try {
      const rawId = skillId.replace('user-skill-', '');
      await deleteUserSkill(rawId);
      loadUserSkills();
    } catch (error) {
      console.error('[HomePage] Failed to delete skill:', error);
    }
  }, [loadUserSkills]);

  React.useEffect(() => {
    // Listen for dock actions
    const handleDockAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as DockActionDetail;
      console.log('[HomePage] dock:action received:', detail);
      const windowManager = AppWindowManager.getInstance();

      if (detail.action === 'create-project') {
        handleCreateProject();
        return;
      }
      if (detail.action === 'open-workspace') {
        const entryType = detail.entryType as string | undefined;
        const entryId = detail.entryId as string | undefined;
        if (entryType && entryId) {
          const windowManager = AppWindowManager.getInstance();
          windowManager.openComponentWindow(
            `workspace-${entryType}-${entryId}`,
            (detail.title as string) || entryId,
            WorkspaceWindow,
            { projectId: `${entryType}-${entryId}`, projectName: (detail.title as string) || entryId, entryType, entryId },
            {
              position: { width: 1200, height: 800 },
              constraints: { minWidth: 800, minHeight: 600 },
              metadata: { entryType: entryType, entryId, sessionId: `${entryType}-${entryId}`, projectId: `${entryType}-${entryId}` },
            }
          );
          return;
        }
        const targetProjectId = detail.projectId || projectsRef.current[0]?.id;
        if (targetProjectId) {
          handleOpenWorkspace(targetProjectId);
        }
        return;
      }
      if (detail.action === 'open-sense-center') {
        openSenseCenter();
        return;
      }
      if (detail.action === 'launch-skill' && detail.skillId) {
        const skillName = detail.skillId;
        windowManager.openComponentWindow(
          `skill-window-${skillName}`,
          `技能: ${skillName}`,
          SkillDialog,
          {
            skillName,
            initialMessage: '你好！有什么可以帮助你的吗？',
          },
          {
            position: { width: 1200, height: 800 },
            constraints: { minWidth: 600, minHeight: 400 },
            metadata: { entryType: 'skill', entryId: skillName, sessionId: `skill-${skillName}`, projectId: `skill-${skillName}` },
          }
        );
        return;
      }
      if (detail.action === 'launch-sandbox') {
        const appId = detail.appId as string | undefined;
        // If already open and a new appId is requested, update the active app
        if (appId && windowManager.isWindowOpen('sandbox')) {
          useSandboxStore.getState().setActiveApp(appId);
          windowManager.focusWindow('sandbox');
          return;
        }
        windowManager.openComponentWindow(
          'sandbox',
          '代码沙箱',
          SandboxWindow,
          appId ? { initialAppId: appId } : {},
          {
            position: { width: 1400, height: 900 },
            constraints: { minWidth: 600, minHeight: 400 },
            metadata: { entryType: 'sandbox', entryId: appId || 'sandbox', sessionId: 'sandbox', projectId: 'sandbox' },
          }
        );
        return;
      }
      if (detail.action === 'launch-agent' && detail.agentId) {
        const agentId = detail.agentId as string;
        const agentName = (detail.agentName as string) || agentId;
        const agentType = (detail.agentType as string) || 'role-agent';
        windowManager.openComponentWindow(
          `agent-dialog-${agentId}`,
          agentName,
          AgentDialogContent,
          { agentId, agentName, agentType },
          {
            position: { width: 800, height: 600 },
            constraints: { minWidth: 500, minHeight: 400 },
            metadata: { entryType: agentType, entryId: agentId, sessionId: agentId, projectId: agentId },
          }
        );
        return;
      }
      if (detail.action === 'focus-window' && detail.windowId) {
        windowManager.focusWindow(detail.windowId as string);
        return;
      }
    };
    window.addEventListener('dock:action', handleDockAction);
    return () => window.removeEventListener('dock:action', handleDockAction);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听原生窗口关闭事件，同步更新 dock 图标并刷新首页数据
  React.useEffect(() => {
    if (!isElectron()) return;
    return subscribeToNativeWindowClosed((windowId) => {
      AppWindowManager.getInstance().closeWindow(windowId);
      // 窗口关闭后刷新首页项目/Agent/技能列表
      loadUserAgents();
      loadUserSkills();
    });
  }, [loadUserAgents, loadUserSkills]);

  // Initial data load
  React.useEffect(() => {
    loadUserAgents();
    loadUserSkills();
  }, [loadUserAgents, loadUserSkills]);

  // 监听 SkillDialog 关闭事件，刷新 Agent 和技能列表
  React.useEffect(() => {
    const handleSessionClose = () => {
      loadUserAgents();
      loadUserSkills();
    };
    window.addEventListener('skill:session-close', handleSessionClose);
    return () => window.removeEventListener('skill:session-close', handleSessionClose);
  }, [loadUserAgents, loadUserSkills]);

  // Project management
  const {
    projects,
    isLoading: isLoadingProjects,
    loadProjects,
    createProject,
  } = useProjects({
    autoLoad: true,
    query: {}, // Load all projects (both draft and active)
    refreshInterval: -1, // Disable polling
  });

  React.useEffect(() => {
    const handleProjectUpdated = () => {
      loadProjects();
    };

    window.addEventListener('project:updated', handleProjectUpdated);
    return () => window.removeEventListener('project:updated', handleProjectUpdated);
  }, [loadProjects]);

  React.useEffect(() => {
    if (!isElectron()) {
      return;
    }

    const ipc = getIpcRenderer();
    return ipc.on(IPC_CHANNELS.PROJECT_EVENT, (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const eventType = 'type' in payload ? payload.type : undefined;
      if (eventType === 'project_updated') {
        loadProjects();
      }
    });
  }, [loadProjects]);

  // Ref for projects to avoid initialization order in dock action handler
  const projectsRef = React.useRef<ProjectListItem[]>([]);
  React.useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const handleCreateProject = async () => {
    console.log('[HomePage] Opening interview window');
    const windowManager = AppWindowManager.getInstance();

    // Generate unique session ID and temp project name
    const timestamp = Date.now();
    const sessionId = `project-initialization-${timestamp}`;
    const tempName = `新项目 ${new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    // Calculate 80% of viewport width
    const viewportWidth = window.innerWidth;
    const windowWidth = Math.round(viewportWidth * 0.8);
    const windowHeight = Math.round(window.innerHeight * 0.8);

    // Immediately create a temporary project with draft status
    let projectId: string | undefined;
    try {
      const project = await createProject({
        name: tempName,
        description: '正在进行项目访谈...',
        domain: '待确定',
      });
      projectId = project.id;
      console.log('[HomePage] Temp project created:', projectId);
    } catch (err) {
      console.error('[HomePage] Failed to create temp project:', err);
    }

    windowManager.openComponentWindow(
      `project-interview-${projectId}`,
      tempName,
      InterviewWindow,
      {
        projectId,
        sessionId,
        projectName: tempName,
        onComplete: (result: any) => {
          console.log('[HomePage] Interview completed:', result);
          loadProjects();
          // Don't auto-close window - let user close manually
          // windowManager.closeWindow('project-interview');
        }
      },
      {
        position: {
          width: windowWidth,
          height: windowHeight,
        },
        constraints: {
          minWidth: 800,
          minHeight: 600,
        },
        metadata: { entryType: 'project', entryId: projectId, sessionId },
      }
    );
  };

  const handleSkillLaunch = (skillName: string, name: string, initialMessage?: string) => {
    console.log('[HomePage] Opening skill:', skillName);
    const windowManager = AppWindowManager.getInstance();

    windowManager.openComponentWindow(
      `skill-${skillName}`,
      name,
      SkillDialog,
      {
        skillName,
        initialMessage: initialMessage?.trim() || '你好！我是' + name.split(' ')[0] + '助手，有什么可以帮助你的吗？',
      },
      {
        position: {
          width: 1200,
          height: 800,
        },
        constraints: {
          minWidth: 600,
          minHeight: 400,
        },
        metadata: { entryType: 'skill', entryId: skillName, sessionId: `skill-${skillName}`, projectId: `skill-${skillName}` },
      }
    );
  };

  const handleOpenWorkspace = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    const projectName = project?.name || '项目';
    const ontologyId = (project as any)?.ontologyId;

    const windowManager = AppWindowManager.getInstance();

    windowManager.openComponentWindow(
      `workspace-${projectId}`,
      projectName,
      WorkspaceWindow,
      {
        projectId,
        projectName,
        ontologyId,
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
        metadata: { entryType: 'project', entryId: projectId, sessionId: `workspace-${projectId}`, projectId },
      }
    );
  };

  const handleNotificationActivation = React.useCallback((target: SystemNotificationActivationTarget) => {
    if (target.entryType === 'project') {
      if (target.initialMessage?.trim()) {
        const project = projects.find((item) => item.id === target.entryId);
        const projectName = target.title ?? project?.name ?? target.entryId;
        const windowManager = AppWindowManager.getInstance();
        windowManager.openComponentWindow(
          `project-agent-${target.entryId}`,
          projectName,
          AgentDialogContent,
          {
            agentId: target.entryId,
            agentName: projectName,
            agentType: 'project',
            initialMessage: target.initialMessage,
          },
          {
            position: { width: 900, height: 680 },
            metadata: { entryType: 'project', entryId: target.entryId, sessionId: target.entryId, projectId: target.entryId },
          }
        );
        return;
      }
      void handleOpenWorkspace(target.entryId);
      return;
    }

    if (target.entryType === 'skill') {
      handleSkillLaunch(target.entryId, target.title ?? target.entryId, target.initialMessage);
      return;
    }

    const agent = userAgents.find((item) => item.id === target.entryId);
    const agentType = target.entryType === 'role-agent'
      ? 'role-agent'
      : agent?.agentType ?? 'assistant';
    const agentName = target.title ?? agent?.name ?? target.entryId;
    const windowManager = AppWindowManager.getInstance();
    windowManager.openComponentWindow(
      `agent-dialog-${target.entryId}`,
      agentName,
      AgentDialogContent,
      { agentId: target.entryId, agentName, agentType, initialMessage: target.initialMessage },
      {
        position: { width: 800, height: 600 },
        metadata: { entryType: target.entryType, entryId: target.entryId, sessionId: target.entryId, projectId: target.entryId },
      }
    );
  }, [handleOpenWorkspace, handleSkillLaunch, projects, userAgents]);

  React.useEffect(() => {
    const handleNotificationPanelActivation = (event: Event) => {
      const target = parseNotificationActivationTarget((event as CustomEvent<unknown>).detail);
      if (target) {
        handleNotificationActivation(target);
      }
    };
    window.addEventListener('originos:notification-activate', handleNotificationPanelActivation);
    return () => window.removeEventListener('originos:notification-activate', handleNotificationPanelActivation);
  }, [handleNotificationActivation]);

  React.useEffect(() => {
    if (!isElectron()) {
      return;
    }

    const ipc = getIpcRenderer();
    const unsubscribeQuickLauncher = ipc.on('show-quick-launcher', () => {
      useSpotlightStore.getState().toggle();
    });
    const unsubscribeToggleSpotlight = ipc.on('toggle-spotlight', () => {
      useSpotlightStore.getState().toggle();
    });
    const unsubscribeOpenProject = ipc.on('open-project', (payload: unknown) => {
      if (
        payload &&
        typeof payload === 'object' &&
        'projectId' in payload &&
        typeof payload.projectId === 'string'
      ) {
        void handleOpenWorkspace(payload.projectId);
      }
    });
    const unsubscribeNotificationClick = ipc.on(IPC_CHANNELS.NOTIFICATION_CLICK, (payload: unknown) => {
      const target = parseNotificationActivationTarget(payload);
      if (target) {
        handleNotificationActivation(target);
      }
    });

    // Listen for dock actions via IPC (Electron) or BroadcastChannel (Web)
    const unsubscribeDockAction = ipc.on(IPC_CHANNELS.DOCK_ACTION, (detail: unknown) => {
      if (detail && typeof detail === 'object') {
        window.dispatchEvent(new CustomEvent('dock:action', { detail }));
      }
    });

    // Listen for dock actions broadcast from the dedicated Dock BrowserWindow (Web fallback)
    const dockChannel = new BroadcastChannel('originos-dock-actions');
    const handleDockMessage = (event: MessageEvent<{ type: string; payload?: unknown }>) => {
      const { type, payload } = event.data;
      if (type === 'spotlight:open') {
        useSpotlightStore.getState().open();
      } else if (type === 'project:open' && payload && typeof payload === 'object' && 'projectId' in payload) {
        void handleOpenWorkspace((payload as { projectId: string }).projectId);
      }
    };
    dockChannel.addEventListener('message', handleDockMessage);

    return () => {
      unsubscribeQuickLauncher();
      unsubscribeToggleSpotlight();
      unsubscribeOpenProject();
      unsubscribeNotificationClick();
      unsubscribeDockAction();
      dockChannel.removeEventListener('message', handleDockMessage);
      dockChannel.close();
    };
  }, [handleOpenWorkspace, handleNotificationActivation]);

  const handleOpenProjectInterview = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    const projectName = project?.name || '项目';
    const ontologyId = (project as any)?.ontologyId;

    const windowManager = AppWindowManager.getInstance();

    // Use the project ID as session ID for existing projects
    const sessionId = `project-${projectId}`;

    // Calculate 80% of viewport width
    const viewportWidth = window.innerWidth;
    const windowWidth = Math.round(viewportWidth * 0.8);
    const windowHeight = Math.round(window.innerHeight * 0.8);

    windowManager.openComponentWindow(
      `project-interview-${projectId}`,
      projectName,
      InterviewWindow,
      {
        projectId,
        sessionId,
        projectName,
        ontologyId,
        onComplete: (result: any) => {
          console.log('[HomePage] Interview completed:', result);
          loadProjects();
        }
      },
      {
        position: {
          width: windowWidth,
          height: windowHeight,
        },
        constraints: {
          minWidth: 800,
          minHeight: 600,
        },
        metadata: { entryType: 'project', entryId: projectId, sessionId, projectId },
      }
    );
  };

  const handleOpenSolutionDesign = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    const projectName = project?.name || '项目';
    const ontologyId = (project as any)?.ontologyId;

    const windowManager = AppWindowManager.getInstance();
    windowManager.openComponentWindow(
      `solution-design-${projectId}`,
      `${projectName} · AI 解决方案`,
      SolutionDesign,
      {
        projectId,
        projectName,
        ontologyId,
      },
      {
        position: { width: 900, height: 700 },
        constraints: { minWidth: 700, minHeight: 500 },
        metadata: { entryType: 'solution', entryId: projectId, sessionId: `solution-${projectId}`, projectId },
      }
    );
  };

  const handleOpenCollaboration = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    const projectName = project?.name || '项目';

    const windowManager = AppWindowManager.getInstance();
    windowManager.openComponentWindow(
      `collaboration-${projectId}`,
      `${projectName} · 多 Agent 协作`,
      MultiAgentLauncher,
      {
        projectId,
        projectName,
        llmConfig,
        uiDeps: {
          MarkdownContent,
          ChatInputBar,
          AskUserQuestionComponent,
          parseAskUserQuestion,
          removeYamlBlock,
          useFileUpload,
        },
      },
      {
        position: { width: 1300, height: 800 },
        constraints: { minWidth: 900, minHeight: 600 },
        metadata: { entryType: 'collaboration', entryId: projectId, sessionId: `collaboration-${projectId}`, projectId },
      }
    );
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const result = await deleteProject(projectId);
      if (!result.success) throw new Error('Failed to delete project');

      console.log('[HomePage] Project deleted:', projectId);
      // Reload projects list
      loadProjects();
    } catch (error) {
      console.error('[HomePage] Error deleting project:', error);
      // You could add a toast notification here
    }
  };

  const projectCount = projects.length;
  const activeProjectCount = projects.filter((project) => project.status !== ('draft' as ProjectStatus)).length;
  const draftProjectCount = projects.filter((project) => project.status === ('draft' as ProjectStatus)).length;
  const recentProject = [...projects].sort((a, b) => b.lastModified - a.lastModified)[0];

  const spotlightItems = React.useMemo<SpotlightItem[]>(() => {
    const staticItems: SpotlightItem[] = [
      {
        id: 'spotlight-create-project',
        type: SpotlightItemType.COMMAND,
        title: '创建项目',
        subtitle: '打开项目访谈窗口并开始初始化',
        icon: '➕',
        shortcut: 'Enter',
        action: () => handleCreateProject(),
        keywords: ['create', 'project', '项目', '新建', '访谈'],
      },
      {
        id: 'spotlight-open-workspace',
        type: SpotlightItemType.COMMAND,
        title: '打开工作区',
        subtitle: '进入最近的项目工作区',
        icon: '🗂️',
        action: () => {
          const firstProject = projects[0];
          if (firstProject) {
            void handleOpenWorkspace(firstProject.id);
          }
        },
        keywords: ['workspace', '工作区', '文件'],
      },
      {
        id: 'spotlight-open-sandbox',
        type: SpotlightItemType.APP,
        title: '代码沙箱',
        subtitle: '打开代码沙箱窗口',
        icon: '🧪',
        action: () => {
          const windowManager = AppWindowManager.getInstance();
          windowManager.openComponentWindow(
            'sandbox',
            '代码沙箱',
            SandboxWindow,
            {},
            {
              position: { width: 1400, height: 900 },
              constraints: { minWidth: 600, minHeight: 400 },
            }
          );
        },
        keywords: ['sandbox', '沙箱', '代码'],
      },
      {
        id: 'spotlight-help',
        type: SpotlightItemType.APP,
        title: '帮助文档',
        subtitle: '查看使用指南',
        icon: '❓',
        action: () => console.log('Open Help'),
        keywords: ['help', '帮助', '文档'],
      },
    ];

    const appItems: SpotlightItem[] = HOME_APPS.map((app) => ({
      id: `spotlight-app-${app.id}`,
      type: SpotlightItemType.APP,
      title: app.name,
      subtitle: app.description,
      icon: app.icon,
      action: () => {
        if (app.type === 'skill' && isNonEmptyString(app.skillName)) {
          handleSkillLaunch(app.skillName, app.name);
          return;
        }
        if (app.action === 'create-agent') {
          handleCreateProject();
          return;
        }
        if (app.action === 'open-workspace') {
          const firstProject = projects[0];
          if (firstProject) {
            void handleOpenWorkspace(firstProject.id);
          }
          return;
        }
        if (app.action === 'open-sense-center') {
          openSenseCenter();
        }
      },
      keywords: [app.id, app.name, app.description, app.type],
    }));

    const projectItems: SpotlightItem[] = projects.map((project) => ({
      id: `spotlight-project-${project.id}`,
      type: SpotlightItemType.COMMAND,
      title: project.name,
      subtitle: `${project.description} · ${project.status === ('draft' as ProjectStatus) ? '继续访谈' : '打开工作区'}`,
      icon: project.status === ('draft' as ProjectStatus) ? '📝' : '📁',
      action: () => {
        if (project.status === ('draft' as ProjectStatus)) {
          void handleOpenProjectInterview(project.id);
          return;
        }
        void handleOpenWorkspace(project.id);
      },
      keywords: [project.domain, project.description, '项目', 'project'],
    }));

    const agentItems: SpotlightItem[] = userAgents.map((agent) => ({
      id: `spotlight-agent-${agent.id}`,
      type: SpotlightItemType.AGENT,
      title: agent.name,
      subtitle: agent.description,
      icon: agent.agentType === 'role-agent' ? '🎭' : '🤖',
      action: () => {
        const windowManager = AppWindowManager.getInstance();
        windowManager.openComponentWindow(
          `agent-dialog-${agent.id}`,
          agent.name,
          AgentDialogContent,
          { agentId: agent.id, agentName: agent.name, agentType: agent.agentType },
          {
            position: { width: 800, height: 600 },
            metadata: { entryType: agent.agentType || 'agent', entryId: agent.id, sessionId: agent.id, projectId: agent.id },
          }
        );
      },
      keywords: [agent.agentType, agent.description, agent.role, agent.domain].filter(isNonEmptyString),
    }));

    const skillItems: SpotlightItem[] = userSkills.map((skill) => ({
      id: `spotlight-skill-${skill.id}`,
      type: SpotlightItemType.APP,
      title: skill.name,
      subtitle: skill.description,
      icon: skill.icon,
      action: () => handleSkillLaunch(skill.skillName, skill.name),
      keywords: [skill.name, skill.description, skill.skillName],
    }));

    return [...staticItems, ...appItems, ...projectItems, ...agentItems, ...skillItems];
  }, [projects, userAgents, userSkills]);

  const { setItems } = useSpotlightStore();
  React.useEffect(() => {
    setItems(spotlightItems);
  }, [spotlightItems, setItems]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050816]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.18),transparent_28%),radial-gradient(circle_at_80%_18%,rgba(34,197,94,0.12),transparent_26%),radial-gradient(circle_at_50%_80%,rgba(56,189,248,0.12),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:32px_32px]" />
      {/* Top Menu Bar */}
      <TopMenuBar
        onOpenGuide={() => setShowDesktopOnboarding(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div data-tour="desktop-overview" className={`group pointer-events-auto absolute left-4 z-30 hidden xl:block ${isElectronEnv ? 'top-16' : 'top-20'}`}>
        <div className="relative">
          <div className="flex h-28 w-12 flex-col items-center gap-2 rounded-3xl border border-white/10 bg-black/25 p-3 text-white/55 shadow-[0_20px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl transition-colors duration-200 group-hover:border-white/20 group-hover:bg-black/35">
            <Layers className="h-4 w-4" />
            <span className="mt-1 [writing-mode:vertical-rl] text-[10px] uppercase tracking-[0.22em]">系统概览</span>
          </div>
          <div className="pointer-events-none absolute left-14 top-0 w-52 translate-x-2 rounded-3xl border border-white/10 bg-black/35 p-4 opacity-0 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100">
            <div className="mb-3 text-[11px] uppercase tracking-[0.24em] text-white/45">系统概览</div>
            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold text-white">{projectCount}</div>
                <div className="text-xs text-white/55">项目总数</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{userAgents.length}</div>
                <div className="text-xs text-white/55">已安装 Agent</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{userSkills.length + HOME_APPS.length}</div>
                <div className="text-xs text-white/55">可启动应用</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`group pointer-events-auto absolute right-4 z-30 hidden xl:block ${isElectronEnv ? 'top-16' : 'top-24'}`}>
        <div className="relative">
          <div className="ml-auto flex h-28 w-12 flex-col items-center gap-2 rounded-3xl border border-white/10 bg-black/25 p-3 text-white/55 shadow-[0_20px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl transition-colors duration-200 group-hover:border-white/20 group-hover:bg-black/35">
            <Workflow className="h-4 w-4" />
            <span className="mt-1 [writing-mode:vertical-rl] text-[10px] uppercase tracking-[0.22em]">工作队列</span>
          </div>
          <div className="pointer-events-none absolute right-14 top-0 w-64 -translate-x-2 rounded-3xl border border-white/10 bg-black/35 p-4 opacity-0 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/45">
              <Workflow className="h-3.5 w-3.5" />
              工作队列
            </div>
            <div className="space-y-3 text-sm text-white/75">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <span>活跃项目</span>
                <span className="shrink-0 font-semibold text-white">{activeProjectCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <span>访谈草稿</span>
                <span className="shrink-0 font-semibold text-white">{draftProjectCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <span className="shrink-0">最近访问</span>
                <span className="max-w-[8rem] truncate text-right font-semibold text-white">
                  {recentProject?.name ?? '无'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Centered Desktop Layout */}
      <div data-tour="main-content" className={`absolute inset-0 px-4 pb-24 md:px-8 xl:px-20 2xl:px-24 ${isElectronEnv ? 'pt-4' : 'pt-12'}`}>
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-[1800px] py-8">
            {/* Welcome Section - Show when no projects */}
            {!isLoadingProjects && projects.length === 0 && (
              <div data-tour="welcome-section">
                <WelcomeSection onCreateProject={handleCreateProject} />
              </div>
            )}

            {/* Projects Section */}
            {!isLoadingProjects && projects.length > 0 && (
              <>
                <section data-tour="projects-section" className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:p-8">
                  <div className="mb-8 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.22em] text-white/55">
                        <FolderOpen className="h-3.5 w-3.5" />
                        Workspace Hub
                      </div>
                      <h2 className="text-3xl font-bold text-text-primary md:text-4xl">
                        我的项目桌面
                      </h2>
                      <p className="mt-2 text-white/65">
                        {projects.length} 个项目已加载。双击卡片可继续访谈，或从 Dock 打开工作区。
                      </p>
                    </div>
                    <Button onClick={handleCreateProject} variant="default" size="lg" className="rounded-2xl px-6">
                      + 创建新项目
                    </Button>
                  </div>

                  <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                      <div className="text-xs uppercase tracking-[0.22em] text-white/45">活跃项目</div>
                      <div className="mt-3 text-4xl font-bold text-white">{activeProjectCount}</div>
                      <div className="mt-2 text-sm text-white/55">已完成访谈并可进入工作区</div>
                    </div>
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                      <div className="text-xs uppercase tracking-[0.22em] text-white/45">待继续访谈</div>
                      <div className="mt-3 text-4xl font-bold text-white">{draftProjectCount}</div>
                      <div className="mt-2 text-sm text-white/55">草稿项目仍会保留在桌面上</div>
                    </div>
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
                      <div className="text-xs uppercase tracking-[0.22em] text-white/45">最近更新</div>
                      <div className="mt-3 text-xl font-semibold text-white">{recentProject?.name ?? '暂无项目'}</div>
                      <div className="mt-2 text-sm text-white/55">{recentProject ? formatRelativeTime(recentProject.lastModified) : '创建后将显示在这里'}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {projects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project as ProjectCardProps}
                        onClick={() => handleOpenProjectInterview(project.id)}
                        onDelete={handleDeleteProject}
                        onSolutionDesign={handleOpenSolutionDesign}
                        onCollaborate={handleOpenCollaboration}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}

            {!isLoadingProjects && (
              <>
                {/* Home Apps Section */}
                <section data-tour="apps-section" className="mb-12 rounded-[2rem] border border-white/10 bg-black/20 p-6 backdrop-blur-2xl md:p-8">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-text-primary">
                        应用启动器
                      </h2>
                      <p className="mt-1 text-sm text-white/55">像桌面应用抽屉一样管理你的内置工具与入口</p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {HOME_APPS.length} 个应用
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {HOME_APPS.map((app) => (
                      <AppCard
                        key={app.id}
                        id={app.id}
                        name={app.name}
                        description={app.description}
                        icon={app.icon}
                        color={app.color}
                        dockType={app.type}
                        skillName={app.skillName}
                        onClick={() => {
                          if (app.type === 'skill' && app.skillName) {
                            handleSkillLaunch(app.skillName, app.name);
                          } else if (app.action === 'create-agent') {
                            handleCreateProject();
                          } else if (app.action === 'open-workspace') {
                            const firstProject = projects[0];
                            if (firstProject) {
                              handleOpenWorkspace(firstProject.id);
                            }
                          } else if (app.action === 'open-sense-center') {
                            openSenseCenter();
                          }
                        }}
                        action="launch"
                        tourId={app.id}
                      />
                    ))}
                  </div>
                </section>

                {/* User-created Agents Section */}
                {userAgents.filter(a => a.agentType === 'assistant' || a.agentType === 'unknown').length > 0 && (
                  <section data-tour="agents-section" className="mb-12 rounded-[2rem] border border-white/10 bg-black/20 p-6 backdrop-blur-2xl md:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-semibold text-text-primary">
                        AI 助手
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {userAgents.filter(a => a.agentType === 'assistant' || a.agentType === 'unknown').length} 个助手
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {userAgents.filter(a => a.agentType === 'assistant' || a.agentType === 'unknown').map((agent) => (
                        <AppCard
                          key={agent.id}
                          id={agent.id}
                          name={agent.name}
                          description={agent.description}
                          icon="🤖"
                          color="from-cyan-500"
                          onClick={() => {
                            const windowManager = AppWindowManager.getInstance();
                            windowManager.openComponentWindow(
                              `agent-dialog-${agent.id}`,
                              agent.name,
                              AgentDialogContent,
                              { agentId: agent.id, agentName: agent.name, agentType: agent.agentType },
                              { position: { width: 800, height: 600 }, metadata: { entryType: agent.agentType || 'agent', entryId: agent.id, sessionId: agent.id, projectId: agent.id } }
                            );
                          }}
                          action="launch"
                          onDelete={() => handleDeleteAgent(agent.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* User-created Role Agents Section */}
                {userAgents.filter(a => a.agentType === 'role-agent').length > 0 && (
                  <section data-tour="agents-section" className="mb-12 rounded-[2rem] border border-white/10 bg-black/20 p-6 backdrop-blur-2xl md:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-semibold text-text-primary">
                        角色助手
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {userAgents.filter(a => a.agentType === 'role-agent').length} 个角色
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {userAgents.filter(a => a.agentType === 'role-agent').map((agent) => (
                        <AppCard
                          key={agent.id}
                          id={agent.id}
                          name={agent.name}
                          description={agent.description}
                          icon="🎭"
                          color="from-violet-500"
                          onClick={() => {
                            const windowManager = AppWindowManager.getInstance();
                            windowManager.openComponentWindow(
                              `agent-dialog-${agent.id}`,
                              agent.name,
                              AgentDialogContent,
                              { agentId: agent.id, agentName: agent.name, agentType: 'role-agent' },
                              { position: { width: 800, height: 600 }, metadata: { entryType: 'role-agent', entryId: agent.id, sessionId: agent.id, projectId: agent.id } }
                            );
                          }}
                          action="launch"
                          onDelete={() => handleDeleteAgent(agent.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* User-created Skills Section */}
                {userSkills.length > 0 && (
                  <section data-tour="skills-section" className="mb-12 rounded-[2rem] border border-white/10 bg-black/20 p-6 backdrop-blur-2xl md:p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-2xl font-semibold text-text-primary">
                        自定义技能
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {userSkills.length} 个技能
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {userSkills.map((skill) => (
                        <AppCard
                          key={skill.id}
                          id={skill.id}
                          name={skill.name}
                          description={skill.description}
                          icon={skill.icon}
                          color={skill.color}
                          onClick={() => handleSkillLaunch(skill.skillName, skill.name)}
                          action="launch"
                          onDelete={() => handleDeleteSkill(skill.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Dock - Fixed at center (web only; Electron uses dedicated BrowserWindow) */}
      {!isElectronEnv && <Dock forceExpanded={dockGuideHighlight} />}

      {/* App Window Container */}
      <AppWindowContainer />
      <SystemNotificationToastHost onActivate={handleNotificationActivation} />

      <DesktopOnboarding
        open={showDesktopOnboarding}
        projectCount={projectCount}
        agentCount={userAgents.length}
        skillCount={userSkills.length + HOME_APPS.filter(app => app.type === 'skill').length}
        llmConfigured={llmConfigured}
        isElectron={isElectronEnv}
        onOpenSettings={() => setShowSettings(true)}
        onClose={() => setShowDesktopOnboarding(false)}
        onDismiss={handleDismissOnboarding}
      />

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <AgentInitializer />
    </div>
  );
}
