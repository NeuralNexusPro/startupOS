/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prefer-template */
/* eslint-disable curly */
// 首页桌面布局 JSX（顶栏/系统概览/工作队列/主内容区块/窗体容器挂载）的展示组件。
'use client';

import * as React from 'react';
import { Settings, HelpCircle, Clock3, Layers, Workflow, Search, FolderOpen } from 'lucide-react';

import { WelcomeSection } from './welcome-section';
import type { ProjectCardProps } from './project-card';
import { ProjectCard, formatRelativeTime } from './project-card';

import AgentDialogContent from '@/components/os/agent-dialog/AgentDialogContent';
import AgentInitializer from '@/components/os/AgentInitializer';
import { DesktopOnboarding } from '@/components/os/DesktopOnboarding';
import { SettingsDialog } from '@/components/os/settings/SettingsDialog';
import { openSenseCenter, PerceptionStatusButton } from '@/components/os/sense-center';
import Dock from '@/components/os/dock';
import NotificationBell from '@/components/os/notification/NotificationBell';
import { SystemNotificationToastHost } from '@/components/os/notification/SystemNotificationToastHost';
import { ScheduleButton } from '@/components/os/schedules';
import { AppWindowContainer } from '@/components/os/window/AppWindowContainer';
import { AppCard } from '@/components/framework/AppCard';
import { Button } from '@/components/ui/button';
import { HOME_APPS } from '@/config/homeApps';
import { AppWindowManager } from '@/services/AppWindowManager';
import { usePerceptionStore } from '@/store/perceptionStore';

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
// Component: Desktop Layout
// ============================================================================

export function DesktopLayout(input: {
  isElectronEnv: boolean;
  dockGuideHighlight: boolean;
  projectCount: number;
  activeProjectCount: number;
  draftProjectCount: number;
  recentProject?: { id: string; name: string; lastModified: number };
  projects: Array<ProjectCardProps & { id: string }>;
  userAgents: Array<{ id: string; name: string; description: string; agentType: 'assistant' | 'role-agent' | 'unknown' }>;
  userSkills: Array<{ id: string; name: string; description: string; icon: string; color: string; skillName: string }>;
  llmConfigured: boolean;
  showDesktopOnboarding: boolean;
  setShowDesktopOnboarding: (open: boolean) => void;
  showSettings: boolean;
  setShowSettings: (open: boolean) => void;
  handleDismissOnboarding: () => void | Promise<void>;
  isLoadingProjects: boolean;
  handleCreateProject: () => void | Promise<void>;
  handleDeleteAgent: (agentId: string) => void | Promise<void>;
  handleDeleteSkill: (skillId: string) => void | Promise<void>;
  handleSkillLaunch: (skillName: string, name: string, initialMessage?: string) => void;
  handleOpenWorkspace: (projectId: string) => void | Promise<void>;
  handleNotificationActivation: (target: { entryType: string; entryId: string; title?: string; initialMessage?: string }) => void;
  handleOpenProjectInterview: (projectId: string) => void | Promise<void>;
  handleOpenSolutionDesign: (projectId: string) => void;
  handleOpenCollaboration: (projectId: string) => void;
  handleDeleteProject: (projectId: string) => void | Promise<void>;
}) {
  const {
    isElectronEnv,
    dockGuideHighlight,
    projectCount,
    activeProjectCount,
    draftProjectCount,
    recentProject,
    projects,
    userAgents,
    userSkills,
    llmConfigured,
    showDesktopOnboarding,
    setShowDesktopOnboarding,
    showSettings,
    setShowSettings,
    handleDismissOnboarding,
    isLoadingProjects,
    handleCreateProject,
    handleDeleteAgent,
    handleDeleteSkill,
    handleSkillLaunch,
    handleOpenWorkspace,
    handleNotificationActivation,
    handleOpenProjectInterview,
    handleOpenSolutionDesign,
    handleOpenCollaboration,
    handleDeleteProject,
  } = input;

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
