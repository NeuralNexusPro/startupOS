/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable max-lines-per-function */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prefer-template */
/* eslint-disable curly */
/* eslint-disable react-hooks/exhaustive-deps */
// 首页全部窗口编排 handler 与全局事件/IPC 副作用订阅 hook。
'use client';

import * as React from 'react';
import type { ProjectStatus, ProjectListItem, SpotlightItem } from '@originos/core/types';
import { SpotlightItemType } from '@originos/core/types';

import AgentDialogContent from '@/components/os/agent-dialog/AgentDialogContent';
import { openSenseCenter } from '@/components/os/sense-center';
import type { SystemNotificationActivationTarget } from '@/components/os/notification/SystemNotificationToastHost';
import { WorkspaceWindow } from '@/components/os/workspace';
import { InterviewWindow } from '@/components/interview';
import { SandboxWindow } from '@/components/sandbox';
import { SkillDialog } from '@/components/skills';
import { SolutionDesign } from '@/components/solution/SolutionDesign';
import { HOME_APPS } from '@/config/homeApps';
import { getIpcRenderer, isElectron, IPC_CHANNELS } from '@originos/core/lib/integrations/electron';
import { subscribeToNativeWindowClosed } from '@originos/core/lib/integrations/electron/window';
import { deleteProject } from '@originos/core/lib/integrations/electron/services/project';
import { deleteUserAgent, deleteUserSkill } from '@originos/core/lib/integrations/electron/services/user-registry';
import { MultiAgentLauncher } from '@originos/core/modules/collaboration-runtime/ui/MultiAgentLauncher';
import { MarkdownContent, AskUserQuestionComponent, parseAskUserQuestion, removeYamlBlock } from '@/components/ui/chat-message';
import { ChatInputBar } from '@/components/ui/chat-input-bar';
import { useFileUpload } from '@/lib/hooks/use-file-upload';
import { AppWindowManager } from '@/services/AppWindowManager';
import useSandboxStore from '@/store/sandboxStore';
import { useSpotlightStore } from '@/store/spotlightStore';

import type { UserAgent } from './use-home-state';

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

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function useHomeHandlers(input: {
  projects: ProjectListItem[];
  projectsRef: React.RefObject<ProjectListItem[] | null>;
  userAgents: UserAgent[];
  userSkills: Array<{ id: string; name: string; description: string; icon: string; color: string; skillName: string }>;
  llmConfig?: unknown;
  loadProjects: () => void | Promise<void>;
  createProject: (data: { name: string; description?: string; domain: string }) => Promise<{ id: string }>;
  loadUserAgents: () => void;
  loadUserSkills: () => void;
}) {
  const { projects, projectsRef, userAgents, userSkills, llmConfig, loadProjects, createProject, loadUserAgents, loadUserSkills } = input;

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
        const targetProjectId = detail.projectId || projectsRef.current?.[0]?.id;
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
  });

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

  return {
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
    spotlightItems,
  };
}
