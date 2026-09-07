import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PerceptionStatusButton, summarizePerceptionHealth } from '../PerceptionStatusButton';

const connector = (id: string, enabled = true) => ({
  id, source: 'email' as const, mode: 'email-poll' as const, enabled, settings: {}, secretConfigured: true,
  createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z',
});

describe('PerceptionStatusButton', () => {
  it('summarizes unconfigured, healthy, warning and disconnected states', () => {
    expect(summarizePerceptionHealth([], [])).toMatchObject({ state: 'unconfigured', enabled: 0 });
    expect(summarizePerceptionHealth([connector('a')], [{ connectorId: 'a', mode: 'email-poll', status: 'healthy', updatedAt: '2026-09-07T00:00:00.000Z' }])).toMatchObject({ state: 'healthy', healthy: 1 });
    expect(summarizePerceptionHealth([connector('a'), connector('b')], [{ connectorId: 'a', mode: 'email-poll', status: 'healthy', updatedAt: '2026-09-07T00:00:00.000Z' }, { connectorId: 'b', mode: 'email-poll', status: 'degraded', updatedAt: '2026-09-07T00:00:00.000Z' }])).toMatchObject({ state: 'warning', unhealthy: 1 });
    expect(summarizePerceptionHealth([connector('a')], [{ connectorId: 'a', mode: 'email-poll', status: 'disconnected', updatedAt: '2026-09-07T00:00:00.000Z' }])).toMatchObject({ state: 'disconnected', unhealthy: 1 });
  });

  it('opens an accessible summary and delegates management', () => {
    const onManage = vi.fn();
    render(<PerceptionStatusButton connectors={[connector('a')]} health={[{ connectorId: 'a', mode: 'email-poll', status: 'healthy', updatedAt: '2026-09-07T00:00:00.000Z' }]} eventTraces={[]} loading={false} onManage={onManage} />);
    fireEvent.click(screen.getByRole('button', { name: /感知连接：连接正常/ }));
    expect(screen.getByRole('dialog', { name: '感知连接状态' })).toHaveTextContent('1 个连接正常');
    fireEvent.click(screen.getByRole('button', { name: '管理感知中心' }));
    expect(onManage).toHaveBeenCalledOnce();
  });
});
