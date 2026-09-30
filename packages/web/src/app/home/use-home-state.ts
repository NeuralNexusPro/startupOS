// 首页全部页面级状态与派生值的归并 hook（无窗口编排副作用）。
'use client';

import * as React from 'react';
import type { ProjectListItem, ProjectStatus } from '@originos/core/types';

import { isElectron } from '@originos/core/lib/integrations/electron';
import { normalizeRuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/client';
import { listUserAgents, listUserSkills } from '@originos/core/lib/integrations/electron/services/user-registry';
import { hasConfiguredLLM, useSettingsStore } from '@/store/settingsStore';

export interface UserAgent {
  id: string;
  name: string;
  description: string;
  agentType: 'assistant' | 'role-agent' | 'unknown';
  role?: string;
  domain?: string;
  version?: string;
  dirPath?: string;
}

export function useHomeState(input: { projects: ProjectListItem[] }) {
  const { projects } = input;

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

  // Ref for projects to avoid initialization order in dock action handler
  const projectsRef = React.useRef<ProjectListItem[]>([]);
  React.useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const projectCount = projects.length;
  const activeProjectCount = projects.filter((project) => project.status !== ('draft' as ProjectStatus)).length;
  const draftProjectCount = projects.filter((project) => project.status === ('draft' as ProjectStatus)).length;
  const recentProject = [...projects].sort((a, b) => b.lastModified - a.lastModified)[0];

  return {
    llmConfigured,
    llmConfig,
    isElectronEnv,
    showDesktopOnboarding,
    setShowDesktopOnboarding,
    showSettings,
    setShowSettings,
    dockGuideHighlight,
    userAgents,
    userSkills,
    loadUserAgents,
    loadUserSkills,
    projectsRef,
    projectCount,
    activeProjectCount,
    draftProjectCount,
    recentProject,
    handleDismissOnboarding,
  };
}
