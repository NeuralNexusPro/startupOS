import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExternalTriggerGrant, PerceptionAuditEntry, PerceptionDeadLetter, PerceptionEventTrace, PerceptionTriggerRule } from '@originos/core/types';

const load = vi.fn(async () => undefined);
const replay = vi.fn(async () => undefined);
const state: {
  connectors: []; grants: ExternalTriggerGrant[]; rules: PerceptionTriggerRule[]; health: [];
  deadLetters: PerceptionDeadLetter[]; audit: PerceptionAuditEntry[];
  eventTraces: PerceptionEventTrace[];
  loading: boolean; error: string | undefined; load: typeof load; replay: typeof replay;
  setConnectorEnabled: ReturnType<typeof vi.fn>; saveConnector: ReturnType<typeof vi.fn>; saveRule: ReturnType<typeof vi.fn>;
  deleteRule: ReturnType<typeof vi.fn>; saveGrant: ReturnType<typeof vi.fn>; deleteGrant: ReturnType<typeof vi.fn>;
} = {
  connectors: [], grants: [], rules: [], health: [], deadLetters: [], audit: [], eventTraces: [], loading: false,
  error: undefined, load, replay, setConnectorEnabled: vi.fn(), saveConnector: vi.fn(), saveRule: vi.fn(), deleteRule: vi.fn(), saveGrant: vi.fn(), deleteGrant: vi.fn(),
};
vi.mock('@/store/perceptionStore', () => ({ usePerceptionStore: () => state }));

const { SenseCenter } = await import('../SenseCenter');

describe('SenseCenter', () => {
  beforeEach(() => { vi.clearAllMocks(); state.audit = []; state.eventTraces = []; state.deadLetters = []; state.grants = []; state.rules = []; });

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
});
