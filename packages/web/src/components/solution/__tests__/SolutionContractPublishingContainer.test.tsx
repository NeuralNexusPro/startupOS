import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  PublishedSolutionExecutionContract,
  SolutionExecutionContract,
} from '@originos/core/lib/features/solution';

const clients = vi.hoisted(() => ({
  check: vi.fn(),
  publish: vi.fn(),
  read: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('@/services/solution-execution-contract-client', () => ({
  checkSolutionExecutionContract: clients.check,
  publishSolutionExecutionContract: clients.publish,
  readSolutionExecutionContract: clients.read,
  revokeSolutionExecutionContract: clients.revoke,
}));

const { SOLUTION_DESIGN_ACTOR_ID, SolutionContractPublishingContainer } =
  await import('../SolutionContractPublishingContainer');

const contract: SolutionExecutionContract = {
  schemaVersion: '1.0.0',
  contractId: 'contract-project-solution-v1',
  contractHash: 'sha256:abc123',
  projectId: 'project-1',
  solutionId: 'solution-1',
  solutionVersion: 'v1',
  status: 'approved',
  modelingDimension: 'workflow',
  topology: { nodes: [], edges: [], externalInputs: [] },
  agents: [],
  skills: [],
  semanticContext: {
    ontology: { ontologyId: 'ontology-1', ontologyVersion: '1.0.0' },
    sourceRefs: [],
    objectSlots: [],
    factPolicies: [],
    allowedActionIds: [],
    taskTemplates: [],
  },
  verification: [],
  hitl: [],
  permissions: { allowed: [] },
  budget: { maxAttempts: 1, maxDurationMs: 1_000, maxTokens: 1_000 },
  createdAt: '2026-09-25T00:00:00.000Z',
};
const published: PublishedSolutionExecutionContract = { contract };
const notFound = {
  success: false as const,
  error: {
    category: 'not_found' as const,
    code: 'CONTRACT_NOT_FOUND',
    message: '未找到指定的方案或执行契约',
    retryable: false,
  },
};

describe('SolutionContractPublishingContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clients.read.mockResolvedValue(notFound);
    clients.check.mockResolvedValue({
      success: true,
      data: { ok: true, contract },
    });
    clients.publish.mockResolvedValue({
      success: true,
      data: { ok: true, published },
    });
  });

  it('uses the exact typed-client reference and refreshes the authoritative state after publish', async () => {
    const user = userEvent.setup();
    clients.read
      .mockResolvedValueOnce(notFound)
      .mockResolvedValueOnce({ success: true, data: published });
    render(
      <SolutionContractPublishingContainer
        projectId="project-1"
        solutionId="solution-1"
        solutionVersion="v1"
        designStatus="confirmed"
        onCreateVersion={vi.fn()}
      />
    );

    expect(
      await screen.findByRole('heading', { name: '执行契约发布' })
    ).toBeInTheDocument();
    const exactRef = {
      actorId: SOLUTION_DESIGN_ACTOR_ID,
      projectId: 'project-1',
      solutionId: 'solution-1',
      solutionVersion: 'v1',
    };
    expect(clients.read).toHaveBeenNthCalledWith(1, exactRef);

    const checkButton = screen.getByRole('button', {
      name: '检查发布条件',
    });
    checkButton.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(clients.check).toHaveBeenCalledWith(exactRef));

    const publishButton = screen.getByRole('button', {
      name: '发布执行契约',
    });
    publishButton.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(clients.publish).toHaveBeenCalledWith(exactRef));
    expect(clients.read).toHaveBeenNthCalledWith(2, exactRef);
    expect(await screen.findByText(contract.contractId)).toBeInTheDocument();
  });

  it('does not invent a published snapshot when the initial exact read fails', async () => {
    clients.read.mockResolvedValue({
      success: false,
      error: {
        category: 'internal',
        code: 'TRANSPORT_UNAVAILABLE',
        message: '无法连接执行契约服务',
        retryable: true,
      },
    });
    render(
      <SolutionContractPublishingContainer
        projectId="project-1"
        solutionId="solution-1"
        solutionVersion="v1"
        designStatus="confirmed"
        onCreateVersion={vi.fn()}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法连接执行契约服务'
    );
    expect(screen.getByTestId('publishing-status')).toHaveTextContent(
      '已确认，待发布'
    );
    expect(screen.queryByText(contract.contractId)).not.toBeInTheDocument();
  });
});
