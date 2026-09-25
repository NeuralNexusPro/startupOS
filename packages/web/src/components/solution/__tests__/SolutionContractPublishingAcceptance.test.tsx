import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SolutionContractPublishingPanel } from '../SolutionContractPublishingPanel';

describe('solution contract publication acceptance', () => {
  it('keeps publication disabled after a blocking DesignGap is returned', async () => {
    const user = userEvent.setup();
    render(
      <SolutionContractPublishingPanel
        snapshot={{ designStatus: 'confirmed', published: null }}
        onCheck={vi.fn().mockResolvedValue({
          ok: false,
          gaps: [
            {
              code: 'MISSING_VERIFIER',
              severity: 'error',
              scope: 'node',
              refId: 'worker-node',
              message: '节点缺少验证器',
              remediation: '为节点选择验证器。',
            },
          ],
        })}
        onPublish={vi.fn()}
        onRead={vi.fn().mockResolvedValue(null)}
        onRevoke={vi.fn()}
        onSnapshotChange={vi.fn()}
        onCreateVersion={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '检查发布条件' }));
    expect(await screen.findByText('节点缺少验证器')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '发布执行契约' })
    ).toBeDisabled();
  });
});
