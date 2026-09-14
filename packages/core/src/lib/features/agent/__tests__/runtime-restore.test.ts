import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentManager, agentSessionService } from '../server';
import * as agentAdapter from '../../../integrations/pi-agent/core/agent';
import type { AgentMessage } from '../../../../types/agent';
import { MemoryCore } from '../../../../modules/memory-core';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-business-restore-'));
  vi.stubEnv('DATA_ROOT', directory);
});
afterEach(() => {
  agentManager.destroyAll();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

function controlledAgent() {
  const state = { systemPrompt: '', messages: [] as AgentMessage[] };
  return {
    agent: { state },
    isInitialized: () => true,
    setSystemPrompt: vi.fn((prompt: string) => { state.systemPrompt = prompt; }),
    setTools: vi.fn(), registerTool: vi.fn(),
    subscribe: vi.fn(() => () => {}), destroy: vi.fn(),
    waitForIdle: async () => {},
    replacePersistedMessages: vi.fn((messages: AgentMessage[]) => { state.messages = messages; return messages.length; }),
    getSessionState: async () => ({ messages: state.messages }),
  };
}

describe('public business runtime cold start and restore', () => {
  it.each(['role-agent', 'project'] as const)('%s restores file-backed history and refreshes only the restarted prompt snapshot', async agentType => {
    const actors: ReturnType<typeof controlledAgent>[] = [];
    vi.spyOn(agentAdapter, 'createOriginOSAgent').mockImplementation(() => {
      const actor = controlledAgent();
      actors.push(actor);
      return actor as unknown as agentAdapter.OriginOSAgent;
    });
    const sessionId = `restore-${agentType}`;
    const projectId = `owner-${agentType}`;
    const workingDirectory = path.join(directory, 'projects', projectId);
    fs.mkdirSync(workingDirectory, { recursive: true });
    new MemoryCore(workingDirectory, sessionId).memory.appendBlock('project', 'initial knowledge');
    const session = await agentSessionService.createSession({
      sessionId, projectId, projectName: 'Restore fixture', agentType,
      projectContext: { projectId, currentPath: workingDirectory }, systemPrompt: 'Role/project system prompt',
    });
    await agentManager.getOrCreateAgent(sessionId, projectId, { agentType, agentBaseDir: workingDirectory, systemPrompt: session.systemPrompt });
    const initial = actors[0]!;
    const frozen = initial.agent.state.systemPrompt;
    expect(frozen).toContain('initial knowledge');
    expect(initial.subscribe).toHaveBeenCalledOnce();
    const memory = new MemoryCore(workingDirectory, sessionId);
    memory.memory.appendBlock('project', 'knowledge discovered after startup');
    expect(initial.agent.state.systemPrompt).toBe(frozen);
    const messages: AgentMessage[] = [{ role: 'user', content: 'persisted request', timestamp: 1 }];
    await agentSessionService.updateSession(sessionId, { messages }, projectId);
    agentManager.removeAgent(sessionId);
    const persisted = await agentSessionService.getSession(sessionId, projectId);
    expect(persisted?.messages).toEqual(messages);
    const [restored, reused] = await Promise.all([
      agentManager.getOrRestoreAgentRuntime(persisted!),
      agentManager.getOrRestoreAgentRuntime(persisted!),
    ]);
    expect(restored).toBe(reused);
    expect(actors).toHaveLength(2);
    const restarted = actors[1]!;
    expect(restarted.agent.state.systemPrompt).toContain('knowledge discovered after startup');
    expect(restarted.replacePersistedMessages).toHaveBeenCalledOnce();
    expect(restarted.agent.state.messages).toEqual(messages);
    expect(restarted.subscribe).toHaveBeenCalledOnce();
  });
});
