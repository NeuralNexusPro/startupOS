import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePersistentAgent } from '@originos/core/lib/integrations/pi-agent/client';
import { loadProjectCanonicalOntology } from '@/components/os/workspace/project-canonical-ontology';
import { InterviewWindow } from '../InterviewWindow';

vi.mock('@originos/core/lib/integrations/pi-agent/client', () => ({
  normalizeRuntimeLLMConfig: () => ({}),
  usePersistentAgent: vi.fn(),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector: (store: { getEffectiveConfig: () => object }) => unknown) =>
    selector({ getEffectiveConfig: () => ({}) }),
}));
vi.mock('@/services/AppWindowManager', () => ({ AppWindowManager: { getInstance: vi.fn() } }));
vi.mock('@/components/os/workspace', () => ({ ProjectWorkspace: () => null, WorkspaceWindow: () => null }));
vi.mock('@/components/os/workspace/project-identity', () => ({
  normalizeProjectEntryId: (value: string) => value,
  normalizeOntologyId: () => 'ontology-test',
}));
vi.mock('@/components/os/workspace/project-canonical-ontology', () => ({
  loadProjectCanonicalOntology: vi.fn(),
  canonicalToOntologyModel: vi.fn(),
}));
vi.mock('@/services/interview-behavior-drafts', () => ({
  loadInterviewBehaviorDraft: vi.fn().mockResolvedValue(null),
  confirmInterviewBehaviorDraft: vi.fn(),
}));
vi.mock('../ResizableLayout', () => ({
  ResizableLayout: ({ leftPanel }: { leftPanel: React.ReactNode }) => <>{leftPanel}</>,
}));
vi.mock('../CUIDialogPanel', () => ({ CUIDialogPanel: () => null }));
vi.mock('../ArtifactDisplayPanel', () => ({ ArtifactDisplayPanel: () => null }));

const mockedUsePersistentAgent = vi.mocked(usePersistentAgent);
const mockedLoadOntology = vi.mocked(loadProjectCanonicalOntology);

describe('InterviewWindow proactive greeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadOntology.mockImplementation(() => new Promise<Awaited<ReturnType<typeof loadProjectCanonicalOntology>>>(() => {}));
  });

  it.each([
    { scenario: '首次进入', messages: [] },
    { scenario: '恢复已有访谈', messages: [{ role: 'assistant' as const, content: '上次已确认业务对象', timestamp: 1 }] },
  ])('$scenario 时不等待本体加载就主动接续一次', async ({ messages }) => {
    const triggerGreeting = vi.fn().mockResolvedValue(undefined);
    mockedUsePersistentAgent.mockReturnValue({
      isReady: true,
      isThinking: false,
      messages,
      toolExecutions: [],
      artifactVersion: 0,
      sendMessage: vi.fn(),
      triggerGreeting,
      abort: vi.fn(),
    });

    const { rerender } = render(<InterviewWindow projectId="project-test" />);
    await waitFor(() => expect(triggerGreeting).toHaveBeenCalledTimes(1));
    rerender(<InterviewWindow projectId="project-test" />);
    expect(triggerGreeting).toHaveBeenCalledTimes(1);
    expect(mockedLoadOntology).toHaveBeenCalled();
  });

  it('等待 Agent 就绪后才主动开场', async () => {
    const triggerGreeting = vi.fn().mockResolvedValue(undefined);
    const agentState = {
      isReady: false,
      isThinking: false,
      messages: [],
      toolExecutions: [],
      artifactVersion: 0,
      sendMessage: vi.fn(),
      triggerGreeting,
      abort: vi.fn(),
    };
    mockedUsePersistentAgent.mockImplementation(() => agentState);

    const { rerender } = render(<InterviewWindow projectId="project-test" />);
    expect(triggerGreeting).not.toHaveBeenCalled();
    agentState.isReady = true;
    rerender(<InterviewWindow projectId="project-test" />);
    await waitFor(() => expect(triggerGreeting).toHaveBeenCalledTimes(1));
  });
});
