import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectorForm } from '../ConnectorForm';
import { RuleWizard } from '../RuleWizard';
import type { PerceptionConnectorConfig, PerceptionTriggerRule } from '@originos/core/types';

describe('ConnectorForm', () => {
  it.each([
    ['email', 'email-poll'], ['wecom', 'webhook'], ['feishu', 'webhook'], ['dingtalk', 'stream'],
  ] as const)('builds a disabled %s connector with write-only secret reference', async (source, mode) => {
    const onSave = vi.fn<[PerceptionConnectorConfig], Promise<void>>(async () => undefined);
    const onCancel = vi.fn();
    render(<ConnectorForm onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('平台'), { target: { value: source } });
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: `${source}-main` } });
    fireEvent.change(screen.getByLabelText('Secret 引用（提交后不回显）'), { target: { value: `secret://perception/${source}-main` } });
    fireEvent.click(screen.getByRole('button', { name: '保存为停用状态' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ source, mode, enabled: false, secretRef: `secret://perception/${source}-main` });
    expect(onCancel).toHaveBeenCalled();
  });

  it('rejects a raw secret value that is not a provider reference', () => {
    const onSave = vi.fn<[PerceptionConnectorConfig], Promise<void>>(async () => undefined);
    render(<ConnectorForm onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: 'email-main' } });
    fireEvent.change(screen.getByLabelText('Secret 引用（提交后不回显）'), { target: { value: 'raw-password' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为停用状态' }));
    expect(screen.getByRole('alert')).toHaveTextContent('secret://');
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('RuleWizard', () => {
  const connector = { id: 'email-main', source: 'email', mode: 'email-poll', enabled: true, settings: {}, createdAt: '2026-08-28T08:00:00.000Z', updatedAt: '2026-08-28T08:00:00.000Z', secretConfigured: true } as const;
  const now = '2026-08-28T08:00:00.000Z';

  it('prevents creation when no target is externally authorized', () => {
    const onSave = vi.fn<[PerceptionTriggerRule], Promise<void>>(async () => undefined);
    render(<RuleWizard connectors={[connector]} grants={[]} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('尚无允许外部触发的目标');
    expect(screen.getByRole('button', { name: '保存为停用规则' })).toBeDisabled();
  });

  it('persists explicit inherited cognition ownership for a Skill target', async () => {
    const onSave = vi.fn<[PerceptionTriggerRule], Promise<void>>(async () => undefined);
    const grants = [
      { target: { kind: 'skill' as const, id: 'triage' }, enabled: true, createdAt: now, updatedAt: now },
      { target: { kind: 'project' as const, id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now },
    ];
    render(<RuleWizard connectors={[connector]} grants={grants} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('规则 ID'), { target: { value: 'mail-triage' } });
    fireEvent.change(screen.getByLabelText('Skill 认知归属'), { target: { value: 'project:project-1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为停用规则' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      enabled: false,
      target: { kind: 'skill', id: 'triage', skillOwnership: { mode: 'inherited', ownerKind: 'project', ownerId: 'project-1' } },
    });
  });
});
