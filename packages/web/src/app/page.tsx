/**
 * OriginOS 主页面 - macOS/FluentOS 风格
 *
 * 首页布局门面——组装 state/handlers/layout 模块并渲染桌面布局。
 *
 * 参考：Windows 11 Fluent OS + macOS
 */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
'use client';

import { DesktopLayout } from './home/desktop-layout';
import { useHomeState } from './home/use-home-state';
import { useHomeHandlers } from './home/use-home-handlers';

import { useProjects } from '@/lib/hooks/use-projects';

// ============================================================================
// Main Page Component
// ============================================================================

export default function OSHomePage() {
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

  const {
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
  } = useHomeState({ projects });

  const {
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
  } = useHomeHandlers({
    projects,
    projectsRef,
    userAgents,
    userSkills,
    llmConfig,
    loadProjects,
    createProject,
    loadUserAgents,
    loadUserSkills,
  });

  return (
    <DesktopLayout
      isElectronEnv={isElectronEnv}
      dockGuideHighlight={dockGuideHighlight}
      projectCount={projectCount}
      activeProjectCount={activeProjectCount}
      draftProjectCount={draftProjectCount}
      recentProject={recentProject}
      projects={projects as never}
      userAgents={userAgents}
      userSkills={userSkills}
      llmConfigured={llmConfigured}
      showDesktopOnboarding={showDesktopOnboarding}
      setShowDesktopOnboarding={setShowDesktopOnboarding}
      showSettings={showSettings}
      setShowSettings={setShowSettings}
      handleDismissOnboarding={handleDismissOnboarding}
      isLoadingProjects={isLoadingProjects}
      handleCreateProject={handleCreateProject}
      handleDeleteAgent={handleDeleteAgent}
      handleDeleteSkill={handleDeleteSkill}
      handleSkillLaunch={handleSkillLaunch}
      handleOpenWorkspace={handleOpenWorkspace}
      handleNotificationActivation={handleNotificationActivation as (target: { entryType: string; entryId: string; title?: string; initialMessage?: string }) => void}
      handleOpenProjectInterview={handleOpenProjectInterview}
      handleOpenSolutionDesign={handleOpenSolutionDesign}
      handleOpenCollaboration={handleOpenCollaboration}
      handleDeleteProject={handleDeleteProject}
    />
  );
}
