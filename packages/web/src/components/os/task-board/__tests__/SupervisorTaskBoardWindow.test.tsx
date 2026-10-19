import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const openComponentWindow = vi.hoisted(() => vi.fn());
const openLocalFile = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@/services/AppWindowManager', () => ({
  AppWindowManager: { getInstance: () => ({ openComponentWindow }) },
}));

vi.mock('@/components/os/workspace', () => ({
  WorkspaceWindow: () => null,
  ProjectWorkspace: () => null,
}));

vi.mock('@originos/core/lib/integrations/electron/local-fs', () => ({ openLocalFile }));

vi.mock('@originos/core/modules/collaboration-runtime/ui/MultiAgentLauncher', () => ({
  MultiAgentLauncher: ({ conversationOnly, onCollapse }: { conversationOnly?: boolean; onCollapse?: () => void }) => (
    <section aria-label="Supervisor 实时会话" data-conversation-only={String(conversationOnly)}>
      <p>Supervisor 实时消息</p>
      <textarea aria-label="协作需求" />
      <button type="button" aria-label="收起协作对话" onClick={onCollapse}>收起</button>
    </section>
  ),
}));

vi.mock('@originos/core/modules/collaboration-runtime/ui/TopologyGraph', () => ({
  TopologyGraph: ({ topology }: {
    topology: { agents: Record<string, { name: string }> };
  }) => (
    <div>
      {Object.values(topology.agents).map((agent) => agent.name).join(' ')} 执行中
    </div>
  ),
}));

import type { SupervisorTaskBoardProject } from '@originos/core/modules/collaboration-runtime/facade';
import { openTaskArtifact, resolveProjectArtifactPath, restoredConversationEvents, SupervisorTaskBoardWindow } from '../SupervisorTaskBoardWindow';

const projection = {
  generatedAt: '2026-10-13T00:00:00.000Z',
  taskCount: 8,
  projects: [{
    projectId: 'proj-a', projectName: '采购项目', sessionCount: 1,
    tasks: [
      { id: 'a', title: '供应商材料核验', projectId: 'proj-a', projectName: '采购项目', sessionId: 'session-a', description: '核验供应商材料是否完整并标记缺失项', status: 'running', assignedTo: 'buyer', agentName: '采购专员', createdAt: '2026-10-13T00:00:00.000Z', input: { request: '核验材料' }, artifacts: [{ kind: 'file', name: '准入单.md', ref: 'output/准入单.md', operation: '创建' }, { kind: 'file', name: '报价.xlsx', ref: 'output/报价.xlsx', operation: '创建' }], dataChanges: [{ operation: 'create_instance', label: '创建业务数据', reference: 'supplier-1', details: { conceptId: 'supplier' } }] },
      { id: 'b', title: '供应商准入结论', projectId: 'proj-a', projectName: '采购项目', sessionId: 'session-a', description: '输出准入结论', status: 'failed', assignedTo: 'reviewer', agentName: '质量审核员', createdAt: '2026-10-13T00:01:00.000Z', output: '**准入通过**', failure: { stage: 'worker-execution', code: 'MODEL_EMPTY', toolName: '模型最终回复', reason: '模型没有返回可展示文本', occurredAt: '2026-10-13T00:02:00.000Z' }, artifacts: [], dataChanges: [] },
      { id: 'c', title: '等待 Supervisor 验收', projectId: 'proj-a', projectName: '采购项目', sessionId: 'session-a', description: '产出已上报但尚未验收', status: 'reported', assignedTo: 'buyer', agentName: '采购专员', createdAt: '2026-10-13T00:03:00.000Z', artifacts: [], dataChanges: [] },
      { id: 'd', title: '等待外部授权', projectId: 'proj-a', projectName: '采购项目', sessionId: 'session-a', description: '当前任务受阻', status: 'blocked', assignedTo: 'reviewer', agentName: '质量审核员', createdAt: '2026-10-13T00:04:00.000Z', artifacts: [], dataChanges: [] },
      { id: 'e', title: '自动核验供应商资料', projectId: 'proj-a', projectName: '采购项目', sessionId: 'session-contract', description: '按冻结验收标准核验', status: 'verifying', assignedTo: 'reviewer', agentName: '质量审核员', createdAt: '2026-10-13T00:05:00.000Z', artifacts: [], dataChanges: [] },
      { id: 'f', title: '等待用户确认准入', projectId: 'proj-a', projectName: '采购项目', sessionId: 'session-contract', runId: 'run-user', description: '验证通过后等待用户确认', status: 'waiting_hitl', assignedTo: 'buyer', agentName: '采购专员', createdAt: '2026-10-13T00:06:00.000Z', acceptance: { mode: 'user', approverRole: 'user', approverName: '用户', requestId: 'hitl-user', attemptId: 'attempt-user', leaseEpoch: 1, question: '是否批准供应商准入？', options: ['approve', 'reject'] }, artifacts: [], dataChanges: [] },
      { id: 'g', title: '质量复核确认', projectId: 'proj-a', projectName: '采购项目', sessionId: 'session-contract', runId: 'run-role', description: '验证通过后等待指定角色确认', status: 'waiting_hitl', assignedTo: 'buyer', agentName: '采购专员', createdAt: '2026-10-13T00:07:00.000Z', acceptance: { mode: 'role', approverRole: 'reviewer-role', approverName: '质量负责人', requestId: 'hitl-role', attemptId: 'attempt-role', leaseEpoch: 1, question: '是否接受质量复核？', options: ['approve', 'reject'] }, artifacts: [], dataChanges: [] },
      { id: 'h', title: '修订供应商结论', projectId: 'proj-a', projectName: '采购项目', sessionId: 'session-contract', description: '验收拒绝后进入修订', status: 'revision', assignedTo: 'buyer', agentName: '采购专员', createdAt: '2026-10-13T00:08:00.000Z', artifacts: [], dataChanges: [] },
    ],
    conversations: [{
      sessionId: 'session-contract', status: 'running', updatedAt: '2026-10-13T00:07:00.000Z',
      entries: [
        { id: 'mc1', sessionId: 'session-contract', role: 'user', actorId: 'user', actorName: '我', content: '请完成供应商准入', timestamp: '2026-10-13T00:05:00.000Z' },
        { id: 'mc2', sessionId: 'session-contract', role: 'supervisor', actorId: 'supervisor', actorName: 'Supervisor', content: '已完成自动验证，等待你的确认。', timestamp: '2026-10-13T00:05:30.000Z' },
      ],
    }, {
      sessionId: 'session-a', status: 'running', updatedAt: '2026-10-13T00:02:00.000Z',
      entries: [
        { id: 'm1', sessionId: 'session-a', role: 'user', actorId: 'user', actorName: '我', content: '帮我评估供应商准入材料', timestamp: '2026-10-13T00:00:00.000Z' },
        { id: 'm2', sessionId: 'session-a', role: 'status', actorId: 'buyer', actorName: '采购专员', content: '正在承接「供应商材料核验」', timestamp: '2026-10-13T00:00:01.000Z', state: 'working' },
      ],
    }],
  }],
};

describe('SupervisorTaskBoardWindow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    openComponentWindow.mockReset();
    openLocalFile.mockClear();
  });

  it('only resolves artifact paths inside the current project', (): void => {
    expect(resolveProjectArtifactPath('data/projects/proj-a/agents/reviewer/output/report.md', 'proj-a'))
      .toBe('agents/reviewer/output/report.md');
    expect(resolveProjectArtifactPath('/tmp/root/data/projects/proj-a/output/report.md', 'proj-a'))
      .toBe('output/report.md');
    expect(resolveProjectArtifactPath('projects/proj-a/collaboration-artifacts/run/T1/attempt.json', 'proj-a'))
      .toBe('collaboration-artifacts/run/T1/attempt.json');
    expect(resolveProjectArtifactPath('../outside.md', 'proj-a')).toBeNull();
    expect(resolveProjectArtifactPath('/tmp/outside.md', 'proj-a')).toBeNull();
    expect(resolveProjectArtifactPath('C:\\temp\\outside.md', 'proj-a')).toBeNull();
  });

  it('restores Supervisor history and formal HITL into the same conversation', (): void => {
    const restored = restoredConversationEvents(projection.projects[0] as unknown as SupervisorTaskBoardProject);
    expect(restored.sessionId).toBe('session-contract');
    expect(restored.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'USER_INPUT', payload: { message: '请完成供应商准入' } }),
      expect.objectContaining({ type: 'ASSISTANT_MESSAGE', payload: { content: '已完成自动验证，等待你的确认。' } }),
      expect.objectContaining({
        type: 'HUMAN_REVIEW_REQUEST',
        payload: expect.objectContaining({ requestId: 'hitl-user', runId: 'run-user', question: '是否批准供应商准入？' }),
      }),
    ]));
  });

  it('opens file products and business data in their project windows', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => projection })));
    render(<SupervisorTaskBoardWindow />);
    fireEvent.click(await screen.findByText('供应商材料核验'));

    fireEvent.click(screen.getByRole('button', { name: /准入单\.md/ }));
    expect(openComponentWindow).toHaveBeenCalledWith(
      expect.stringMatching(/^task-artifact-proj-a-/),
      '采购项目 · 准入单.md',
      expect.any(Function),
      expect.objectContaining({ projectId: 'proj-a', initialFilePath: 'output/准入单.md' }),
      expect.objectContaining({ metadata: expect.objectContaining({ entryType: 'project-file', projectId: 'proj-a' }) }),
    );

    fireEvent.click(screen.getByRole('button', { name: /报价\.xlsx/ }));
    await waitFor(() => expect(openLocalFile).toHaveBeenCalledWith('projects/proj-a/output/报价.xlsx'));

    fireEvent.click(screen.getByRole('button', { name: /创建业务数据/ }));
    expect(openComponentWindow).toHaveBeenLastCalledWith(
      'project-data-proj-a',
      '采购项目 · 数据',
      expect.any(Function),
      expect.objectContaining({ projectId: 'proj-a', ontologyId: 'ontology-proj-a' }),
      expect.objectContaining({ metadata: expect.objectContaining({ entryType: 'project-workspace', projectId: 'proj-a' }) }),
    );
  });

  it('resolves contract artifact refs before opening the persisted file', async (): Promise<void> => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ path: 'projects/proj-a/collaboration-artifacts/run-a/T1/attempt-a.json' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const opened = await openTaskArtifact(
      projection.projects[0].tasks[0] as never,
      'artifact://collaboration/proj-a/run-a/T1/attempt-a',
    );
    expect(opened).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/collaboration/task-board', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('resolve-artifact'),
    }));
    expect(openLocalFile).toHaveBeenCalledWith('projects/proj-a/collaboration-artifacts/run-a/T1/attempt-a.json');
  });

  it('lets the user submit approve, reject, or free-form review content from task detail', async (): Promise<void> => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: true, json: async () => ({ success: true }) };
      return { ok: true, json: async () => projection };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SupervisorTaskBoardWindow initialProjectId="proj-a" />);
    fireEvent.click(await screen.findByText('等待用户确认准入'));
    const detail = screen.getByRole('complementary', { name: '任务详情' });
    expect(within(detail).getByText('是否批准供应商准入？')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: '同意并继续' })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: '拒绝' })).toBeInTheDocument();
    fireEvent.change(within(detail).getByLabelText('其他处理意见'), { target: { value: '请补充风险说明后再提交' } });
    fireEvent.click(within(detail).getByRole('button', { name: '提交其他内容' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/collaboration/task-board', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('请补充风险说明后再提交'),
    })));
  });

  it('renders Multica-style status columns grouped by project and opens input/output detail', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => projection })));
    render(<SupervisorTaskBoardWindow />);

    expect(await screen.findByRole('heading', { name: '采购项目' })).toBeInTheDocument();
    expect(screen.getByText('计划中')).toBeInTheDocument();
    expect(screen.getByText('待处理')).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(screen.getByText('待自动验证')).toBeInTheDocument();
    expect(screen.getByText('待人工确认')).toBeInTheDocument();
    expect(screen.getByText('待 Supervisor 验收')).toBeInTheDocument();
    expect(screen.getByText('退回修改')).toBeInTheDocument();
    expect(screen.getByText('受阻')).toBeInTheDocument();
    expect(within(screen.getByLabelText('待自动验证任务')).getByText('自动核验供应商资料')).toBeInTheDocument();
    const hitlColumn = within(screen.getByLabelText('待人工确认任务'));
    expect(hitlColumn.getByText('等待用户确认准入')).toBeInTheDocument();
    expect(hitlColumn.getByText('质量复核确认')).toBeInTheDocument();
    expect(hitlColumn.getByText('等待用户确认')).toBeInTheDocument();
    expect(hitlColumn.getByText('等待质量负责人确认')).toBeInTheDocument();
    expect(within(screen.getByLabelText('退回修改任务')).getByText('修订供应商结论')).toBeInTheDocument();
    expect(within(screen.getByLabelText('待 Supervisor 验收任务')).getByText('等待 Supervisor 验收')).toBeInTheDocument();
    expect(within(screen.getByLabelText('待 Supervisor 验收任务')).queryByText('等待外部授权')).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('受阻任务')).getByText('等待外部授权')).toBeInTheDocument();
    fireEvent.click(screen.getByText('供应商材料核验'));
    expect(screen.getByRole('complementary', { name: '任务详情' })).toHaveTextContent('任务输入');
    expect(screen.getByRole('complementary', { name: '任务详情' })).toHaveTextContent('核验材料');
    expect(screen.getByRole('complementary', { name: '任务详情' })).toHaveTextContent('准入单.md');
    expect(screen.getByRole('complementary', { name: '任务详情' })).toHaveTextContent('创建业务数据');
    fireEvent.click(screen.getByText('质量复核确认'));
    expect(screen.getByRole('complementary', { name: '任务详情' })).toHaveTextContent('确认主体');
    expect(screen.getByRole('complementary', { name: '任务详情' })).toHaveTextContent('质量负责人');
  });

  it('filters task content while preserving project grouping', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => projection })));
    render(<SupervisorTaskBoardWindow />);
    await screen.findByText('供应商材料核验');
    fireEvent.change(screen.getByLabelText('搜索任务'), { target: { value: '准入结论' } });
    await waitFor(() => expect(screen.queryByText('供应商材料核验')).not.toBeInTheDocument());
    expect(screen.getByText('供应商准入结论')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '采购项目' })).toBeInTheDocument();
  });

  it('renders Agent output as markdown', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => projection })));
    render(<SupervisorTaskBoardWindow />);
    fireEvent.click(await screen.findByText('供应商准入结论'));
    expect(screen.getByText('准入通过').tagName).toBe('STRONG');
    expect(screen.getByRole('complementary', { name: '任务详情' })).toHaveTextContent('模型没有返回可展示文本');
    expect(screen.getByRole('complementary', { name: '任务详情' })).toHaveTextContent('MODEL_EMPTY');
  });

  it('renders a fallback for invalid historical task timestamps', async (): Promise<void> => {
    const invalidTimeProjection = JSON.parse(JSON.stringify(projection)) as typeof projection;
    invalidTimeProjection.projects[0].tasks[0].createdAt = 'invalid-date';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => invalidTimeProjection })));

    render(<SupervisorTaskBoardWindow />);

    const taskCard = (await screen.findByText('供应商材料核验')).closest('button');
    expect(taskCard).not.toBeNull();
    expect(taskCard).toHaveTextContent('时间未知');
  });

  it('requests and locks the board to the current project when opened from collaboration', async (): Promise<void> => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/topology') ? {
        success: true,
        data: {
          agents: {
            supervisor: { id: 'supervisor', name: '调度主管', domain: '任务协调' },
            buyer: { id: 'buyer', name: '采购专员', domain: '供应商管理' },
          },
          edges: [{ from: 'supervisor', to: 'buyer', type: 'trigger', description: '派发采购任务' }],
          entryPoints: ['supervisor'], exitPoints: ['buyer'], mode: 'system',
        },
      } : projection,
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<SupervisorTaskBoardWindow initialProjectId="proj-a" />);

    expect(await screen.findByRole('heading', { name: '采购项目' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/collaboration/task-board?projectId=proj-a',
      { cache: 'no-store' },
    );
    expect(screen.queryByText('全部项目')).not.toBeInTheDocument();
    expect(screen.getByText('当前项目 · 8 个任务')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '任务看板' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: '多 Agent 协同图' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '协同图' }));
    expect(await screen.findByRole('region', { name: '多 Agent 协同图' })).toHaveTextContent('调度主管');
    expect(screen.getByRole('region', { name: '多 Agent 协同图' })).toHaveTextContent('采购专员');
    expect(screen.getByRole('region', { name: '多 Agent 协同图' })).toHaveTextContent('执行中');
    expect(screen.getByRole('tab', { name: '协同图' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('heading', { name: '采购项目' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: '协作对话' })).toHaveTextContent('Supervisor 实时消息');
    const liveConversation = screen.getByRole('region', { name: 'Supervisor 实时会话' });
    expect(liveConversation).toHaveAttribute('data-conversation-only', 'true');
    fireEvent.click(screen.getByRole('button', { name: '收起协作对话' }));
    expect(screen.getByRole('button', { name: '展开协作对话' })).toBeInTheDocument();
    expect(liveConversation).toBeInTheDocument();
    expect(liveConversation.parentElement).toHaveClass('hidden');
    fireEvent.click(screen.getByRole('button', { name: '发布任务' }));
    expect(liveConversation.parentElement).not.toHaveClass('hidden');
  });
});
