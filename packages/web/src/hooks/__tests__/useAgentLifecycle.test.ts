import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useAgentLifecycle } from '../useAgentLifecycle';
const agent = vi.hoisted(() => ({ initialize: vi.fn().mockResolvedValue(undefined), abort: vi.fn(), destroy: vi.fn() }));
vi.mock('@originos/core/lib/integrations/pi-agent/hooks', () => ({ usePiAgent: (): typeof agent => agent }));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: (select: (state: { getEffectiveConfig: () => object }) => unknown): unknown => select({ getEffectiveConfig: () => ({}) }) }));
it('starts through the HTTP/IPC hook and retains stop and cleanup actions', async () => {
  const { result, unmount } = renderHook(() => useAgentLifecycle('role-1'));
  await act(() => result.current.start({ projectPath: '/project' }));
  expect(agent.initialize).toHaveBeenCalledWith('role-1', { projectPath: '/project' }, {}, undefined);
  await act(() => result.current.stop());
  expect(agent.abort).toHaveBeenCalledOnce();
  unmount();
  expect(agent.destroy).toHaveBeenCalledOnce();
});
