'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { isElectron } from '@originos/core/lib/integrations/electron/env';

const SkillDialog = dynamic<any>(() => import('@/components/skills/SkillDialog').then(m => ({ default: m.SkillDialog })), { ssr: false });
const WorkspaceWindow = dynamic<any>(() => import('@/components/os/workspace/WorkspaceWindow').then(m => ({ default: m.WorkspaceWindow })), { ssr: false });
const ProjectWorkspace = dynamic<any>(() => import('@/components/os/workspace/ProjectWorkspace').then(m => ({ default: m.ProjectWorkspace })), { ssr: false });
const InterviewWindow = dynamic<any>(() => import('@/components/interview/InterviewWindow').then(m => ({ default: m.InterviewWindow })), { ssr: false });
const AgentDialogContent = dynamic(() => import('@/components/os/agent-dialog/AgentDialogContent'), { ssr: false });
const SolutionDesign = dynamic<any>(() => import('@/components/solution/SolutionDesign').then(m => ({ default: m.SolutionDesign })), { ssr: false });
const CollaborationWindow = dynamic(() => import('./CollaborationWindow'), { ssr: false });
const SandboxWindow = dynamic<any>(() => import('@/components/sandbox/SandboxWindow').then(m => ({ default: m.SandboxWindow })), { ssr: false });
const SenseCenter = dynamic(() => import('@/components/os/sense-center').then(m => ({ default: m.SenseCenter })), { ssr: false });

function WindowContent() {
  const params = useSearchParams();
  const isNativeWindow = params.get('nativeWindow') === '1';

  useEffect(() => {
    if (!isNativeWindow || !isElectron()) return;
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const root = document.getElementById('__next') ?? document.querySelector('[data-nextjs-root]');
    if (root instanceof HTMLElement) {
      root.style.background = 'transparent';
    }
  }, [isNativeWindow]);

  const windowType = params.get('windowType') ?? '';
  const title = params.get('title') ?? '';

  useEffect(() => {
    if (title) {
      document.title = title;
    }
  }, [title]);

  const projectId = params.get('projectId') ?? '';
  const projectName = params.get('projectName') ?? title;
  const ontologyId = params.get('ontologyId') ?? undefined;
  const entryType = params.get('entryType') ?? undefined;
  const entryId = params.get('entryId') ?? undefined;
  const sessionId = params.get('sessionId') ?? undefined;
  const skillName = params.get('skillName') ?? undefined;
  const initialMessage = params.get('initialMessage') ?? undefined;
  const agentId = params.get('agentId') ?? '';
  const agentName = params.get('agentName') ?? undefined;
  const agentType = params.get('agentType') ?? undefined;
  const projectDescription = params.get('projectDescription') ?? undefined;

  return (
    <div
      className={isNativeWindow ? 'w-screen h-screen overflow-hidden bg-transparent p-0' : 'w-screen h-screen overflow-hidden'}
      style={isNativeWindow ? { background: 'transparent' } : undefined}
    >
      <div
        className={isNativeWindow
          ? 'native-window-surface w-full h-full overflow-hidden text-slate-950'
          : 'w-full h-full bg-background'
        }
      >
      {windowType === 'skill' && (
        <SkillDialog
          skillName={skillName}
          initialMessage={initialMessage}
        />
      )}
      {windowType === 'workspace' && (
        <WorkspaceWindow
          projectId={projectId}
          projectName={projectName}
          ontologyId={ontologyId}
          entryType={entryType}
          entryId={entryId}
        />
      )}
      {windowType === 'project-workspace' && (
        <ProjectWorkspace
          projectId={projectId}
          projectName={projectName}
          ontologyId={ontologyId ?? ''}
        />
      )}
      {windowType === 'interview' && (
        <InterviewWindow
          projectId={projectId}
          sessionId={sessionId}
          projectName={projectName}
          ontologyId={ontologyId}
        />
      )}
      {(windowType === 'agent' || windowType === 'role-agent') && (
        <AgentDialogContent
          agentId={agentId}
          agentName={agentName}
          agentType={agentType}
          initialMessage={initialMessage}
        />
      )}
      {windowType === 'solution' && (
        <SolutionDesign
          projectId={projectId}
          projectName={projectName}
          projectDescription={projectDescription}
        />
      )}
      {windowType === 'collaboration' && (
        <CollaborationWindow
          projectId={projectId}
          projectName={projectName}
        />
      )}
      {windowType === 'sandbox' && (
        <SandboxWindow
          initialAppId={entryId}
        />
      )}
      {windowType === 'sense-center' && <SenseCenter />}
      </div>
    </div>
  );
}

export default function WindowPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>}>
      <WindowContent />
    </Suspense>
  );
}
