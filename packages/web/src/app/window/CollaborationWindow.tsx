'use client';

import { useEffect, useMemo, useState } from 'react';
import { MultiAgentLauncher } from '@originos/core/modules/collaboration-runtime/ui/MultiAgentLauncher';
import { MarkdownContent, AskUserQuestionComponent, parseAskUserQuestion, removeYamlBlock } from '@/components/ui/chat-message';
import { ChatInputBar } from '@/components/ui/chat-input-bar';
import { useFileUpload } from '@/lib/hooks/use-file-upload';
import { useSettingsStore } from '@/store/settingsStore';
import { normalizeRuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/client';
import { openSupervisorTaskBoard } from '@/components/os/task-board';

interface CollaborationWindowProps {
  projectId: string;
  projectName: string;
}

export default function CollaborationWindow({ projectId, projectName }: CollaborationWindowProps) {
  const [mounted, setMounted] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const llm = useSettingsStore((state) => state.llm);
  const getEffectiveConfig = useSettingsStore((state) => state.getEffectiveConfig);
  const loadFromServer = useSettingsStore((state) => state.loadFromServer);
  const llmConfig = useMemo(
    () => normalizeRuntimeLLMConfig(getEffectiveConfig()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getEffectiveConfig, llm],
  );

  useEffect(() => {
    setMounted(true);
    loadFromServer().then(() => setSettingsLoaded(true));
  }, [loadFromServer]);

  if (!mounted || !settingsLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <MultiAgentLauncher
      projectId={projectId}
      projectName={projectName}
      llmConfig={llmConfig}
      onOpenTaskBoard={() => openSupervisorTaskBoard(projectId, projectName)}
      uiDeps={{
        MarkdownContent,
        ChatInputBar,
        AskUserQuestionComponent,
        parseAskUserQuestion,
        removeYamlBlock,
        useFileUpload,
      }}
    />
  );
}
