/**
 * OS.7: Agent Lifecycle Hook
 */

import { useState, useEffect } from 'react';
import { AgentStatus } from '@originos/core/types';
import { usePiAgent } from '@originos/core/lib/integrations/pi-agent/hooks';
import { normalizeRuntimeLLMConfig } from '@originos/core/lib/integrations/pi-agent/client';
import { useSettingsStore } from '@/store/settingsStore';

interface ProjectContext {
  projectPath: string;
  files?: string[];
}

export function useAgentLifecycle(agentId: string) {
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.IDLE);
  const piAgentStore = usePiAgent();
  const getEffectiveConfig = useSettingsStore((s) => s.getEffectiveConfig);

  const start = async (projectContext: ProjectContext) => {
    setStatus(AgentStatus.INITIALIZING);
    try {
      const llmConfig = normalizeRuntimeLLMConfig(getEffectiveConfig());
      await piAgentStore.initialize(agentId, projectContext as any, {}, llmConfig);
      setStatus(AgentStatus.RUNNING);
    } catch (error) {
      setStatus(AgentStatus.ERROR);
      throw error;
    }
  };

  const stop = async () => {
    setStatus(AgentStatus.PAUSED);
    try {
      piAgentStore.abort();
      setStatus(AgentStatus.UNREGISTERED);
    } catch (error) {
      setStatus(AgentStatus.ERROR);
      throw error;
    }
  };

  useEffect(() => {
    return () => {
      piAgentStore.destroy();
    };
  }, []);

  return { status, start, stop };
}
