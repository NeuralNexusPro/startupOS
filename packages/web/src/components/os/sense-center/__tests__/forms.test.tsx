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
    expect(screen.queryByRole('option', { name: '未命名角色能力' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('当前感知源尚未获得任何目标授权');
  });

  it('keeps a rule bound to its selected connector when multiple connectors use the same channel', async () => {
    const onSave = vi.fn<[PerceptionTriggerRule], Promise<void>>(async () => undefined);
    const wecomOne = { ...connector, id: 'wecom-one', source: 'wecom' as const, mode: 'webhook' as const };
    const wecomTwo = { ...wecomOne, id: 'wecom-two' };
    const initial: PerceptionTriggerRule = {
      id: 'wecom-rule', enabled: true, sources: ['wecom'], eventTypes: ['message.received'],
      conditions: [{ path: 'connectorId', operator: 'equals', value: 'wecom-two' }, { path: 'content.text', operator: 'contains', value: '报价' }],
      target: { kind: 'role-agent', id: 'assistant' }, execution: { requireHitl: false, maxAttempts: 3 }, createdAt: now, updatedAt: now,
    };
    const grants = [{ target: { kind: 'role-agent' as const, id: 'assistant' }, enabled: true, createdAt: now, updatedAt: now }];
    render(<RuleWizard connectors={[wecomOne, wecomTwo]} grants={grants} initial={initial} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('来源')).toHaveValue('wecom-two');
    expect(screen.getByDisplayValue('报价')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0].conditions).toEqual(initial.conditions);
  });

  it('requires an explicit connector for ambiguous legacy rules', () => {
    const wecomOne = { ...connector, id: 'wecom-one', source: 'wecom' as const, mode: 'webhook' as const };
    const wecomTwo = { ...wecomOne, id: 'wecom-two' };
    const initial: PerceptionTriggerRule = { id: 'legacy-wecom', enabled: true, sources: ['wecom'], eventTypes: ['message.received'], conditions: [], target: { kind: 'role-agent', id: 'assistant' }, execution: { requireHitl: false, maxAttempts: 3 }, createdAt: now, updatedAt: now };
    const grants = [{ target: { kind: 'role-agent' as const, id: 'assistant' }, enabled: true, createdAt: now, updatedAt: now }];
    render(<RuleWizard connectors={[wecomOne, wecomTwo]} grants={grants} initial={initial} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('来源')).toHaveValue('');
    expect(screen.getByRole('alert')).toHaveTextContent('该历史规则未记录具体感知源');
    expect(screen.getByRole('button', { name: '保存规则' })).toBeDisabled();
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

  it('creates a Jev rule from multiple authorized candidates with the fixed threshold', async () => {
    const onSave = vi.fn<[PerceptionTriggerRule], Promise<void>>(async () => undefined);
    const grants = [
      { target: { kind: 'project' as const, id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now },
      { target: { kind: 'role-agent' as const, id: 'assistant' }, enabled: true, createdAt: now, updatedAt: now },
    ];
    const loadAssets = vi.fn(async (kind) => kind === 'project' ? [{ id: 'project-1', name: '招聘项目' }] : kind === 'role-agent' ? [{ id: 'assistant', name: '鹰眼', detail: '角色能力' }] : []);
    render(<RuleWizard connectors={[connector]} grants={grants} loadAssets={loadAssets} jevProvider={{ enabled: true, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', credentialConfigured: true }} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('智能决策模式'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '招聘项目' })).toBeInTheDocument());
    expect(screen.queryByLabelText('来源')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('白名单字段')).not.toBeInTheDocument();
    expect(screen.getByText('无需 HITL 时，首二目标候选的概率差值严格大于 0.5 才自动执行；否则由用户选择。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '招聘项目' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '鹰眼 · 角色能力' }));
    fireEvent.change(screen.getByLabelText('决策规则'), { target: { value: '简历相关问题优先交给鹰眼。' } });
    fireEvent.click(screen.getByLabelText('创建后立即启用'));
    fireEvent.click(screen.getByRole('button', { name: '创建并启用' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ routingMode: 'jev', decision: { catalogVersion: '1.0', policyVersion: '1.0', candidates: [
      { key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' },
      { key: 'ask_user_to_choose_target', action: 'ask_user_to_choose_target' },
      { key: 'project:project-1', action: 'dispatch' }, { key: 'role-agent:assistant', action: 'dispatch' },
    ], cognitiveGuidance: '简历相关问题优先交给鹰眼。' }, conditions: [], sources: ['email'] });
  });

  it('blocks enabled Jev rules without a configured provider but allows a disabled draft', async () => {
    const onSave = vi.fn<[PerceptionTriggerRule], Promise<void>>(async () => undefined);
    const grants = [{ target: { kind: 'project' as const, id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now }];
    render(<RuleWizard connectors={[connector]} grants={grants} loadAssets={async () => [{ id: 'project-1', name: '招聘项目' }]} jevProvider={{ enabled: false, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', credentialConfigured: false }} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('智能决策模式'));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '招聘项目' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: '招聘项目' }));
    fireEvent.click(screen.getByLabelText('创建后立即启用'));
    expect(screen.getByRole('alert')).toHaveTextContent('智能决策模型未配置或未启用');
    expect(screen.getByRole('button', { name: '创建并启用' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('创建后立即启用'));
    fireEvent.click(screen.getByRole('button', { name: '保存为停用规则' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ routingMode: 'jev', enabled: false })));
  });
});
