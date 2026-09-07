import { beforeEach, describe, expect, it, vi } from 'vitest';

const openComponentWindow = vi.fn(() => 'sense-center');
vi.mock('@/services/AppWindowManager', () => ({ AppWindowManager: { getInstance: () => ({ openComponentWindow }) } }));
const { openSenseCenter } = await import('../openSenseCenter');

describe('openSenseCenter', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('opens a stable top-level window with the architecture minimum size', () => {
    expect(openSenseCenter()).toBe('sense-center');
    expect(openComponentWindow).toHaveBeenCalledWith(
      'sense-center', '感知中心', expect.any(Function), { icon: '📡' },
      expect.objectContaining({ constraints: { minWidth: 400, minHeight: 300 }, metadata: { entryType: 'sense-center', entryId: 'sense-center' } }),
    );
  });
});
