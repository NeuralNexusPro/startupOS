'use client';

import { useCallback, useEffect, useState } from 'react';
import { isElectron } from '@originos/core/lib/integrations/electron';
import {
  abortLocalAgent,
  type LocalAgentConfig,
  type LocalAgentEventEnvelope,
  sendLocalAgentMessage,
  startLocalAgent,
  stopLocalAgent,
  subscribeToLocalAgentEvents,
} from '@originos/core/lib/integrations/electron/local-agent';

export function useLocalAgent() {
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    setIsAvailable(isElectron());
  }, []);

  const startAgent = useCallback(async (config: LocalAgentConfig) => {
    return startLocalAgent(config);
  }, []);

  const stopAgent = useCallback(async (agentId: string) => {
    await stopLocalAgent(agentId);
  }, []);

  const sendMessage = useCallback(async (agentId: string, message: string) => {
    await sendLocalAgentMessage(agentId, message);
  }, []);

  const abortAgent = useCallback(async (agentId: string) => {
    await abortLocalAgent(agentId);
  }, []);

  const onEvent = useCallback((listener: (payload: LocalAgentEventEnvelope) => void) => {
    return subscribeToLocalAgentEvents(listener);
  }, []);

  return {
    isAvailable,
    startAgent,
    stopAgent,
    sendMessage,
    abortAgent,
    onEvent,
  };
}
