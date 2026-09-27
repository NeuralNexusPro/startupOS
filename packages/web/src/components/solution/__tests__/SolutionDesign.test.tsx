import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ initialize: vi.fn(), stream: vi.fn(), send: vi.fn(), create: vi.fn(), list: vi.fn(), get: vi.fn(), readContract: vi.fn(), checkContract: vi.fn(), publishContract: vi.fn(), revokeContract: vi.fn(), error: '' }));
vi.mock('@originos/core/lib/integrations/electron/services/project', () => ({ initializeSolution: mocks.create, listSolutions: mocks.list, getSolution: mocks.get }));
vi.mock('@originos/core/lib/integrations/pi-agent/client-hooks', () => ({ usePiAgent: () => ({ isThinking: false, isRunning: false, messages: [], artifactVersion: 0, initialize: mocks.initialize, sendMessage: mocks.send, sendMessageStream: mocks.stream, abort: vi.fn(), uiState: { errorMessage: mocks.error } }) }));
vi.mock('@originos/core/lib/integrations/pi-agent/client', () => ({ normalizeRuntimeLLMConfig: () => ({}) }));
vi.mock('@/store/settingsStore', () => { const get = () => ({}); return { useSettingsStore: () => get }; });
vi.mock('@/components/interview/CUIDialogPanel', () => ({ CUIDialogPanel: ({ messages, onSendMessage }: { messages: { content: string }[]; onSendMessage: (text: string) => Promise<void> }) => <div>{messages.map((m, i) => <p key={i}>{m.content}</p>)}<button onClick={() => void onSendMessage('后续需求')}>发送</button></div> }));
vi.mock('../SolutionList', () => ({ SolutionList: ({ onSelect }: { onSelect: (version: string) => void }) => <button onClick={() => onSelect('v1')}>加载方案 v1</button> }));
vi.mock('@/components/os/workspace', () => ({ WorkspaceWindow: () => null }));
vi.mock('@/services/AppWindowManager', () => ({ AppWindowManager: {} }));
vi.mock('@/services/solution-execution-contract-client', () => ({
  checkSolutionExecutionContract: mocks.checkContract,
  publishSolutionExecutionContract: mocks.publishContract,
  readSolutionExecutionContract: mocks.readContract,
  revokeSolutionExecutionContract: mocks.revokeContract,
}));
const { SolutionDesign, ExtendedSolutionDesign } = await import('../SolutionDesign');
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mocks.error = ''; mocks.create.mockResolvedValue({ success: true, data: { sessionId: 'session-1', projectDir: '/data/projects/p1' } }); mocks.initialize.mockResolvedValue(undefined); mocks.list.mockResolvedValue({ success: true, data: [] }); mocks.get.mockResolvedValue({ success: false }); mocks.readContract.mockResolvedValue({ success: false, error: { category: 'not_found', code: 'CONTRACT_NOT_FOUND', message: '未找到', retryable: false } }); mocks.stream.mockResolvedValue(undefined); });
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
it('mounts contract publishing in the real topology path with the selected exact solution', async () => {
  mocks.get.mockResolvedValue({
    success: true,
    data: {
      manifest: {
        solutionId: 'solution-1',
        status: 'confirmed',
        modeling: { dimension: 'task' },
        businessModelSummary: { goal: '交付目标' },
      },
      agents: [],
      skills: [],
      solutionVersion: 'v1',
    },
  });
  render(<SolutionDesign projectId="p1" projectName="项目" />);
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: '加载方案 v1' }));
  expect(
    await screen.findByRole('heading', { name: '执行契约发布' })
  ).toBeInTheDocument();
  expect(mocks.readContract).toHaveBeenCalledWith({
    actorId: 'originos.solution-designer',
    projectId: 'p1',
    solutionId: 'solution-1',
    solutionVersion: 'v1',
  });
  expect(screen.getByTestId('publishing-status')).toHaveTextContent(
    '已确认，待发布'
  );
});

it('keeps explicit topology and contracts through the actual design loader', async () => {
  mocks.get.mockResolvedValue({ success: true, data: {
    manifest: { solutionId: 'solution-1', status: 'confirmed', topologyViews: { workflow: { nodes: [{ id: 'step', type: 'skill', contractRef: 's' }], edges: [] } } },
    solutionVersion: 'v1', agents: [{ id: 'a', name: '角色', skills: ['s'] }],
    skills: [{ id: 's', name: '检验', contract: { skillId: 's', ontology: { ontologyId: 'o', ontologyVersion: '3' }, inputs: [], outputs: [], actions: [], permissions: ['facts.read'] } }]
  } });
  render(<SolutionDesign projectId="p1" projectName="项目" />);
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: '加载方案 v1' }));
  fireEvent.click(await screen.findByRole('button', { name: /技能：检验.*step/ }));
  expect(screen.getByRole('complementary').textContent).toContain('facts.read');
  expect(screen.getByText(/按方案显式拓扑展示/)).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: '团队' }));
  expect(screen.getByRole('button', { name: /角色：角色/ })).toBeTruthy();
  expect(screen.getByTestId('publishing-status')).toHaveTextContent('已确认，待发布');
});

it('keeps explicit team topology in the standalone solution viewer', async () => {
  mocks.list.mockResolvedValue({ success: true, data: [{ version: 'v2' }] });
  mocks.get.mockResolvedValue({ success: true, data: { manifest: { solutionId: 's', topologyViews: { team: { nodes: [{ id: 'team-node', type: 'skill', contractRef: 'x' }], edges: [] } } }, solutionVersion: 'v2', agents: [], skills: [{ id: 'x', name: '共享能力' }] } });
  render(<ExtendedSolutionDesign projectId="p1" projectName="项目" />);
  fireEvent.click(await screen.findByRole('tab', { name: '团队' }));
  expect(screen.getByRole('button', { name: /技能：共享能力.*team-node/ })).toBeTruthy();
  expect(screen.getByText('方案版本：v2')).toBeTruthy();
});
