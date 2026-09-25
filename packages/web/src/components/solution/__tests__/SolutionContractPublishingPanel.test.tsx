import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  SolutionContractPublishingPanel,
  type SolutionContractPublishingPanelProps,
} from '../SolutionContractPublishingPanel';

import type {
  DesignGap,
  PublishedSolutionExecutionContract,
  SolutionExecutionContract,
} from '@originos/core/lib/features/solution';

const contract: SolutionExecutionContract = {
  schemaVersion: '1.0.0',
  contractId: 'contract-project-solution-v1',
  contractHash: 'sha256:abc123',
  projectId: 'project-1',
  solutionId: 'solution-1',
  solutionVersion: '1.0.0',
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
function props(
  overrides: Partial<SolutionContractPublishingPanelProps> = {}
): SolutionContractPublishingPanelProps {
  return {
    snapshot: { designStatus: 'confirmed', published: null },
    onCheck: vi.fn().mockResolvedValue({ ok: true, contract }),
    onPublish: vi.fn().mockResolvedValue({ ok: true, published }),
    onRead: vi.fn().mockResolvedValue(published),
    onRevoke: vi.fn().mockResolvedValue({
      contract,
      revocation: {
        contractId: contract.contractId,
        revokedAt: '2026-09-25T01:00:00.000Z',
        reason: '方案已替换',
      },
    }),
    onSnapshotChange: vi.fn(),
    onCreateVersion: vi.fn(),
    ...overrides,
  };
}

describe('SolutionContractPublishingPanel', () => {
  it.each([
    ['draft', '草稿'],
    ['reviewing', '评审中'],
    ['confirmed', '已确认，待发布'],
  ] as const)(
    'projects %s without inventing publication state',
    (status, label) => {
      render(
        <SolutionContractPublishingPanel
          {...props({ snapshot: { designStatus: status, published: null } })}
        />
      );
      expect(screen.getByTestId('publishing-status')).toHaveTextContent(label);
      const publishButton = screen.getByRole('button', {
        name: '发布执行契约',
      });
      if (status === 'confirmed') {
        expect(publishButton).toBeEnabled();
      } else {
        expect(publishButton).toBeDisabled();
      }
    }
  );

  it('groups DesignGap and locates one with the keyboard', async () => {
    const user = userEvent.setup();
    const onLocateGap = vi.fn();
    const gaps: readonly DesignGap[] = [
      {
        code: 'MISSING_VERIFIER',
        severity: 'error',
        scope: 'node',
        refId: 'worker-node',
        message: '节点缺少验证器',
        remediation: '为节点选择验证器。',
      },
      {
        code: 'POLICY_REVIEW',
        severity: 'warning',
        scope: 'policy',
        path: 'hitl.approverRole',
        message: '建议复核审批角色',
        remediation: '确认审批角色仍有效。',
      },
    ];
    render(
      <SolutionContractPublishingPanel
        {...props({
          onCheck: vi.fn().mockResolvedValue({ ok: false, gaps }),
          onLocateGap,
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: '检查发布条件' }));
    expect(
      await screen.findByRole('heading', { name: '节点' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '策略' })).toBeInTheDocument();
    expect(screen.getByText('阻断')).toBeInTheDocument();
    expect(screen.getByText('提醒')).toBeInTheDocument();
    const locate = screen.getByRole('button', {
      name: '定位缺口：节点缺少验证器',
    });
    locate.focus();
    await user.keyboard('{Enter}');
    expect(onLocateGap).toHaveBeenCalledWith(gaps[0]);
  });

  it('blocks keyboard publication after an error gap until a successful re-check', async () => {
    const user = userEvent.setup();
    const blockingGap: DesignGap = {
      code: 'MISSING_VERIFIER',
      severity: 'error',
      scope: 'node',
      refId: 'worker-node',
      message: '节点缺少验证器',
      remediation: '为节点选择验证器。',
    };
    const onCheck = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, gaps: [blockingGap] })
      .mockResolvedValueOnce({ ok: true, contract });
    const onPublish = vi.fn().mockResolvedValue({ ok: true, published });
    render(
      <SolutionContractPublishingPanel
        {...props({ onCheck, onPublish })}
      />
    );

    const checkButton = screen.getByRole('button', {
      name: '检查发布条件',
    });
    checkButton.focus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByText(/请先修复阻断缺口并重新检查/)
    ).toBeInTheDocument();
    const publishButton = screen.getByRole('button', {
      name: '发布执行契约',
    });
    expect(publishButton).toBeDisabled();
    publishButton.focus();
    await user.keyboard('{Enter}');
    expect(onPublish).not.toHaveBeenCalled();

    checkButton.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(publishButton).toBeEnabled());
    publishButton.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
  });

  it('projects publish and exact-read results through the controlled callback', async () => {
    const user = userEvent.setup();
    const onSnapshotChange = vi.fn();
    const onRead = vi.fn().mockResolvedValue(published);
    const view = render(
      <SolutionContractPublishingPanel
        {...props({ onRead, onSnapshotChange })}
      />
    );
    await user.click(screen.getByRole('button', { name: '发布执行契约' }));
    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onSnapshotChange).toHaveBeenCalledWith(published);
    expect(screen.getByTestId('publishing-status')).toHaveTextContent(
      '已确认，待发布'
    );
    view.rerender(
      <SolutionContractPublishingPanel
        {...props({
          snapshot: { designStatus: 'confirmed', published },
          onRead,
          onSnapshotChange,
        })}
      />
    );
    expect(screen.getByTestId('publishing-status')).toHaveTextContent('已发布');
    expect(screen.getByText(contract.contractId)).toBeInTheDocument();
    expect(screen.getByText(contract.contractHash)).toBeInTheDocument();
    expect(screen.getByText(contract.solutionVersion)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '刷新状态' }));
    expect(onRead).toHaveBeenCalledTimes(2);
    expect(onSnapshotChange).toHaveBeenLastCalledWith(published);
  });

  it('exposes loading and failed states', async () => {
    const user = userEvent.setup();
    let resolveCheck:
      | ((value: { ok: true; contract: SolutionExecutionContract }) => void)
      | undefined;
    const onCheck = vi.fn().mockImplementation(
      () =>
        new Promise<{ ok: true; contract: SolutionExecutionContract }>(
          (resolve) => {
            resolveCheck = resolve;
          }
        )
    );
    const view = render(
      <SolutionContractPublishingPanel {...props({ onCheck })} />
    );
    await user.click(screen.getByRole('button', { name: '检查发布条件' }));
    expect(screen.getByRole('button', { name: '正在检查' })).toBeDisabled();
    resolveCheck?.({ ok: true, contract });
    expect(await screen.findByText(/发布条件检查通过/)).toBeInTheDocument();
    view.rerender(
      <SolutionContractPublishingPanel
        {...props({
          onCheck: vi.fn().mockRejectedValue(new Error('检查服务暂不可用')),
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: '检查发布条件' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '检查服务暂不可用'
    );
  });

  it('shows conflict guidance and creates a new version', async () => {
    const user = userEvent.setup();
    const onCreateVersion = vi.fn();
    const error = Object.assign(new Error('version conflict'), {
      code: 'CONTRACT_VERSION_CONFLICT',
    });
    render(
      <SolutionContractPublishingPanel
        {...props({
          onPublish: vi.fn().mockRejectedValue(error),
          onCreateVersion,
        })}
      />
    );
    await user.click(screen.getByRole('button', { name: '发布执行契约' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '请创建新版本后重新发布'
    );
    await user.click(screen.getByRole('button', { name: '创建新版本' }));
    expect(onCreateVersion).toHaveBeenCalledTimes(1);
  });

  it('submits revocation by keyboard and projects the revoked result', async () => {
    const user = userEvent.setup();
    const revoked: PublishedSolutionExecutionContract = {
      contract,
      revocation: {
        contractId: contract.contractId,
        revokedAt: '2026-09-25T01:00:00.000Z',
        reason: '方案已替换',
      },
    };
    const onRevoke = vi.fn().mockResolvedValue(revoked);
    const onSnapshotChange = vi.fn();
    const view = render(
      <SolutionContractPublishingPanel
        {...props({
          snapshot: { designStatus: 'confirmed', published },
          onRevoke,
          onRead: vi.fn().mockResolvedValue(revoked),
          onSnapshotChange,
        })}
      />
    );
    await user.type(screen.getByLabelText('撤销原因'), '方案已替换{Enter}');
    await waitFor(() =>
      expect(onRevoke).toHaveBeenCalledWith(contract.contractId, '方案已替换')
    );
    expect(onSnapshotChange).toHaveBeenCalledWith(revoked);
    view.rerender(
      <SolutionContractPublishingPanel
        {...props({
          snapshot: { designStatus: 'confirmed', published: revoked },
        })}
      />
    );
    expect(screen.getByTestId('publishing-status')).toHaveTextContent('已撤销');
    expect(screen.getByText(/新 Run 不能再使用/)).toBeInTheDocument();
    expect(screen.getByText('原因：方案已替换')).toBeInTheDocument();
  });
});
