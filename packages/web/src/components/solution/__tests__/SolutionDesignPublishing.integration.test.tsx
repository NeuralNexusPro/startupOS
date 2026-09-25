import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeAgent: vi.fn(),
  initializeSolution: vi.fn(),
  listSolutions: vi.fn(),
  getSolution: vi.fn(),
  stream: vi.fn(),
  check: vi.fn(),
  settings: vi.fn(() => ({})),
}));

vi.mock('@originos/core/lib/integrations/electron/services/project', () => ({
  initializeSolution: mocks.initializeSolution,
  listSolutions: mocks.listSolutions,
  getSolution: mocks.getSolution,
}));
vi.mock('@originos/core/lib/integrations/pi-agent/client-hooks', () => ({
  usePiAgent: () => ({
    isThinking: false,
    isRunning: false,
    messages: [],
    artifactVersion: 0,
    initialize: mocks.initializeAgent,
    sendMessage: vi.fn(),
    sendMessageStream: mocks.stream,
    abort: vi.fn(),
    uiState: {},
  }),
}));
vi.mock('@originos/core/lib/integrations/pi-agent/client', () => ({
  normalizeRuntimeLLMConfig: () => ({}),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => mocks.settings,
}));
vi.mock('@/components/interview/CUIDialogPanel', () => ({
  CUIDialogPanel: () => null,
}));
vi.mock('../TopologyGraph', () => ({ SolutionGraphView: () => null }));
vi.mock('../SolutionList', () => ({
  SolutionList: ({ onSelect }: { onSelect: (version: string) => void }) => (
    <button type="button" onClick={() => onSelect('1.0')}>
      选择 1.0
    </button>
  ),
}));
vi.mock('@/components/os/workspace', () => ({ WorkspaceWindow: () => null }));
vi.mock('@/services/AppWindowManager', () => ({ AppWindowManager: {} }));
vi.mock('@/services/solution-execution-contract-client', () => ({
  checkSolutionExecutionContract: mocks.check,
  publishSolutionExecutionContract: vi.fn(),
  readSolutionExecutionContract: vi.fn(),
  revokeSolutionExecutionContract: vi.fn(),
}));

const { SolutionDesign } = await import('../SolutionDesign');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initializeSolution.mockResolvedValue({
    success: true,
    data: { sessionId: 'session-1', projectDir: '/data/projects/p1' },
  });
  mocks.initializeAgent.mockResolvedValue(undefined);
  mocks.listSolutions.mockResolvedValue({ success: true, data: [] });
  mocks.getSolution.mockResolvedValue({
    success: true,
    data: {
      solutionVersion: '1.0',
      manifest: {
        status: 'confirmed',
        modeling: { dimension: 'task' },
        businessModelSummary: { goal: '处理订单' },
      },
      agents: [],
      skills: [],
    },
  });
  mocks.stream.mockResolvedValue(undefined);
  mocks.check.mockResolvedValue({ success: true, data: { ok: false, gaps: [] } });
});

it('mounts publishing in SolutionDesign and invokes the typed client', async () => {
  render(<SolutionDesign projectId="p1" projectName="项目" />);
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
  fireEvent.click(
    await screen.findByRole('button', { name: '选择 1.0' })
  );

  expect(
    await screen.findByRole('heading', { name: '执行契约发布' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '检查发布条件' }));
  await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
  expect(mocks.check).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'p1',
      solutionVersion: '1.0',
    })
  );
});
