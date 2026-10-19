import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalOntology } from '@originos/core/lib/features/ontology/types';
import { usePersistentAgent } from '@originos/core/lib/integrations/pi-agent/client';
import { loadProjectCanonicalOntology } from '@/components/os/workspace/project-canonical-ontology';
import { AppWindowManager } from '@/services/AppWindowManager';
import { InterviewWindow } from '../InterviewWindow';

vi.mock('@originos/core/lib/integrations/pi-agent/client', () => ({
  normalizeRuntimeLLMConfig: () => ({}),
  usePersistentAgent: vi.fn(),
}));
vi.mock('@originos/core/lib/integrations/electron/services/project', () => ({
  getProject: vi.fn().mockResolvedValue({ success: false }),
  updateProject: vi.fn(),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: (selector: (store: { getEffectiveConfig: () => object }) => unknown) =>
    selector({ getEffectiveConfig: () => ({}) }),
}));
vi.mock('@/services/AppWindowManager', () => ({
  AppWindowManager: { getInstance: vi.fn() },
}));
vi.mock('@/components/os/workspace', () => ({
  ProjectWorkspace: () => null,
  WorkspaceWindow: () => null,
}));
vi.mock('@/components/solution/SolutionDesign', () => ({
  SolutionDesign: () => null,
}));
vi.mock('@/components/os/workspace/project-identity', () => ({
  normalizeProjectEntryId: (value: string) => value,
  normalizeOntologyId: () => 'ontology-test',
}));
vi.mock('@/components/os/workspace/project-canonical-ontology', () => ({
  loadProjectCanonicalOntology: vi.fn(),
  canonicalToOntologyModel: vi.fn(() => ({
    id: 'model-test',
    name: '供应商管理',
    description: '',
    nodes: [],
    createdAt: Date.now(),
  })),
}));
vi.mock('@/services/interview-behavior-drafts', () => ({
  loadInterviewBehaviorDraft: vi.fn().mockResolvedValue(null),
  confirmInterviewBehaviorDraft: vi.fn(),
}));
vi.mock('../ResizableLayout', () => ({
  ResizableLayout: ({ leftPanel }: { leftPanel: React.ReactNode }) => <>{leftPanel}</>,
}));
vi.mock('../CUIDialogPanel', () => ({
  CUIDialogPanel: ({
    interviewComplete,
    onOpenSolutionDesign,
  }: {
    interviewComplete?: boolean;
    onOpenSolutionDesign?: () => void;
  }) => interviewComplete ? (
    <button type="button" onClick={onOpenSolutionDesign}>进入解决方案设计</button>
  ) : null,
}));
vi.mock('../ArtifactDisplayPanel', () => ({ ArtifactDisplayPanel: () => null }));

const now = new Date('2026-10-15T00:00:00.000Z');

function createOntology(complete: boolean): CanonicalOntology {
  return {
    id: 'ontology-test',
    projectId: 'project-test',
    name: '供应商管理',
    schemaVersion: '1.0.0',
    version: '1.0.0',
    domains: [{ id: 'domain-1', name: '供应商管理', description: '', createdAt: now, updatedAt: now }],
    concepts: [{ id: 'concept-1', domainId: 'domain-1', name: '供应商', type: 'entity', attributes: {}, createdAt: now, updatedAt: now }],
    instances: [],
    properties: [],
    relations: complete ? [{ id: 'relation-1', name: '提交', sourceConceptId: 'concept-1', targetConceptId: 'concept-1', cardinality: 'one-to-many' }] : [],
    businessStates: [],
    transitions: [],
    factTypes: complete ? [{ id: 'fact-1', conceptId: 'concept-1', name: '供应商事实', propertyIds: [] }] : [],
    rules: complete ? [{ id: 'rule-1', name: '准入规则', kind: 'precondition', expression: true, severity: 'error' }] : [],
    actions: complete ? [{ id: 'action-1', name: '准入', conceptId: 'concept-1', inputFactTypeIds: ['fact-1'], outputFactTypeIds: ['fact-1'] }] : [],
    events: [],
    projections: [],
    createdAt: now,
    updatedAt: now,
  };
}

const mockedUsePersistentAgent = vi.mocked(usePersistentAgent);
const mockedLoadOntology = vi.mocked(loadProjectCanonicalOntology);
const mockedGetWindowManager = vi.mocked(AppWindowManager.getInstance);

describe('InterviewWindow solution handoff', () => {
  const openComponentWindow = vi.fn();
  const agentState = {
    isReady: true,
    isThinking: false,
    messages: [],
    toolExecutions: [],
    artifactVersion: 0,
    sendMessage: vi.fn().mockResolvedValue(undefined),
    triggerGreeting: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    agentState.artifactVersion = 0;
    mockedUsePersistentAgent.mockImplementation(() => agentState);
    mockedGetWindowManager.mockReturnValue({ openComponentWindow } as never);
  });

  it('shows the handoff after reopening a canonically complete interview', async () => {
    mockedLoadOntology.mockResolvedValue({
      entry: { kind: 'canonical' },
      ontology: createOntology(true),
    } as Awaited<ReturnType<typeof loadProjectCanonicalOntology>>);

    render(<InterviewWindow projectId="project-test" projectName="供应商项目" />);
    fireEvent.click(await screen.findByRole('button', { name: '进入解决方案设计' }));

    expect(openComponentWindow).toHaveBeenCalledWith(
      'solution-design-project-test',
      '供应商项目 · AI 解决方案',
      expect.any(Function),
      {
        projectId: 'project-test',
        projectName: '供应商项目',
        ontologyId: 'ontology-test',
      },
      expect.objectContaining({
        metadata: expect.objectContaining({
          entryType: 'solution',
          entryId: 'project-test',
          projectId: 'project-test',
        }),
      })
    );
  });

  it('does not show the handoff while canonical sections are incomplete', async () => {
    mockedLoadOntology.mockResolvedValue({
      entry: { kind: 'canonical' },
      ontology: createOntology(false),
    } as Awaited<ReturnType<typeof loadProjectCanonicalOntology>>);

    render(<InterviewWindow projectId="project-test" projectName="供应商项目" />);
    await waitFor(() => expect(mockedLoadOntology).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: '进入解决方案设计' })).not.toBeInTheDocument();
  });

  it('shows the handoff when the current interview publishes its final canonical sections', async () => {
    mockedLoadOntology
      .mockResolvedValueOnce({
        entry: { kind: 'canonical' },
        ontology: createOntology(false),
      } as Awaited<ReturnType<typeof loadProjectCanonicalOntology>>)
      .mockResolvedValue({
        entry: { kind: 'canonical' },
        ontology: createOntology(true),
      } as Awaited<ReturnType<typeof loadProjectCanonicalOntology>>);

    const { rerender } = render(<InterviewWindow projectId="project-test" projectName="供应商项目" />);
    await waitFor(() => expect(mockedLoadOntology).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '进入解决方案设计' })).not.toBeInTheDocument();

    agentState.artifactVersion = 1;
    rerender(<InterviewWindow projectId="project-test" projectName="供应商项目" />);
    expect(await screen.findByRole('button', { name: '进入解决方案设计' })).toBeInTheDocument();
  });
});
