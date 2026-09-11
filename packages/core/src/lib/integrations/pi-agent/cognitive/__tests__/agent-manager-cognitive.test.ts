import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

function tmpDir() {
  return path.join(process.cwd(), '.test-tmp', `am-cog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
}

describe('AgentManager cognitive registration', () => {
  let agentDir: string;

  beforeEach(() => {
    agentDir = tmpDir();
    fs.mkdirSync(agentDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(agentDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('creates practice/turns and patterns dirs when agentBaseDir is set', async () => {
    const agentMod = await import('@/lib/integrations/pi-agent/core/agent');
    vi.spyOn(agentMod, 'createOriginOSAgent').mockReturnValue({
      isInitialized: () => true,
      setSystemPrompt: vi.fn(),
      setTools: vi.fn(),
      registerTool: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
      destroy: vi.fn(),
      abort: vi.fn(),
    } as any);

    const toolsMod = await import('@/lib/integrations/pi-agent/tools/index');
    vi.spyOn(toolsMod, 'initializeBuiltInTools').mockReturnValue(undefined as any);
    vi.spyOn(toolsMod, 'getAgentToolsForScope').mockReturnValue([]);

    const { AgentManager } = await import('@/lib/integrations/pi-agent/agent-manager');
    const manager = new AgentManager();
    await manager.getOrCreateAgent('test-session', 'test-project', {
      agentBaseDir: agentDir,
      agentType: 'worker',
    });

    // PracticeLogger creates practice/turns on construction
    expect(fs.existsSync(path.join(agentDir, 'practice', 'turns'))).toBe(true);
  });

  it('does not create cognitive dirs when agentBaseDir is absent', async () => {
    const agentMod = await import('@/lib/integrations/pi-agent/core/agent');
    vi.spyOn(agentMod, 'createOriginOSAgent').mockReturnValue({
      isInitialized: () => true,
      setSystemPrompt: vi.fn(),
      setTools: vi.fn(),
      registerTool: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
      destroy: vi.fn(),
      abort: vi.fn(),
    } as any);

    const toolsMod = await import('@/lib/integrations/pi-agent/tools/index');
    vi.spyOn(toolsMod, 'initializeBuiltInTools').mockReturnValue(undefined as any);
    vi.spyOn(toolsMod, 'getAgentToolsForScope').mockReturnValue([]);

    const { AgentManager } = await import('@/lib/integrations/pi-agent/agent-manager');
    const manager = new AgentManager();
    await manager.getOrCreateAgent('test-session-2', 'test-project', {
      agentType: 'worker',
    });

    // No agentBaseDir → no cognitive dirs created in agentDir
    expect(fs.existsSync(path.join(agentDir, 'practice'))).toBe(false);
    expect(fs.existsSync(path.join(agentDir, 'patterns'))).toBe(false);
  });

  it('does not create persistent cognition for a standalone skill even with a working directory', async () => {
    const agentMod = await import('@/lib/integrations/pi-agent/core/agent');
    vi.spyOn(agentMod, 'createOriginOSAgent').mockReturnValue({
      isInitialized: () => true,
      setSystemPrompt: vi.fn(),
      setTools: vi.fn(),
      registerTool: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => {}),
      destroy: vi.fn(),
      abort: vi.fn(),
    } as any);

    const toolsMod = await import('@/lib/integrations/pi-agent/tools/index');
    vi.spyOn(toolsMod, 'initializeBuiltInTools').mockReturnValue(undefined as any);
    vi.spyOn(toolsMod, 'getAgentToolsForScope').mockReturnValue([]);

    const { AgentManager } = await import('@/lib/integrations/pi-agent/agent-manager');
    const manager = new AgentManager();
    await manager.getOrCreateAgent('standalone-skill-session', 'skill-demo', {
      agentBaseDir: agentDir,
      agentType: 'skill',
    });

    expect(fs.existsSync(path.join(agentDir, 'practice'))).toBe(false);
    expect(fs.existsSync(path.join(agentDir, 'patterns'))).toBe(false);
    expect(fs.existsSync(path.join(agentDir, 'knowledge'))).toBe(false);
    expect(fs.existsSync(path.join(agentDir, 'cognition'))).toBe(false);
  });
});
