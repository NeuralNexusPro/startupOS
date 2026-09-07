import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectorForm } from '../ConnectorForm';
import { RuleWizard } from '../RuleWizard';
import { TargetGrantForm } from '../TargetGrantForm';
import type { ExternalTriggerGrant, PerceptionConnectorConfig, PerceptionTriggerRule } from '@originos/core/types';

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
  it.each([['dingtalk', 'stream']] as const)('builds a disabled %s connector without browser credentials', async (source, mode) => {
    const onSave = vi.fn<[PerceptionConnectorConfig], Promise<void>>(async () => undefined);
    const onCancel = vi.fn();
    render(<ConnectorForm onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('平台'), { target: { value: source } });
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: `${source}-main` } });
    fireEvent.click(screen.getByRole('button', { name: '保存为停用状态' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ source, mode, enabled: false });
    expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty('secretRef');
    expect(onCancel).toHaveBeenCalled();
  });

  it('provisions a disabled Feishu connector through Desktop IPC', async () => {
    const invoke = vi.fn(async () => ({ success: true, data: { connectorId: 'feishu-main', secretConfigured: true }, timestamp: new Date().toISOString() }));
    (window as Window & { electron?: unknown }).electron = { isElectron: true, ipcRenderer: { invoke, send: vi.fn(), on: vi.fn() } };
    render(<ConnectorForm onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('平台'), { target: { value: 'feishu' } });
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: 'feishu-main' } });
    fireEvent.change(screen.getByLabelText('App ID'), { target: { value: 'cli-app' } });
    fireEvent.change(screen.getByLabelText('App Secret（不会回显）'), { target: { value: 'app-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为停用状态' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('perception:feishu:provision', {
      connectorId: 'feishu-main', profile: { appId: 'cli-app', domain: 'feishu' }, secret: { appSecret: 'app-secret' },
    }));
  });

  it('builds a disabled WeCom connector with an environment secret reference and callback path', async () => {
    const invoke = vi.fn(async () => ({ success: true, data: { connectorId: 'wecom-main', secretConfigured: true }, timestamp: new Date().toISOString() }));
    (window as Window & { electron?: unknown }).electron = { isElectron: true, ipcRenderer: { invoke, send: vi.fn(), on: vi.fn() } };
    render(<ConnectorForm onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('平台'), { target: { value: 'wecom' } });
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: 'wecom-main' } });
    fireEvent.change(screen.getByLabelText('智能机器人 Bot ID'), { target: { value: 'bot-id' } });
    fireEvent.change(screen.getByLabelText('智能机器人 Secret（不会回显）'), { target: { value: 'bot-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为停用状态' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('perception:wecom:provision', expect.objectContaining({ connectorId: 'wecom-main', profile: { transport: 'aibot-websocket', botId: 'bot-id' }, secret: { value: 'bot-secret' } })));
  });

  it('fails closed when mail provisioning is opened in Web-only mode', () => {
    const onSave = vi.fn<[PerceptionConnectorConfig], Promise<void>>(async () => undefined);
    render(<ConnectorForm onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: 'email-main' } });
    fireEvent.change(screen.getByLabelText('IMAP 主机'), { target: { value: 'imap.example.com' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText('密码（不会回显）'), { target: { value: 'not-sent' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并测试连接' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Desktop');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('sends mail credentials only over Desktop IPC and refreshes after a successful test', async () => {
    const invoke = vi.fn(async () => ({ success: true, data: { connectorId: 'email-main', secretConfigured: true, test: { success: true, receipt: { connectorId: 'email-main', profileFingerprint: 'fp', verifiedAt: new Date().toISOString(), capabilities: [], mailbox: 'INBOX' } } }, timestamp: new Date().toISOString() }));
    (window as Window & { electron?: unknown }).electron = { isElectron: true, ipcRenderer: { invoke, send: vi.fn(), on: vi.fn() } };
    const onProvisioned = vi.fn(async () => undefined);
    const onCancel = vi.fn();
    render(<ConnectorForm onSave={vi.fn()} onProvisioned={onProvisioned} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: 'email-main' } });
    fireEvent.change(screen.getByLabelText('IMAP 主机'), { target: { value: 'imap.example.com' } });
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'me@example.com' } });
    fireEvent.change(screen.getByLabelText('密码（不会回显）'), { target: { value: 'app-password' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并测试连接' }));
    await waitFor(() => expect(onProvisioned).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('perception:mail:provision-test', expect.objectContaining({ secret: { kind: 'password', value: 'app-password' } }));
    expect(onCancel).toHaveBeenCalled();
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
