import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectorForm } from '../ConnectorForm';
import { RuleWizard } from '../RuleWizard';
import { TargetGrantForm } from '../TargetGrantForm';
import type { ExternalTriggerGrant, PerceptionTriggerRule } from '@originos/core/types';
import type { PerceptionPluginManifest } from '@originos/core/modules/perception-runtime';

describe('TargetGrantForm', () => {
  it('creates an enabled, connector-scoped target grant', async () => {
    const onSave = vi.fn<[ExternalTriggerGrant], Promise<void>>(async () => undefined);
    const loadAssets = vi.fn(async () => [{ id: 'assistant', name: '邮件助手', detail: '角色 Agent' }]);
    render(<TargetGrantForm connectors={[{ id: 'email-main' }]} loadAssets={loadAssets} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('目标类型'), { target: { value: 'role-agent' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /邮件助手/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('目标资产'), { target: { value: 'assistant' } });
    fireEvent.change(screen.getByLabelText('限制感知源（可选）'), { target: { value: 'email-main' } });
    fireEvent.click(screen.getByRole('button', { name: '允许外部触发' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ target: { kind: 'role-agent', id: 'assistant' }, enabled: true, allowedConnectorIds: ['email-main'] });
  });

  it('merges a new connector into an existing target grant', async () => {
    const onSave = vi.fn<[ExternalTriggerGrant], Promise<void>>(async () => undefined);
    const existing = [{
      target: { kind: 'role-agent' as const, id: 'assistant' },
      enabled: true,
      allowedConnectorIds: ['wecom-main'],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    }];
    render(<TargetGrantForm connectors={[{ id: 'wecom-main' }, { id: 'feishu-main' }]} grants={existing} loadAssets={async () => [{ id: 'assistant', name: '邮件助手' }]} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('目标类型'), { target: { value: 'role-agent' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /邮件助手/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('目标资产'), { target: { value: 'assistant' } });
    fireEvent.change(screen.getByLabelText('限制感知源（可选）'), { target: { value: 'feishu-main' } });
    fireEvent.click(screen.getByRole('button', { name: '允许外部触发' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      allowedConnectorIds: ['wecom-main', 'feishu-main'],
      createdAt: existing[0]?.createdAt,
    });
  });

  it('does not allow arbitrary IDs when the selected target type has no assets', async () => {
    render(<TargetGrantForm connectors={[]} loadAssets={async () => []} onSave={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('该类型暂无资产，请先创建后再授权。')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '允许外部触发' })).toBeDisabled();
  });
});

describe('ConnectorForm', () => {
  afterEach(() => { delete (window as Window & { electron?: unknown }).electron; });
  const manifests: PerceptionPluginManifest[] = [{ id: 'originos.test', name: '测试插件', version: '1.0.0', hostApi: '1.0', entry: '@originos/test', source: 'email', transport: 'poll', capabilities: [], permissions: ['credentials'], configurationSchema: { version: '1.0', fields: [{ key: 'host', label: '主机', type: 'text', required: true }, { key: 'secret', label: '密钥', type: 'password', required: true, sensitive: true }, { key: 'secure', label: 'TLS', type: 'boolean', defaultValue: true }] } }];
  it('renders a controlled manifest schema and sends secrets only through generic IPC', async () => {
    const invoke = vi.fn(async () => ({ success: true, data: { connectorId: 'test-main' }, timestamp: new Date().toISOString() }));
    (window as Window & { electron?: unknown }).electron = { isElectron: true, ipcRenderer: { invoke, send: vi.fn(), on: vi.fn() } };
    render(<ConnectorForm manifests={manifests} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: 'test-main' } }); fireEvent.change(screen.getByLabelText('主机'), { target: { value: 'example.com' } }); fireEvent.change(screen.getByLabelText('密钥'), { target: { value: 'private' } }); fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('perception:plugin:provision', { pluginId: 'originos.test', connectorId: 'test-main', settings: { host: 'example.com', secure: true }, secrets: { secret: 'private' } }));
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

  it('only offers targets authorized for the selected connector', () => {
    const grants = [{ target: { kind: 'role-agent' as const, id: 'assistant' }, enabled: true, allowedConnectorIds: ['wecom-main'], createdAt: now, updatedAt: now }];
    const feishu = { ...connector, id: 'feishu-main', source: 'feishu' as const, mode: 'stream' as const };
    render(<RuleWizard connectors={[connector, feishu]} grants={grants} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('来源'), { target: { value: 'feishu-main' } });
    expect(screen.queryByRole('option', { name: 'role-agent/assistant' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('当前感知源尚未获得任何目标授权');
  });

  it('generates a valid rule ID and explains invalid manual IDs before saving', () => {
    const onSave = vi.fn<[PerceptionTriggerRule], Promise<void>>(async () => undefined);
    const grants = [{ target: { kind: 'project' as const, id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now }];
    render(<RuleWizard connectors={[connector]} grants={grants} onSave={onSave} onCancel={vi.fn()} />);
    expect((screen.getByLabelText('规则 ID') as HTMLInputElement).value).toMatch(/^rule-[a-z0-9]+$/);
    fireEvent.change(screen.getByLabelText('规则 ID'), { target: { value: '中文规则' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为停用规则' }));
    expect(screen.getByRole('alert')).toHaveTextContent('只能使用英文字母');
    expect(onSave).not.toHaveBeenCalled();
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

  it('can create an enabled rule and preserve lifecycle metadata while editing', async () => {
    const onSave = vi.fn<[PerceptionTriggerRule], Promise<void>>(async () => undefined);
    const grants = [{ target: { kind: 'project' as const, id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now }];
    const { unmount } = render(<RuleWizard connectors={[connector]} grants={grants} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('创建后立即启用'));
    fireEvent.click(screen.getByRole('button', { name: '创建并启用' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ enabled: true })));

    const initial = onSave.mock.calls[0]?.[0];
    if (!initial) throw new Error('Expected created rule');
    unmount();
    onSave.mockClear();
    render(<RuleWizard connectors={[connector]} grants={grants} initial={initial} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('规则 ID')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: initial.id, createdAt: initial.createdAt, enabled: true })));
  });
});
