import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerceptionAuditEntry, PerceptionDeadLetter } from '@originos/core/types';

const load = vi.fn(async () => undefined);
const replay = vi.fn(async () => undefined);
const state: {
  connectors: []; grants: []; rules: []; health: [];
  deadLetters: PerceptionDeadLetter[]; audit: PerceptionAuditEntry[];
  loading: boolean; error: string | undefined; load: typeof load; replay: typeof replay;
  setConnectorEnabled: ReturnType<typeof vi.fn>; saveConnector: ReturnType<typeof vi.fn>; saveRule: ReturnType<typeof vi.fn>;
} = {
  connectors: [], grants: [], rules: [], health: [], deadLetters: [], audit: [], loading: false,
  error: undefined, load, replay, setConnectorEnabled: vi.fn(), saveConnector: vi.fn(), saveRule: vi.fn(),
};
vi.mock('@/store/perceptionStore', () => ({ usePerceptionStore: () => state }));

const { SenseCenter } = await import('../SenseCenter');

describe('SenseCenter', () => {
  beforeEach(() => { vi.clearAllMocks(); state.audit = []; state.deadLetters = []; });

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
    state.audit = Array.from({ length: 61 }, (_, index) => ({
      id: `audit-${index}`, action: 'event.created' as const, occurredAt: '2026-08-28T08:00:00.000Z', eventId: `event-${index}`,
    }));
    const { container } = render(<SenseCenter />);
    fireEvent.click(screen.getByRole('button', { name: '事件记录' }));
    expect(container.querySelectorAll('details')).toHaveLength(50);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(container.querySelectorAll('details')).toHaveLength(11);
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
});
