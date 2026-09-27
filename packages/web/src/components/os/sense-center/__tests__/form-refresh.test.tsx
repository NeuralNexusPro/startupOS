import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerceptionPluginManifest } from '@originos/core/modules/perception-runtime';
import { usePerceptionStore } from '@/store/perceptionStore';
import { SenseCenter } from '../SenseCenter';

const services = vi.hoisted(() => ({ catalog: vi.fn(), assets: vi.fn(), capabilities: vi.fn(), provider: vi.fn() }));
vi.mock('@/services/perceptionPluginService', () => ({ listPerceptionPlugins: services.catalog, listPerceptionCapabilityStatuses: services.capabilities, canProvisionPlugin: () => true, provisionPerceptionPlugin: vi.fn() }));
vi.mock('@/services/perceptionTargetService', () => ({ listPerceptionTargetAssets: services.assets }));
vi.mock('@/services/jevProviderService', () => ({ getJevProvider: services.provider }));
const now = '2026-09-13T00:00:00Z';
const data = {
  connectors: [{ id: 'email-main', source: 'email' as const, mode: 'email-poll' as const, enabled: true, settings: {}, secretConfigured: true, createdAt: now, updatedAt: now }],
  grants: [{ target: { kind: 'project' as const, id: 'project-main' }, enabled: true, createdAt: now, updatedAt: now }],
  decisionCandidateGrants: [{ target: { kind: 'project' as const, id: 'project-main' }, enabled: true, createdAt: now, updatedAt: now }],
  rules: [], eventTraces: [], audit: [], health: [], deadLetters: [],
};
const fetchMock = vi.fn();
const response = () => ({ ok: true, json: async () => ({ success: true, data: structuredClone(data) }) });
async function tick(): Promise<void> { await act(async () => { await vi.advanceTimersByTimeAsync(5_000); }); }
async function click(name: string): Promise<void> { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  const manifests: PerceptionPluginManifest[] = ['email', 'wecom', 'feishu', 'dingtalk'].map(source => ({ id: `originos.${source}`, name: source, source: source as PerceptionPluginManifest['source'], version: '1', hostApi: '1.0', entry: 'fixture', capabilities: [], permissions: [], transport: 'stream', configurationSchema: { version: '1.0', fields: [{ key: 'account', label: '账号', type: 'text' }, { key: 'secret', label: '凭据', type: 'password', sensitive: true }] } }));
  services.catalog.mockResolvedValue(manifests); services.assets.mockResolvedValue([{ id: 'assistant', name: '助手' }]); services.capabilities.mockResolvedValue([]);
  services.provider.mockResolvedValue({ enabled: true, baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', credentialConfigured: true });
  fetchMock.mockImplementation(response); vi.stubGlobal('fetch', fetchMock);
  usePerceptionStore.setState({ ...structuredClone(data), loading: false, error: undefined });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('SenseCenter drafts during live refresh', () => {
  it('polls only while the events tab is visible and stops on exit/unmount', async () => {
    let view: ReturnType<typeof render> | undefined;
    await act(async () => { view = render(<SenseCenter />); });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(services.capabilities).toHaveBeenCalledTimes(1); await tick(); expect(fetchMock).toHaveBeenCalledTimes(1); expect(services.capabilities).toHaveBeenCalledTimes(1);
    await click('事件记录'); expect(fetchMock).toHaveBeenCalledTimes(2);
    await tick(); expect(fetchMock).toHaveBeenCalledTimes(3);
    await click('感知源'); await tick(); expect(fetchMock).toHaveBeenCalledTimes(3);
    await click('事件记录'); expect(fetchMock).toHaveBeenCalledTimes(4);
    view?.unmount(); await tick(); expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('shows office capability status without exposing account identifiers', async () => {
    const connector = { id: 'wecom-main', source: 'wecom' as const, mode: 'webhook' as const, enabled: true, settings: {}, secretConfigured: true, createdAt: now, updatedAt: now };
    usePerceptionStore.setState({ ...structuredClone(data), connectors: [connector], loading: false, error: undefined });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { ...structuredClone(data), connectors: [connector] } }) });
    services.capabilities.mockResolvedValue([{ connectorId: connector.id, state: 'available', capabilityCount: 13, identityMode: 'user', writeEnabled: false }]);
    await act(async () => { render(<SenseCenter />); });
    expect(screen.getByText('办公能力：可用 · 13 项 · 用户授权 · 当前连接来信均可调用 · 只读')).toBeInTheDocument();
  });
  it('shows an explicit unsupported state for a platform without a safe office adapter', async () => {
    const connector = { id: 'feishu-main', source: 'feishu' as const, mode: 'stream' as const, enabled: true, settings: {}, secretConfigured: true, createdAt: now, updatedAt: now };
    usePerceptionStore.setState({ ...structuredClone(data), connectors: [connector], loading: false, error: undefined });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { ...structuredClone(data), connectors: [connector] } }) });
    services.capabilities.mockResolvedValue([{ connectorId: connector.id, state: 'unsupported' }]);
    await act(async () => { render(<SenseCenter />); });
    expect(screen.getByText('办公能力：暂未接入')).toBeInTheDocument();
  });
  it('does not stop another consumer when leaving events', async () => {
    let stopOther: (() => void) | undefined;
    await act(async () => { stopOther = usePerceptionStore.getState().startRefreshing(); });
    try {
      await act(async () => { render(<SenseCenter />); }); await click('事件记录'); await click('感知源');
      const before = fetchMock.mock.calls.length; await tick(); expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    } finally { stopOther?.(); }
  });

  it.each(['wecom', 'feishu', 'dingtalk'])('retains %s selection, draft, focus and DOM while refreshing', async source => {
    await act(async () => { render(<SenseCenter />); }); await click('添加感知源');
    fireEvent.change(screen.getByLabelText('感知插件'), { target: { value: `originos.${source}` } });
    fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: 'draft-connector' } });
    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'draft-account' } });
    const secret = screen.getByLabelText('凭据'); fireEvent.change(secret, { target: { value: 'unsaved-secret' } }); secret.focus();
    const form = screen.getByRole('form', { name: '添加感知源' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { ...structuredClone(data), health: [{ connectorId: 'email-main', mode: 'email-poll', status: 'healthy', updatedAt: now }], connectors: [{ ...data.connectors[0], enabled: false }] } }) });
    await act(async () => { await usePerceptionStore.getState().load({ silent: true }); });
    expect(screen.getByLabelText('感知插件')).toHaveValue(`originos.${source}`);
    expect(screen.getByLabelText('连接 ID')).toHaveValue('draft-connector'); expect(screen.getByLabelText('账号')).toHaveValue('draft-account'); expect(secret).toHaveValue('unsaved-secret');
    expect(screen.getByLabelText('凭据')).toBe(secret); expect(secret).toHaveFocus(); expect(screen.getByRole('form', { name: '添加感知源' })).toBe(form);
    expect(services.catalog).toHaveBeenCalledTimes(1); expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('已停用')).toBeInTheDocument(); expect(usePerceptionStore.getState().health[0]?.status).toBe('healthy');
    expect(JSON.stringify(usePerceptionStore.getState())).not.toContain('unsaved-secret');
  });
  it('retains target grant selections across refresh', async () => {
    await act(async () => { render(<SenseCenter />); }); await click('目标权限'); await click('添加目标权限');
    await act(async () => { fireEvent.change(screen.getByLabelText('目标类型'), { target: { value: 'role-agent' } }); });
    fireEvent.change(screen.getByLabelText('目标资产'), { target: { value: 'assistant' } }); fireEvent.change(screen.getByLabelText('限制感知源（可选）'), { target: { value: 'email-main' } });
    const form = screen.getByRole('form', { name: '添加目标权限' }); await act(async () => { await usePerceptionStore.getState().load({ silent: true }); });
    expect(screen.getByRole('form', { name: '添加目标权限' })).toBe(form); expect(screen.getByLabelText('目标类型')).toHaveValue('role-agent'); expect(screen.getByLabelText('目标资产')).toHaveValue('assistant'); expect(screen.getByLabelText('限制感知源（可选）')).toHaveValue('email-main');
    expect(services.assets).toHaveBeenCalledWith('role-agent');
  });
  it('retains rule edits across refresh', async () => {
    await act(async () => { render(<SenseCenter />); }); await click('触发规则'); await click('创建规则');
    fireEvent.change(screen.getByLabelText('规则 ID'), { target: { value: 'draft-rule' } });
    fireEvent.change(screen.getByLabelText('白名单字段'), { target: { value: 'content.subject' } });
    fireEvent.click(screen.getByLabelText('智能决策模式')); fireEvent.click(screen.getByLabelText('未命名项目'));
    fireEvent.click(screen.getByLabelText('高风险动作要求人工确认（HITL）'));
    const form = screen.getByRole('form', { name: '创建触发规则' }); await act(async () => { await usePerceptionStore.getState().load({ silent: true }); });
    expect(screen.getByRole('form', { name: '创建触发规则' })).toBe(form); expect(screen.getByLabelText('规则 ID')).toHaveValue('draft-rule'); expect(screen.queryByLabelText('白名单字段')).not.toBeInTheDocument(); expect(screen.getByLabelText('高风险动作要求人工确认（HITL）')).not.toBeChecked();
    expect(screen.getByLabelText('智能决策模式')).toBeChecked(); expect(screen.getByLabelText('未命名项目')).toBeChecked(); expect(services.provider).toHaveBeenCalledTimes(1);
    await tick(); expect(services.provider).toHaveBeenCalledTimes(1);
  });
  it('resets a draft when explicitly cancelled and reopened', async () => {
    await act(async () => { render(<SenseCenter />); }); await click('添加感知源');
    fireEvent.change(screen.getByLabelText('感知插件'), { target: { value: 'originos.dingtalk' } }); fireEvent.change(screen.getByLabelText('连接 ID'), { target: { value: 'discard-me' } });
    fireEvent.click(within(screen.getByRole('form', { name: '添加感知源' })).getByRole('button', { name: '取消' }));
    await click('添加感知源'); expect(screen.getByLabelText('感知插件')).toHaveValue('originos.email'); expect(screen.getByLabelText('连接 ID')).toHaveValue('');
    expect(services.catalog).toHaveBeenCalledTimes(2);
  });
});
