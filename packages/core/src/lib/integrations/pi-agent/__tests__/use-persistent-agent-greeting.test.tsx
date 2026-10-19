import React, { StrictMode, type ReactNode } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  initializeProjectAgent,
  sendProjectAgentMessage,
  startProjectAgent,
  stopProjectAgent,
} from '../../electron/services/agent-project';
import { usePersistentAgent } from '../use-persistent-agent';

vi.mock('../../electron/services/agent-project', () => ({
  initializeProjectAgent: vi.fn(),
  startProjectAgent: vi.fn(),
  stopProjectAgent: vi.fn(),
  sendProjectAgentMessage: vi.fn(),
  abortProjectAgent: vi.fn(),
}));

const mockedInitialize = vi.mocked(initializeProjectAgent);
const mockedStart = vi.mocked(startProjectAgent);
const mockedStop = vi.mocked(stopProjectAgent);
const mockedSend = vi.mocked(sendProjectAgentMessage);

describe('usePersistentAgent greeting queue', () => {
  beforeEach(() => {
    mockedInitialize.mockResolvedValue({ success: true, data: { projectId: 'project-1', files: [] } });
    mockedStart.mockResolvedValue({ success: true, data: { status: 'running', messages: [] } });
    mockedStop.mockResolvedValue({ success: true, data: { stopped: true } });
    mockedSend.mockImplementation(async (_request, handlers) => {
      handlers.onEvent?.({ projectId: 'project-1', type: 'assistant_message', data: { content: '欢迎开始项目访谈' } });
      handlers.onEvent?.({ projectId: 'project-1', type: 'done', data: { content: '欢迎开始项目访谈' } });
      handlers.onDone?.();
      return { success: true, data: { started: true } };
    });
  });

  it('starts the send queue before waiting for the greeting response', async () => {
    const { result } = renderHook(() => usePersistentAgent('project-1'));
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.triggerGreeting();
    });

    expect(mockedSend).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        content: '__SYSTEM_TRIGGER_GREETING__',
      }),
      expect.any(Object),
    );
    expect(result.current.messages.some((message) => message.content === '欢迎开始项目访谈')).toBe(true);
    expect(result.current.messages.some((message) => message.role === 'user')).toBe(false);
  });

  it('keeps the shared project agent alive across StrictMode effect replay', async () => {
    vi.useFakeTimers();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => usePersistentAgent('project-strict'), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.isReady).toBe(true);
    expect(mockedStart).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockedStop).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(mockedStop).toHaveBeenCalledOnce();
    expect(mockedStop).toHaveBeenCalledWith({ projectId: 'project-strict' });
    vi.useRealTimers();
  });
});
