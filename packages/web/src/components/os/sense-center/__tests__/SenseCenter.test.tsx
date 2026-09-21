import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExternalTriggerGrant, JevDecisionReceipt, PerceptionAuditEntry, PerceptionDeadLetter, PerceptionEventTrace, PerceptionTriggerRule } from '@originos/core/types';

const provider = vi.hoisted(() => ({ get: vi.fn(() => new Promise<never>(() => undefined)) }));
vi.mock('@/services/jevProviderService', () => ({ getJevProvider: provider.get }));

const load = vi.fn(async () => undefined);
const startRefreshing = vi.fn(() => { void load(); return vi.fn(); });
const replay = vi.fn(async () => undefined);
const resolveDecision = vi.fn(async () => undefined);
const retryDecision = vi.fn(async () => undefined);
const state: {
  connectors: []; grants: ExternalTriggerGrant[]; decisionCandidateGrants: ExternalTriggerGrant[]; rules: PerceptionTriggerRule[]; health: [];
  deadLetters: PerceptionDeadLetter[]; audit: PerceptionAuditEntry[]; decisions: JevDecisionReceipt[];
  eventTraces: PerceptionEventTrace[];
  loading: boolean; error: string | undefined; startRefreshing: typeof startRefreshing; load: typeof load; replay: typeof replay;
  setConnectorEnabled: ReturnType<typeof vi.fn>; saveConnector: ReturnType<typeof vi.fn>; saveRule: ReturnType<typeof vi.fn>;
  deleteRule: ReturnType<typeof vi.fn>; saveGrant: ReturnType<typeof vi.fn>; deleteGrant: ReturnType<typeof vi.fn>;
  resolveDecision: typeof resolveDecision; retryDecision: typeof retryDecision;
} = {
  connectors: [], grants: [], decisionCandidateGrants: [], rules: [], health: [], deadLetters: [], audit: [], decisions: [], eventTraces: [], loading: false,
  error: undefined, load, startRefreshing, replay, setConnectorEnabled: vi.fn(), saveConnector: vi.fn(), saveRule: vi.fn(), deleteRule: vi.fn(), saveGrant: vi.fn(), deleteGrant: vi.fn(),
  resolveDecision, retryDecision,
};
vi.mock('@/store/perceptionStore', () => ({ usePerceptionStore: () => state }));

const { SenseCenter } = await import('../SenseCenter');

describe('SenseCenter', () => {
  beforeEach(() => { vi.clearAllMocks(); state.audit = []; state.eventTraces = []; state.deadLetters = []; state.decisions = []; state.grants = []; state.decisionCandidateGrants = []; state.rules = []; });

  it('renders accessible loading-independent navigation and empty states', async () => {
    const startedAt = performance.now();
    render(<SenseCenter />);
    expect(screen.getByRole('main', { name: '感知中心' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '感知中心分区' })).toBeInTheDocument();
    expect(screen.getByText('尚未配置感知源')).toBeInTheDocument();
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it('bounds event rendering to 50 records per page', () => {
    state.eventTraces = Array.from({ length: 61 }, (_, index) => ({ event: {
      schemaVersion: '1.0', id: `event-${index}`, source: 'email', sourceEventId: `mail-${index}`, connectorId: 'email-main', type: 'mail.received', occurredAt: '2026-08-28T08:00:00.000Z', receivedAt: '2026-08-28T08:00:01.000Z', actor: { externalId: 'sender@example.com' }, content: { subject: 'hello' }, provenance: { rawPayloadRef: 'inbox://safe' },
    }, ruleTriggers: [], audit: [] }));
    const { container } = render(<SenseCenter />);
    fireEvent.click(screen.getByRole('button', { name: '事件记录' }));
    expect(container.querySelectorAll('article[aria-label^="感知事件"]')).toHaveLength(50);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(container.querySelectorAll('article[aria-label^="感知事件"]')).toHaveLength(11);
  });

  it('separates perception data, rule trigger time, and target result', () => {
    const now = '2026-09-04T08:00:00.000Z';
    state.eventTraces = [{ event: { schemaVersion: '1.0', id: 'event-1', source: 'email', sourceEventId: 'mail-1', connectorId: 'email-main', type: 'mail.received', occurredAt: now, receivedAt: now, actor: { externalId: 'sender@example.com' }, content: { subject: 'New lead', text: 'Please follow up' }, provenance: { rawPayloadRef: 'inbox://safe' } }, audit: [], ruleTriggers: [{ ruleId: 'rule-1', matchedAt: now, dispatchedAt: now, finishedAt: now, rule: { id: 'rule-1', enabled: true, sources: ['email'], eventTypes: ['mail.received'], conditions: [], target: { kind: 'skill', id: 'email-auto-reply' }, execution: { requireHitl: false, maxAttempts: 1 }, createdAt: now, updatedAt: now }, result: { status: 'completed', resultRef: 'perception://session/session-1', sessionId: 'session-1', summary: '已完成邮件分析' } }] }];
    render(<SenseCenter />);
    fireEvent.click(screen.getByRole('button', { name: '事件记录' }));
    expect(screen.getByText('感知事件')).toBeInTheDocument();
    expect(screen.getByText('规则触发')).toBeInTheDocument();
    expect(screen.getByText('目标处理')).toBeInTheDocument();
    expect(screen.getByText('Please follow up')).toBeInTheDocument();
    expect(screen.getByText('已完成邮件分析')).toBeInTheDocument();
  });

  it('collapses event traces independently and expands only the newest by default', () => {
    const now = '2026-09-04T08:00:00.000Z';
    state.eventTraces = ['newest', 'older'].map((id) => ({ event: { schemaVersion: '1.0' as const, id, source: 'email' as const, sourceEventId: `mail-${id}`, connectorId: 'email-main', type: 'mail.received' as const, occurredAt: now, receivedAt: now, actor: { externalId: 'sender@example.com' }, content: { subject: `${id} subject`, text: `${id} body` }, provenance: { rawPayloadRef: 'inbox://safe' } }, audit: [], ruleTriggers: [] }));
    const { container } = render(<SenseCenter />);
    fireEvent.click(screen.getByRole('button', { name: '事件记录' }));
    const cards = container.querySelectorAll('details');
    expect(cards[0]).toHaveAttribute('open');
    expect(cards[1]).not.toHaveAttribute('open');

    fireEvent.click(screen.getByLabelText('切换感知事件 older'));

    expect(cards[1]).toHaveAttribute('open');
    expect(screen.getByText('older body')).toBeVisible();
  });

  it('requires confirmation before replaying a dead letter', () => {
    state.deadLetters = [{ id: 'dead-1', retryId: 'retry-1', eventId: 'event-1', ruleId: 'rule-1', connectorId: 'email-main', attempts: 3, lastSafeCode: 'FAILED', createdAt: '2026-08-28T08:00:00.000Z' }];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SenseCenter />);
    fireEvent.click(screen.getByRole('button', { name: '重放最早一条' }));
    expect(replay).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '重放最早一条' }));
    expect(replay).toHaveBeenCalledWith('email-main', 'dead-1');
  });

  it('manages external-trigger target grants from the target permissions tab', async () => {
    const now = '2026-09-04T08:00:00.000Z';
    state.grants = [{ target: { kind: 'project', id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now }];
    state.decisionCandidateGrants = state.grants;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SenseCenter />);
    fireEvent.click(screen.getByRole('button', { name: '目标权限' }));
    expect(screen.getByText('project-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '停用' }));
    expect(state.saveGrant).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(state.deleteGrant).toHaveBeenCalledWith(state.grants[0]);
  });

  it('enables, edits, and confirms deletion of a trigger rule', () => {
    const now = '2026-09-04T08:00:00.000Z';
    state.grants = [{ target: { kind: 'project', id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now }];
    state.decisionCandidateGrants = state.grants;
    state.rules = [{ id: 'rule-1', enabled: false, sources: ['email'], eventTypes: ['mail.received'], conditions: [], target: { kind: 'project', id: 'project-1' }, execution: { requireHitl: true, maxAttempts: 3 }, createdAt: now, updatedAt: now }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SenseCenter />);
    fireEvent.click(screen.getByRole('button', { name: '触发规则' }));
    fireEvent.click(screen.getByRole('button', { name: '启用' }));
    expect(state.saveRule).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1', enabled: true }));
    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect(screen.getByRole('form', { name: '编辑触发规则' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(state.deleteRule).toHaveBeenCalledWith('rule-1');
  });

  it('shows Jev rule metadata and accessible pending-decision actions without guessing a target', async () => {
    const now = '2026-09-04T08:00:00.000Z';
    const candidates = [
      { key: 'ignore' as const, action: 'ignore' as const },
      { key: 'notify_user' as const, action: 'notify_user' as const },
      { key: 'project:project-1', action: 'dispatch' as const, target: { kind: 'project' as const, id: 'project-1' } },
      { key: 'role-agent:removed', action: 'dispatch' as const, target: { kind: 'role-agent' as const, id: 'removed' } },
    ];
    const rule: PerceptionTriggerRule = { id: 'rule-jev', enabled: true, routingMode: 'jev', sources: ['email'], eventTypes: ['mail.received'], conditions: [], decision: { catalogVersion: '1.0', policyVersion: '1.0', candidates }, execution: { requireHitl: false, maxAttempts: 1 }, createdAt: now, updatedAt: now };
    state.rules = [rule];
    state.grants = [{ target: { kind: 'project', id: 'project-1' }, enabled: true, createdAt: now, updatedAt: now }];
    state.decisionCandidateGrants = state.grants;
    state.eventTraces = [{ event: { schemaVersion: '1.0', id: 'event-jev', source: 'email', sourceEventId: 'mail-jev', connectorId: 'email-main', type: 'mail.received', occurredAt: now, receivedAt: now, actor: { externalId: 'sender@example.com' }, content: { subject: 'Needs routing' }, provenance: { rawPayloadRef: 'inbox://safe' } }, audit: [], ruleTriggers: [{ ruleId: rule.id, matchedAt: now, rule }] }];
    state.decisions = [{ id: 'decision-1', eventId: 'event-jev', ruleId: rule.id, catalogVersion: '1.0', policyVersion: '1.0', candidateKeys: candidates.map((item) => item.key), answers: { providerModel: 'jev-latest', routeTarget: { choice: 'project:project-1', confidence: 0.8, probabilities: { ignore: 0.05, notify_user: 0.05, 'project:project-1': 0.7, 'role-agent:removed': 0.2 } }, urgency: { score: 1, confidence: 0.9, probabilities: { low: 0.1, medium: 0.8, high: 0.1 } }, risk: { score: 1, confidence: 0.9, probabilities: { low: 0.8, medium: 0.1, high: 0.1 } }, needsHitl: 0.2, retainAsEvidence: 0 }, threshold: 0.8, status: 'pending', reason: 'LOW_CONFIDENCE', createdAt: now, updatedAt: now }];
    render(<SenseCenter />);
    fireEvent.click(screen.getByRole('button', { name: '触发规则' }));
    expect(screen.getByText('email → Jev 决策（2 个目标候选）')).toBeInTheDocument();
    expect(screen.getByText(/目录 1.0 · 策略 1.0 · 阈值 > 0.8/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '事件记录' }));
    expect(screen.getByRole('status')).toHaveTextContent('等待你的选择');
    expect(screen.getByText('目标已删除或授权已撤销，请刷新候选')).toBeInTheDocument();
    const targetButtons = screen.getAllByRole('button', { name: '选择此目标' });
    expect(targetButtons[0]).toBeEnabled(); expect(targetButtons[1]).toBeDisabled();
    expect(resolveDecision).not.toHaveBeenCalled();
    fireEvent.click(targetButtons[0]!);
    await waitFor(() => expect(resolveDecision).toHaveBeenCalledWith('decision-1', 'project:project-1'));
  });

  it('offers retry for safe Provider errors and disables all actions after resolution', async () => {
    const now = '2026-09-04T08:00:00.000Z';
    const candidate = { key: 'project:project-1', action: 'dispatch' as const, target: { kind: 'project' as const, id: 'project-1' } };
    const rule: PerceptionTriggerRule = { id: 'rule-jev', enabled: true, routingMode: 'jev', sources: ['email'], eventTypes: ['mail.received'], conditions: [], decision: { catalogVersion: '1.0', policyVersion: '1.0', candidates: [{ key: 'ignore', action: 'ignore' }, { key: 'notify_user', action: 'notify_user' }, candidate] }, execution: { requireHitl: false, maxAttempts: 1 }, createdAt: now, updatedAt: now };
    state.grants = [{ target: candidate.target, enabled: true, createdAt: now, updatedAt: now }];
    state.decisionCandidateGrants = state.grants;
    state.eventTraces = [{ event: { schemaVersion: '1.0', id: 'event-jev', source: 'email', sourceEventId: 'mail-jev', connectorId: 'email-main', type: 'mail.received', occurredAt: now, receivedAt: now, actor: { externalId: 'sender@example.com' }, content: { subject: 'Provider failed' }, provenance: { rawPayloadRef: 'inbox://safe' } }, audit: [], ruleTriggers: [{ ruleId: rule.id, matchedAt: now, rule }] }];
    state.decisions = [{ id: 'decision-failed', eventId: 'event-jev', ruleId: rule.id, catalogVersion: '1.0', policyVersion: '1.0', candidateKeys: ['ignore', candidate.key], threshold: 0.8, status: 'failed', reason: 'JEV_TIMEOUT', createdAt: now, updatedAt: now }];
    const view = render(<SenseCenter />); fireEvent.click(screen.getByRole('button', { name: '事件记录' }));
    fireEvent.click(screen.getByRole('button', { name: '重试决策' }));
    await waitFor(() => expect(retryDecision).toHaveBeenCalledWith('decision-failed'));
    view.unmount();
    state.decisions[0] = { ...state.decisions[0]!, status: 'user-executed', selectedKey: candidate.key, leaseId: 'lease-1', resultRef: 'result-1' };
    render(<SenseCenter />); fireEvent.click(screen.getByRole('button', { name: '事件记录' }));
    expect(screen.getByRole('button', { name: '选择此目标' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '忽略' })).toBeDisabled();
    expect(screen.getByText(/已解决操作不可重复执行/)).toBeInTheDocument();
  });
});
