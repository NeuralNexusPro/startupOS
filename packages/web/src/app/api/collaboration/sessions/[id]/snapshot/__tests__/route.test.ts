import { describe, it, expect, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('@originos/core/modules/collaboration-runtime/facade', () => ({ getSessionTaskSnapshot: query }));
const { GET } = await import('../route');
describe('collaboration snapshot boundary', () => {
  it('returns 404 for unknown session', async () => {
    query.mockResolvedValue(null);
    expect((await GET(new Request('http://localhost/snapshot'), { params: { id: 'missing' } })).status).toBe(404);
  });
  it('returns restored projection without executing work', async () => {
    const snapshot = { sessionId: 's', runs: [{ activeTasks: [{ status: 'reported' }] }] };
    query.mockResolvedValue(snapshot);
    const response = await GET(new Request('http://localhost/snapshot'), { params: { id: 's' } });
    expect(await response.json()).toEqual({ success: true, data: snapshot });
    expect(query).toHaveBeenCalledWith('s');
  });
});
