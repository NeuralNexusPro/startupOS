import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { PerceptionStatusButton } from '@/components/os/sense-center/PerceptionStatusButton';
import { usePerceptionStore } from '../perceptionStore';

const data: Pick<ReturnType<typeof usePerceptionStore.getState>, 'connectors' | 'grants' | 'rules' | 'health' | 'audit' | 'eventTraces' | 'deadLetters'> = { connectors: [], grants: [], rules: [], health: [], audit: [], eventTraces: [], deadLetters: [] };
const response = (value = data) => ({ ok: true, json: async () => ({ success: true, data: value }) });
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(response());
  usePerceptionStore.setState({ ...data, loading: false, error: undefined });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('perception live refresh', () => {
  it('shares one polling timer and updates newly enabled connector health without remounting', async () => {
    const stopTop = usePerceptionStore.getState().startRefreshing();
    const stopWindow = usePerceptionStore.getState().startRefreshing();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const healthy: typeof data = { ...data, health: [{ connectorId: 'email', mode: 'email-poll', status: 'healthy', updatedAt: '2026-09-12T00:00:00Z' }] };
      fetchMock.mockResolvedValue(response(healthy));
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(usePerceptionStore.getState().health).toEqual(healthy.health);
      stopTop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { stopTop(); stopWindow(); }
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('preserves operation errors and loading during silent success and failure', async () => {
    usePerceptionStore.setState({ error: '启用失败', loading: false });
    await usePerceptionStore.getState().load({ silent: true });
    expect(usePerceptionStore.getState()).toMatchObject({ error: '启用失败', loading: false });
    fetchMock.mockRejectedValue(new Error('offline'));
    await usePerceptionStore.getState().load({ silent: true });
    expect(usePerceptionStore.getState()).toMatchObject({ error: '启用失败', loading: false });
    await usePerceptionStore.getState().load();
    expect(usePerceptionStore.getState().error).toBe('无法加载感知中心，请稍后重试');
  });

  it('does not overlap slow polls and stops scheduling after unmount', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockReturnValue(new Promise<ReturnType<typeof response>>((done) => { resolve = done; }));
    const stop = usePerceptionStore.getState().startRefreshing();
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    stop();
    resolve(response());
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('runs a foreground reload after an in-flight poll so its new snapshot wins', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockReturnValueOnce(new Promise<ReturnType<typeof response>>((done) => { resolve = done; }));
    const newest: typeof data = { ...data, health: [{ connectorId: 'new', mode: 'email-poll', status: 'healthy', updatedAt: '2026-09-12T00:00:00Z' }] };
    fetchMock.mockResolvedValueOnce(response(newest));
    const old = usePerceptionStore.getState().load({ silent: true });
    const current = usePerceptionStore.getState().load();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(response());
    await Promise.all([old, current]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(usePerceptionStore.getState().loading).toBe(false);
    expect(usePerceptionStore.getState().health).toEqual(newest.health);
  });
});

it('automatically displays first-enable health in the real status component and store', async () => {
  const enabled: typeof data = { ...data, connectors: [{ id: 'email', source: 'email', mode: 'email-poll', enabled: true, settings: {}, secretConfigured: true, createdAt: '2026-09-12T00:00:00Z', updatedAt: '2026-09-12T00:00:00Z' }] };
  fetchMock.mockResolvedValue(response(enabled));
  function Status(): JSX.Element {
    const state = usePerceptionStore();
    useEffect(() => state.startRefreshing(), [state.startRefreshing]);
    return <PerceptionStatusButton {...state} onManage={() => {}} />;
  }
  const view = render(<Status />);
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('button', { name: /感知连接：状态未知/ })).toBeTruthy();
    fetchMock.mockResolvedValue(response({ ...enabled, health: [{ connectorId: 'email', mode: 'email-poll', status: 'healthy', updatedAt: '2026-09-12T00:00:05Z' }] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole('button', { name: /感知连接：连接正常/ })).toBeTruthy();
  } finally { view.unmount(); }
});
