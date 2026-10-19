import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SolutionOutputAcceptanceSnapshot } from '@originos/core/lib/features/solution';

const clients = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/services/solution-output-acceptance-client', () => ({
  getSolutionOutputAcceptance: clients.get,
  saveSolutionOutputAcceptance: clients.save,
}));

const { SolutionOutputAcceptancePanel } = await import(
  '../SolutionOutputAcceptancePanel'
);

const snapshot: SolutionOutputAcceptanceSnapshot = {
  projectId: 'project-1',
  solutionId: 'solution-1',
  solutionVersion: 'v1',
  status: 'draft',
  locked: false,
  published: false,
  nodes: [
    {
      nodeId: 'agent-node',
      kind: 'agent',
      contractRef: 'agent-owner',
      name: 'agent-owner',
      mode: 'automatic',
    },
    {
      nodeId: 'skill-node',
      kind: 'skill',
      contractRef: 'skill-review',
      name: 'skill-review',
      mode: 'user',
    },
  ],
  roles: [
    { id: 'agent-owner', name: '方案负责人' },
    { id: 'agent-reviewer', name: '质量审核员' },
  ],
};

function renderPanel(overrides?: Partial<SolutionOutputAcceptanceSnapshot>) {
  clients.get.mockResolvedValue({
    success: true,
    data: { ...snapshot, ...overrides },
    timestamp: '2026-10-15T00:00:00.000Z',
  });
  return render(
    <SolutionOutputAcceptancePanel
      projectId="project-1"
      solutionId="solution-1"
      solutionVersion="v1"
      agents={[{ id: 'agent-owner', name: '方案负责人' }]}
      skills={[{ id: 'skill-review', name: '材料复核' }]}
      onCreateVersion={vi.fn()}
    />
  );
}

describe('SolutionOutputAcceptancePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clients.save.mockResolvedValue({
      success: true,
      data: snapshot,
      timestamp: '2026-10-15T00:00:00.000Z',
    });
  });

  it('shows Chinese node names and saves automatic/user/role policy choices', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByText('方案负责人')).toBeInTheDocument();
    expect(screen.getByText('材料复核')).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText('方案负责人的验收方式'),
      'role'
    );
    await user.selectOptions(
      screen.getByLabelText('方案负责人的验收角色'),
      'agent-reviewer'
    );
    await user.click(screen.getByRole('button', { name: '保存验收策略' }));

    await waitFor(() =>
      expect(clients.save).toHaveBeenCalledWith({
        projectId: 'project-1',
        solutionId: 'solution-1',
        solutionVersion: 'v1',
        nodes: [
          {
            nodeId: 'agent-node',
            mode: 'role',
            approverRole: 'agent-reviewer',
          },
          { nodeId: 'skill-node', mode: 'user' },
        ],
      })
    );
    expect(
      await screen.findByText('产出验收策略已保存。')
    ).toBeInTheDocument();
  });

  it('keeps confirmed or published versions read-only and offers version creation', async () => {
    const onCreateVersion = vi.fn();
    clients.get.mockResolvedValue({
      success: true,
      data: { ...snapshot, status: 'confirmed', locked: true },
      timestamp: '2026-10-15T00:00:00.000Z',
    });
    const user = userEvent.setup();
    render(
      <SolutionOutputAcceptancePanel
        projectId="project-1"
        solutionId="solution-1"
        solutionVersion="v1"
        agents={[{ id: 'agent-owner', name: '方案负责人' }]}
        skills={[{ id: 'skill-review', name: '材料复核' }]}
        onCreateVersion={onCreateVersion}
      />
    );

    expect(
      await screen.findByText(/验收策略只读/)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('方案负责人的验收方式')
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: '保存验收策略' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '创建新版本' }));
    expect(onCreateVersion).toHaveBeenCalledOnce();
  });
});
