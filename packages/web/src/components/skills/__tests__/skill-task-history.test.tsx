import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AgentTaskRuntimeSnapshotV1 } from '@originos/core/lib/integrations/pi-agent/task-runtime';

const mocks = vi.hoisted(() => ({ restore: vi.fn(), control: vi.fn(), status: 'paused' as 'paused' | 'failed' | 'waiting_user' }));
vi.mock('@originos/core/lib/integrations/pi-agent/hooks', async () => {
  const { useState, useCallback } = await import('react');
  return { usePiAgent: () => {
    const [sessionId, setSessionId] = useState('fresh');
    return {
      sessionId, isInitialized: true, isThinking: false, isRestoring: false, uiState: {}, messages: [],
      initialize: useCallback(async () => {}, []), abort: vi.fn(), sendMessageStream: vi.fn(),
      restoreSession: useCallback(async (request: { sessionId: string }) => { mocks.restore(request); setSessionId(request.sessionId); return true; }, []),
    };
  } };
});
vi.mock('@/services/agent-task-runtime', () => ({
  observeAgentTaskRuntime: () => () => {},
  restoreAgentTaskRuntime: async (sessionId: string): Promise<AgentTaskRuntimeSnapshotV1> => ({
    version: 1, sessionId,
    execution: { schemaVersion: 1, mode: sessionId === 'history' ? 'task_running' : 'chat', status: sessionId === 'history' ? mocks.status : 'idle', draft: { objective: '原任务进度', acceptanceCriteria: [] }, bridgeEpoch: 1, expectedRevision: 7, expectedCursor: 'saved-cursor', continuationCount: 2, noProgressCount: 0, updatedAt: '2026-09-12T00:00:00Z' },
  }),
  createAgentTaskRequestId: () => 'task-request', runAgentTaskControl: (...args: unknown[]) => mocks.control(...args), submitAgentTaskDraft: vi.fn(),
}));
vi.mock('@originos/core/lib/integrations/pi-agent/client', () => ({ normalizeRuntimeLLMConfig: () => ({}) }));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => () => ({}) }));
vi.mock('@/services/AppWindowManager', () => ({ AppWindowManager: {} }));
vi.mock('@/components/os/workspace', () => ({ WorkspaceWindow: () => null }));
vi.mock('@/components/os/EntryExportButton', () => ({ EntryExportButton: () => null }));
vi.mock('@/lib/hooks/use-file-upload', () => ({ useFileUpload: () => ({}) }));
vi.mock('@/components/ui/chat-input-bar', () => ({ ChatInputBar: ({ onCreateTask }: { onCreateTask?: () => void }) => onCreateTask ? <button onClick={onCreateTask}>创建长程任务</button> : null }));
vi.mock('@/components/ui/chat', () => ({ ChatMessageList: ({ footerContent }: { footerContent?: ReactNode }) => <div>{footerContent}</div> }));
vi.mock('@originos/core/lib/integrations/electron/services/agent-session', () => ({ getAgentContent: vi.fn() }));
vi.mock('@originos/core/lib/integrations/electron/services/skill', () => ({
  getAvailableSkillContent: async () => ({ success: true, data: { content: 'skill', systemManaged: true } }),
  listAvailableSkillSessions: async () => ({ success: true, data: { sessions: [{ sessionId: 'history', createdAt: 1, updatedAt: 2, messageCount: 2, summary: '历史任务' }] } }),
  listAvailableSkills: vi.fn(), runSkillEvolution: vi.fn(),
}));
const { SkillDialog } = await import('../SkillDialog');
beforeEach(() => { mocks.restore.mockClear(); mocks.control.mockReset().mockRejectedValue(new Error('controlled test failure')); });
it.each([['paused', '恢复', 'resume'], ['failed', '重试', 'retry']] as const)('restores %s Skill history and only continues on click', async (status, label, action) => {
  mocks.status = status;
  render(<SkillDialog skillName="demo" />);
  await waitFor(() => expect(screen.getByText('1 个会话')).toBeTruthy());
  expect(mocks.restore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTitle('历史会话'));
  fireEvent.click(screen.getByText('历史任务'));
  await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeTruthy());
  expect(mocks.restore).toHaveBeenCalledWith({ sessionId: 'history', projectId: 'skill-demo', entryType: 'skill', entryId: 'demo' });
  expect(screen.getByText('原任务进度')).toBeTruthy();
  expect(mocks.control).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() => expect(mocks.control).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'history', execution: expect.objectContaining({ expectedRevision: 7, expectedCursor: 'saved-cursor', continuationCount: 2 }) }), action));
});

it('shows waiting history without automatically resuming or retrying', async () => {
  mocks.status = 'waiting_user';
  render(<SkillDialog skillName="demo" />);
  await waitFor(() => expect(screen.getByText('1 个会话')).toBeTruthy());
  fireEvent.click(screen.getByTitle('历史会话'));
  fireEvent.click(screen.getByText('历史任务'));
  await waitFor(() => expect(screen.getByText('等待用户')).toBeTruthy());
  expect(mocks.control).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '恢复' })).toBeNull();
});


it('offers long-running task creation from a Skill session', async () => {
  render(<SkillDialog skillName="demo" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '创建长程任务' })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: '创建长程任务' }));
  expect(screen.getByLabelText('任务草稿')).toBeTruthy();
});
