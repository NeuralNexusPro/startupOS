import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ initialize: vi.fn(), stream: vi.fn(), send: vi.fn(), create: vi.fn(), list: vi.fn(), error: '' }));
vi.mock('@originos/core/lib/integrations/electron/services/project', () => ({ initializeSolution: mocks.create, listSolutions: mocks.list, getSolution: vi.fn() }));
vi.mock('@originos/core/lib/integrations/pi-agent/client-hooks', () => ({ usePiAgent: () => ({ isThinking: false, isRunning: false, messages: [], artifactVersion: 0, initialize: mocks.initialize, sendMessage: mocks.send, sendMessageStream: mocks.stream, abort: vi.fn(), uiState: { errorMessage: mocks.error } }) }));
vi.mock('@originos/core/lib/integrations/pi-agent/client', () => ({ normalizeRuntimeLLMConfig: () => ({}) }));
vi.mock('@/store/settingsStore', () => { const get = () => ({}); return { useSettingsStore: () => get }; });
vi.mock('@/components/interview/CUIDialogPanel', () => ({ CUIDialogPanel: ({ messages, onSendMessage }: { messages: { content: string }[]; onSendMessage: (text: string) => Promise<void> }) => <div>{messages.map((m, i) => <p key={i}>{m.content}</p>)}<button onClick={() => void onSendMessage('后续需求')}>发送</button></div> }));
vi.mock('../TopologyGraph', () => ({ SolutionGraphView: () => null }));
vi.mock('../SolutionList', () => ({ SolutionList: () => null }));
vi.mock('@/components/os/workspace', () => ({ WorkspaceWindow: () => null }));
vi.mock('@/services/AppWindowManager', () => ({ AppWindowManager: {} }));
const { SolutionDesign } = await import('../SolutionDesign');
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mocks.error = ''; mocks.create.mockResolvedValue({ success: true, data: { sessionId: 'session-1', projectDir: '/data/projects/p1' } }); mocks.initialize.mockResolvedValue(undefined); mocks.list.mockResolvedValue({ success: true, data: [] }); mocks.stream.mockResolvedValue(undefined); });
it('initializes explicit skill ownership and uses streaming for opening and later messages', async () => {
  const view = render(<SolutionDesign projectId="p1" projectName="项目" />);
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
  expect(mocks.initialize).toHaveBeenCalledWith('session-1', expect.objectContaining({ projectId: 'p1', entryType: 'skill', entryId: 'solution-design' }), expect.objectContaining({ agentType: 'skill' }), expect.anything());
  view.rerender(<SolutionDesign projectId="p1" projectName="项目" />);
  fireEvent.click(screen.getByText('发送'));
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(2));
  expect(mocks.stream).toHaveBeenLastCalledWith('后续需求');
  expect(mocks.send).not.toHaveBeenCalled();
});
it('shows initialization failure and does not start a stale stored session', async () => {
  sessionStorage.setItem('solution-session-p1', 'stale');
  mocks.create.mockRejectedValue(new Error('初始化不可用'));
  render(<SolutionDesign projectId="p1" projectName="项目" />);
  await waitFor(() => expect(screen.getByText(/AI 解决方案启动失败/)).toBeTruthy());
  expect(mocks.stream).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
it('shows opening, later-send and asynchronous runtime errors', async () => {
  mocks.stream.mockRejectedValue(new Error('连接不可用'));
  const view = render(<SolutionDesign projectId="p1" projectName="项目" />);
  await waitFor(() => expect(screen.getByText(/自动启动失败.*连接不可用/)).toBeTruthy());
  fireEvent.click(screen.getByText('发送'));
  await waitFor(() => expect(screen.getByText(/消息发送失败.*连接不可用/)).toBeTruthy());
  mocks.error = '运行时失败';
  view.rerender(<SolutionDesign projectId="p1" projectName="项目" />);
  expect(screen.getByRole('alert').textContent).toContain('运行时失败');
});
it('finishes StrictMode initialization without a stranded module-wide lock', async () => {
  render(<StrictMode><SolutionDesign projectId="strict" projectName="项目" /></StrictMode>);
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.initialize).toHaveBeenCalledTimes(1);
});
