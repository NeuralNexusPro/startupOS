import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '../../../../../core/src/types/agent';
import {
  createIdleAgentTaskExecutionState,
  type AgentTaskRuntimePersistenceV1,
  type AgentTaskRuntimeSnapshotV1,
  type ControlAgentTaskRequestV1,
  type CreateAgentTaskRequestV1,
} from '../../../../../core/src/lib/integrations/pi-agent/task-runtime';
import type { AgentTaskRuntimeCoordinator } from '../../../../../core/src/lib/integrations/pi-agent/task-runtime/coordinator';
import type { AgentTaskRuntimeBindingOptions } from '../../../../../core/src/lib/integrations/pi-agent/agent-manager';

const { ipcHandle } = vi.hoisted(() => ({ ipcHandle: vi.fn() }));

vi.mock('electron', () => ({
  ipcMain: { handle: ipcHandle },
}));

import { IPC_CHANNELS } from '../../ipc-protocol';
import {
  AgentTaskRuntimeIpcController,
  routeAgentSessionUserMessage,
} from '../agent-task-runtime-ipc';

type RegisteredHandler = (event: unknown, request: unknown) => Promise<unknown>;

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    sessionId: 'session-1',
    createdAt: 1,
    updatedAt: 1,
    status: 'active',
    messages: [],
    projectContext: {
      projectId: 'agent-1',
      projectName: 'Agent 1',
      entryType: 'agent',
      entryId: 'agent-1',
    },
    systemPrompt: 'system',
    agentType: 'agent',
    config: { sessionId: 'session-1', agentType: 'agent' },
    ...overrides,
  };
}

function makeSnapshot(
  status: AgentTaskRuntimeSnapshotV1['execution']['status'] = 'running',
): AgentTaskRuntimeSnapshotV1 {
  const taskMode = status === 'running'
    || status === 'waiting_user'
    || status === 'paused'
    || status === 'failed';
  return {
    version: 1,
    sessionId: 'session-1',
    execution: {
      ...createIdleAgentTaskExecutionState(3, '2026-08-02T00:00:00.000Z'),
      mode: taskMode ? 'task_running' : 'chat',
      status,
      requestId: 'request-1',
      taskId: 'task-1',
      expectedRevision: 2,
      expectedCursor: 'cursor-2',
    },
  };
}

function makePersistence(
  status: AgentTaskRuntimePersistenceV1['execution']['status'] = 'running',
): AgentTaskRuntimePersistenceV1 {
  return {
    schemaVersion: 1,
    execution: {
      ...makeSnapshot(status).execution,
      mode: makeSnapshot(status).execution.mode,
    },
    branchEntries: [{ id: 'entry-1', type: 'task-plan' }],
  };
}

function createHarness(session = makeSession()) {
  const handlers = new Map<string, RegisteredHandler>();
  const sender = {
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  };
  const sessionById = new Map([[session.sessionId, session]]);
  const getSession = vi.fn(async (sessionId: string, projectId?: string) => {
    const found = sessionById.get(sessionId) ?? null;
    if (!found || (projectId && found.projectContext.projectId !== projectId)) {
      return null;
    }
    return found;
  });
  const updateSession = vi.fn(async (
    sessionId: string,
    updates: { taskRuntime?: AgentTaskRuntimePersistenceV1 },
    projectId?: string,
  ) => {
    const found = await getSession(sessionId, projectId);
    if (!found) return null;
    if (updates.taskRuntime) found.taskRuntime = updates.taskRuntime;
    return found;
  });
  const snapshot = makeSnapshot();
  const runtime = {
    createTask: vi.fn(async () => snapshot),
    getSnapshot: vi.fn(() => snapshot),
    controlTask: vi.fn(async (_request: ControlAgentTaskRequestV1) => snapshot),
    submitUserReply: vi.fn(async () => snapshot),
    resumeAfterRestore: vi.fn(async () => snapshot),
  };
  let binding: AgentTaskRuntimeBindingOptions | undefined;
  const getOrCreateTaskRuntime = vi.fn(async (
    _session: AgentSession,
    options: AgentTaskRuntimeBindingOptions,
  ) => {
    binding = options;
    return runtime as unknown as AgentTaskRuntimeCoordinator;
  });
  const controller = new AgentTaskRuntimeIpcController({
    ipc: {
      handle: (channel, listener) => {
        handlers.set(channel, listener as RegisteredHandler);
      },
    },
    sessions: { getSession, updateSession },
    runtimes: { getOrCreateTaskRuntime },
  });
  controller.rememberSession(session, sender);
  controller.registerHandlers();

  const invoke = async (channel: string, request: unknown) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Missing handler: ${channel}`);
    return handler({ sender }, request);
  };

  return {
    binding: () => binding,
    controller,
    getOrCreateTaskRuntime,
    getSession,
    handlers,
    invoke,
    runtime,
    sender,
    session,
    updateSession,
  };
}

describe('AgentTaskRuntimeIpcController', () => {
  beforeEach(() => {
    ipcHandle.mockReset();
  });

  it('registers the versioned create/get/control channels', () => {
    const harness = createHarness();

    expect([...harness.handlers.keys()]).toEqual([
      IPC_CHANNELS.AGENT_TASK_CREATE,
      IPC_CHANNELS.AGENT_TASK_GET,
      IPC_CHANNELS.AGENT_TASK_CONTROL,
    ]);
    expect(IPC_CHANNELS.AGENT_TASK_EVENT).toBe('agent:task:event');
  });

  it('creates in the existing Session, persists taskRuntime, and emits a bounded event', async () => {
    const harness = createHarness();
    const request: CreateAgentTaskRequestV1 = {
      version: 1,
      requestId: 'request-1',
      sessionId: 'session-1',
      objective: '完成回归验证',
      context: '沿用当前会话中的验收约束',
      acceptanceCriteria: ['测试通过'],
    };

    const response = await harness.invoke(IPC_CHANNELS.AGENT_TASK_CREATE, request);

    expect(response).toMatchObject({ success: true, data: { sessionId: 'session-1' } });
    expect(harness.runtime.createTask).toHaveBeenCalledWith(request);
    expect(harness.getOrCreateTaskRuntime).toHaveBeenCalledWith(
      harness.session,
      expect.objectContaining({
        persist: expect.any(Function),
        onState: expect.any(Function),
        hasPendingUserMessage: expect.any(Function),
      }),
    );

    const persisted = makePersistence();
    await harness.binding()?.persist(persisted);
    expect(harness.updateSession).toHaveBeenCalledWith(
      'session-1',
      { taskRuntime: persisted },
      'agent-1',
    );

    harness.binding()?.onState?.(makeSnapshot());
    expect(harness.sender.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_TASK_EVENT,
      expect.objectContaining({
        version: 1,
        type: 'agent_task_runtime_state',
        sessionId: 'session-1',
      }),
    );
  });

  it('emits Task Runtime completion assistant messages on the active stream', async () => {
    const harness = createHarness();
    const request: CreateAgentTaskRequestV1 = {
      version: 1,
      requestId: 'request-1',
      sessionId: 'session-1',
      objective: '完成回归验证',
    };

    await harness.invoke(IPC_CHANNELS.AGENT_TASK_CREATE, request);
    harness.controller.setActiveStream('session-1', 'stream-1');

    harness.binding()?.onAssistantMessage?.('最终交付结果');

    expect(harness.sender.send).toHaveBeenCalledWith(
      IPC_CHANNELS.AGENT_EVENT,
      expect.objectContaining({
        type: 'assistant_message',
        sessionId: 'session-1',
        streamId: 'stream-1',
        data: expect.objectContaining({
          content: '最终交付结果',
          isStreaming: false,
          taskRuntimeCompletion: true,
        }),
      }),
    );
  });

  it('passes duplicate requestId to the same runtime and returns the same Task', async () => {
    const harness = createHarness();
    const request: CreateAgentTaskRequestV1 = {
      version: 1,
      requestId: 'same-request',
      sessionId: 'session-1',
      objective: '只创建一次',
    };

    const first = await harness.invoke(IPC_CHANNELS.AGENT_TASK_CREATE, request);
    const second = await harness.invoke(IPC_CHANNELS.AGENT_TASK_CREATE, request);

    expect(first).toMatchObject({ success: true, data: { execution: { taskId: 'task-1' } } });
    expect(second).toMatchObject({ success: true, data: { execution: { taskId: 'task-1' } } });
    expect(harness.getOrCreateTaskRuntime).toHaveBeenCalledTimes(2);
    expect(harness.runtime.createTask).toHaveBeenCalledTimes(2);
  });

  it('serializes commands for the same Session', async () => {
    const harness = createHarness();
    let releaseFirst: (() => void) | undefined;
    const order: string[] = [];
    harness.runtime.createTask.mockImplementationOnce(async () => {
      order.push('create-start');
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      order.push('create-end');
      return makeSnapshot();
    });
    harness.runtime.controlTask.mockImplementationOnce(async () => {
      order.push('control');
      return makeSnapshot('cancelled');
    });

    const createPromise = harness.invoke(IPC_CHANNELS.AGENT_TASK_CREATE, {
      version: 1,
      requestId: 'create',
      sessionId: 'session-1',
      objective: '串行任务',
    });
    const controlPromise = harness.invoke(IPC_CHANNELS.AGENT_TASK_CONTROL, {
      version: 1,
      requestId: 'stop',
      sessionId: 'session-1',
      action: 'stop',
      expectedRevision: 2,
      expectedCursor: 'cursor-2',
      bridgeEpoch: 3,
    } satisfies ControlAgentTaskRequestV1);

    await vi.waitFor(() => expect(order).toEqual(['create-start']));
    releaseFirst?.();
    await Promise.all([createPromise, controlPromise]);
    expect(order).toEqual(['create-start', 'create-end', 'control']);
  });

  it('maps stale control scope conflicts without changing the protocol', async () => {
    const harness = createHarness();
    harness.runtime.controlTask.mockRejectedValueOnce(Object.assign(
      new Error('Task control scope 已过期，请刷新状态后重试'),
      { code: 'TASK_RUNTIME_CONFLICT' },
    ));

    const response = await harness.invoke(IPC_CHANNELS.AGENT_TASK_CONTROL, {
      version: 1,
      requestId: 'stale-control',
      sessionId: 'session-1',
      action: 'stop',
      expectedRevision: 1,
      expectedCursor: 'stale',
      bridgeEpoch: 2,
    } satisfies ControlAgentTaskRequestV1);

    expect(response).toMatchObject({
      success: false,
      error: { code: 'TASK_RUNTIME_CONFLICT' },
    });
  });

  it('keeps stop and cancel as distinct control actions', async () => {
    const session = makeSession({ taskRuntime: makePersistence('running') });
    const harness = createHarness(session);
    harness.runtime.controlTask.mockImplementation(async (request: ControlAgentTaskRequestV1) => (
      request.action === 'stop' ? makeSnapshot('paused') : makeSnapshot('cancelled')
    ));
    const scope = {
      version: 1 as const,
      sessionId: 'session-1',
      expectedRevision: 2,
      expectedCursor: 'cursor-2',
      bridgeEpoch: 3,
    };

    const stopped = await harness.invoke(IPC_CHANNELS.AGENT_TASK_CONTROL, {
      ...scope,
      requestId: 'stop-request',
      action: 'stop',
    } satisfies ControlAgentTaskRequestV1);
    const cancelled = await harness.invoke(IPC_CHANNELS.AGENT_TASK_CONTROL, {
      ...scope,
      requestId: 'cancel-request',
      action: 'cancel',
    } satisfies ControlAgentTaskRequestV1);

    expect(harness.runtime.controlTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: 'stop' }),
    );
    expect(harness.runtime.controlTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: 'cancel' }),
    );
    expect(stopped).toMatchObject({ success: true, data: { execution: { status: 'paused' } } });
    expect(cancelled).toMatchObject({ success: true, data: { execution: { status: 'cancelled' } } });
  });

  it('routes waiting_user replies through Task Runtime without invoking chat prompt', async () => {
    const session = makeSession({ taskRuntime: makePersistence('waiting_user') });
    const harness = createHarness(session);
    const waitingSnapshot = makeSnapshot('waiting_user');
    harness.runtime.getSnapshot.mockReturnValue(waitingSnapshot);
    harness.runtime.submitUserReply.mockResolvedValue(waitingSnapshot);
    const promptChat = vi.fn(async () => undefined);

    const result = await routeAgentSessionUserMessage({
      controller: harness.controller,
      session,
      sender: harness.sender,
      content: '我已补充所需输入',
      promptChat,
    });

    expect(result).toMatchObject({ handledBy: 'task_runtime' });
    expect(harness.runtime.submitUserReply).toHaveBeenCalledWith('我已补充所需输入');
    expect(promptChat).not.toHaveBeenCalled();
  });

  it('keeps ordinary chat outside Task Runtime', async () => {
    const harness = createHarness();
    const promptChat = vi.fn(async () => undefined);

    const result = await routeAgentSessionUserMessage({
      controller: harness.controller,
      session: harness.session,
      sender: harness.sender,
      content: '普通聊天消息',
      promptChat,
    });

    expect(result).toEqual({ handledBy: 'chat' });
    expect(promptChat).toHaveBeenCalledOnce();
    expect(harness.runtime.submitUserReply).not.toHaveBeenCalled();
    expect(harness.getOrCreateTaskRuntime).not.toHaveBeenCalled();
  });

  it('replays and resumes a running task when the window reopens', async () => {
    const session = makeSession({ taskRuntime: makePersistence('running') });
    const harness = createHarness(session);

    const response = await harness.invoke(IPC_CHANNELS.AGENT_TASK_GET, {
      version: 1,
      sessionId: 'session-1',
    });

    expect(response).toMatchObject({ success: true, data: { sessionId: 'session-1' } });
    expect(harness.getOrCreateTaskRuntime).toHaveBeenCalledWith(
      session,
      expect.any(Object),
    );
    expect(harness.runtime.resumeAfterRestore).toHaveBeenCalledOnce();
  });

  it('rejects corrupt and unknown taskRuntime data while leaving the Session readable', async () => {
    const corrupt = makeSession({
      taskRuntime: {
        schemaVersion: 1,
        execution: createIdleAgentTaskExecutionState(),
        branchEntries: 'broken',
      } as unknown as AgentTaskRuntimePersistenceV1,
    });
    const corruptHarness = createHarness(corrupt);
    const corruptResponse = await corruptHarness.invoke(IPC_CHANNELS.AGENT_TASK_GET, {
      version: 1,
      sessionId: 'session-1',
    });
    expect(corruptResponse).toMatchObject({
      success: false,
      error: { code: 'TASK_RUNTIME_CORRUPT' },
    });
    expect(await corruptHarness.getSession('session-1', 'agent-1')).toBe(corrupt);

    const unknown = makeSession({
      taskRuntime: {
        schemaVersion: 9,
        execution: createIdleAgentTaskExecutionState(),
        branchEntries: [],
      } as unknown as AgentTaskRuntimePersistenceV1,
    });
    const unknownHarness = createHarness(unknown);
    const unknownResponse = await unknownHarness.invoke(IPC_CHANNELS.AGENT_TASK_GET, {
      version: 1,
      sessionId: 'session-1',
    });
    expect(unknownResponse).toMatchObject({
      success: false,
      error: { code: 'TASK_RUNTIME_UNSUPPORTED_SCHEMA' },
    });
  });

  it('supports Skill Sessions and rejects unknown protocol versions', async () => {
    const skill = makeSession({
      agentType: 'skill',
      projectContext: {
        projectId: 'skill-1',
        projectName: 'Skill 1',
        entryType: 'skill',
        entryId: 'skill-1',
      },
    });
    const harness = createHarness(skill);

    const skillResponse = await harness.invoke(IPC_CHANNELS.AGENT_TASK_GET, {
      version: 1,
      sessionId: 'session-1',
    });
    expect(skillResponse).toMatchObject({
      success: true,
      data: { sessionId: 'session-1' },
    });
    expect(harness.getOrCreateTaskRuntime).toHaveBeenCalled();

    const versionResponse = await harness.invoke(IPC_CHANNELS.AGENT_TASK_CREATE, {
      version: 2,
      requestId: 'unsupported',
      sessionId: 'session-1',
      objective: '不应执行',
    });
    expect(versionResponse).toMatchObject({
      success: false,
      error: { code: 'TASK_RUNTIME_PROTOCOL_ERROR' },
    });
    expect(harness.runtime.createTask).not.toHaveBeenCalled();
  });

  it('tracks pending user messages without changing ordinary stream channels', async () => {
    const harness = createHarness();
    await harness.invoke(IPC_CHANNELS.AGENT_TASK_GET, { version: 1, sessionId: 'session-1' });
    const hasPending = harness.binding()?.hasPendingUserMessage;
    expect(hasPending?.()).toBe(false);

    harness.controller.setUserMessagePending('session-1', true);
    expect(hasPending?.()).toBe(true);
    harness.controller.setUserMessagePending('session-1', false);
    expect(hasPending?.()).toBe(false);

    expect(IPC_CHANNELS.AGENT_SESSION_MESSAGE_STREAM).toBe('agent:session:message:stream');
    expect(IPC_CHANNELS.AGENT_EVENT).toBe('agent:event');
  });
});
