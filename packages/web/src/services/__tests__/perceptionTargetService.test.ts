import { afterEach, describe, expect, it, vi } from 'vitest';

import { listPerceptionTargetAssets } from '../perceptionTargetService';

function response(data: unknown): Response {
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}

describe('listPerceptionTargetAssets', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps project, agent, and skill APIs to selectable target assets', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([{ id: 'project-1', name: '收件箱项目', domain: '运营' }]))
      .mockResolvedValueOnce(response({ agents: [{ id: 'agent-1', name: '邮件助理', agentType: 'role-agent' }] }))
      .mockResolvedValueOnce(response({ skills: [{ name: '邮件分拣', code: 'mail-triage', source: 'bundled' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listPerceptionTargetAssets('project')).resolves.toEqual([expect.objectContaining({ id: 'project-1', name: '收件箱项目' })]);
    await expect(listPerceptionTargetAssets('role-agent')).resolves.toEqual([expect.objectContaining({ id: 'agent-1', detail: '角色 Agent' })]);
    await expect(listPerceptionTargetAssets('skill')).resolves.toEqual([expect.objectContaining({ id: 'mail-triage', name: '邮件分拣' })]);
  });

  it('only exposes role agents for the role-agent target type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ agents: [
      { id: 'role-1', name: '产品经理', agentType: 'role-agent', role: '产品经理' },
      { id: 'assistant-1', name: '普通助手', agentType: 'assistant' },
    ] })));
    await expect(listPerceptionTargetAssets('role-agent')).resolves.toEqual([
      expect.objectContaining({ id: 'role-1', detail: '产品经理' }),
    ]);
  });

  it('fails closed when an asset API cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false }) }));
    await expect(listPerceptionTargetAssets('project')).rejects.toThrow('TARGET_ASSETS_UNAVAILABLE');
  });
});
