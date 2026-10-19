import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcHandle, browserWindows, managerRef, eventLog } = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  browserWindows: [] as Array<{ isDestroyed: () => boolean; webContents: { send: (channel: string, payload: string) => void } }>,
  managerRef: {
    current: null as null | {
      getAgent: (projectId: string) => unknown;
      startAgent: (projectId: string, llmConfig?: unknown) => Promise<unknown>;
    },
  },
  eventLog: [] as Array<{ projectId: string; type: string; data: Record<string, unknown> }>,
}));

vi.mock('electron', () => ({
  ipcMain: { handle: ipcHandle },
  BrowserWindow: {
    getAllWindows: () => browserWindows.map((win) => ({
      isDestroyed: () => win.isDestroyed(),
      webContents: win.webContents,
    })),
  },
}));

vi.mock('@originos/core/lib/features/agent/server', () => ({
  persistentAgentManager: {
    getAgent: (projectId: string) => managerRef.current?.getAgent(projectId),
    startAgent: (projectId: string, llmConfig?: unknown) => managerRef.current!.startAgent(projectId, llmConfig),
  },
}));

vi.mock('@originos/core/lib/features/user-config', () => ({
  persistRuntimeLLMConfig: () => undefined,
}));

import { IPC_CHANNELS } from '../../ipc-protocol';
import { AgentProjectService } from '../agent-project-service';

type RegisteredHandler = (event: unknown, request: unknown) => Promise<{
  success: boolean;
  data?: { started?: boolean; queued?: boolean };
}>;

interface FakePersistentAgent {
  handleMessage: ReturnType<typeof vi.fn>;
  subscribe: (listener: (event: { type: string; [key: string]: unknown }) => void) => () => void;
  getAgent: () => { getContextTokenEstimate: () => number };
  queueFollowUp: ReturnType<typeof vi.fn>;
  listeners: Set<(event: { type: string; [key: string]: unknown }) => void>;
}

function makeFakeAgent(): FakePersistentAgent {
  const agent: FakePersistentAgent = {
    handleMessage: vi.fn(async () => undefined),
    subscribe: (listener) => {
      agent.listeners.add(listener);
      return () => {
        agent.listeners.delete(listener);
      };
    },
    getAgent: () => ({ getContextTokenEstimate: () => 0 }),
    queueFollowUp: vi.fn(),
    listeners: new Set(),
  };
  return agent;
}

function emitTextDelta(agent: FakePersistentAgent, delta: string): void {
  for (const listener of [...agent.listeners]) {
    listener({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta } });
  }
}

function projectEvents(projectId: string): Array<{ type: string; data: Record<string, unknown> }> {
  return eventLog.filter((event) => event.projectId === projectId);
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(condition()).toBe(true);
}

describe('AgentProjectService project turn queue', () => {
  let handler: RegisteredHandler;

  beforeEach(() => {
    eventLog.length = 0;
    browserWindows.length = 0;
    browserWindows.push({
      isDestroyed: () => false,
      webContents: {
        send: vi.fn((_channel: string, payload: string) => {
          eventLog.push(JSON.parse(payload));
        }),
      },
    });
    ipcHandle.mockReset();
    new AgentProjectService();
    const messageHandler = ipcHandle.mock.calls.find(
      (call) => call[0] === IPC_CHANNELS.AGENT_PROJECT_MESSAGE,
    );
    expect(messageHandler).toBeDefined();
    handler = messageHandler![1] as RegisteredHandler;
  });

  function installAgent(agent: FakePersistentAgent): void {
    managerRef.current = {
      getAgent: vi.fn(() => agent),
      startAgent: vi.fn(async () => agent),
    };
  }

  it('runs a message sent mid-turn as its own subscribed turn with its own done event', async () => {
    const agent = makeFakeAgent();
    installAgent(agent);

    // 第一轮消息保持 in-flight（模拟 CompletionJudge 窗口期间 prompt() 未 resolve）。
    let releaseFirstTurn: (() => void) | undefined;
    (agent.handleMessage as ReturnType<typeof vi.fn>).mockImplementation((message: string) => {
      if (message === '第一条') {
        emitTextDelta(agent, '回复一');
        return new Promise<void>((resolve) => { releaseFirstTurn = resolve; });
      }
      emitTextDelta(agent, '回复二');
      return Promise.resolve();
    });

    const first = await handler(undefined, { projectId: 'proj-1', content: '第一条' });
    expect(first.success).toBe(true);
    expect(first.data?.queued).toBeFalsy();

    // 第一轮仍在运行时发送第二条：服务层排队，不触发第二次 handleMessage。
    const second = await handler(undefined, { projectId: 'proj-1', content: '第二条' });
    expect(second.success).toBe(true);
    expect(second.data?.queued).toBe(true);
    expect(agent.handleMessage).toHaveBeenCalledOnce();
    expect(agent.queueFollowUp).not.toHaveBeenCalled();

    // 第一轮收尾 → 第二条作为独立 turn 执行，拥有自己的订阅窗口。
    releaseFirstTurn?.();

    await waitFor(() => projectEvents('proj-1').filter((event) => event.type === 'done').length >= 2);
    expect(agent.handleMessage).toHaveBeenCalledTimes(2);
    expect(agent.queueFollowUp).not.toHaveBeenCalled();

    // 每条消息都能在自己的订阅窗口内看到回复（不再被“订阅已解除”吞掉）。
    const deltas = projectEvents('proj-1')
      .filter((event) => event.type === 'text_delta')
      .map((event) => (event.data as { delta: string }).delta);
    expect(deltas).toContain('回复一');
    expect(deltas).toContain('回复二');

    // 两条 done 都没有标记失败。
    const dones = projectEvents('proj-1').filter((event) => event.type === 'done');
    expect(dones.map((event) => (event.data as { failed?: boolean }).failed)).toEqual([false, false]);
  });

  it('broadcasts the empty-response recoverable error when a turn produces no visible content', async () => {
    const agent = makeFakeAgent();
    installAgent(agent);
    (agent.handleMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const response = await handler(undefined, { projectId: 'proj-2', content: '空回复' });
    expect(response.success).toBe(true);

    await waitFor(() => projectEvents('proj-2').some((event) => event.type === 'done'));
    const errors = projectEvents('proj-2').filter((event) => event.type === 'error');
    expect(errors).toHaveLength(1);
    expect((errors[0]!.data as { message?: string }).message).toContain('未返回可显示内容');
    expect((errors[0]!.data as { recoverable?: boolean }).recoverable).toBe(true);
    const done = projectEvents('proj-2').find((event) => event.type === 'done');
    expect((done!.data as { failed?: boolean }).failed).toBe(true);
  });
});
