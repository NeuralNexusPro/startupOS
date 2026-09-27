import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SolutionGraphView } from '../TopologyGraph';
import { projectTopology, type TopologySkill } from '../solution-topology';
afterEach(cleanup);
const skill: TopologySkill = {
  id: 'check',
  name: '校验',
  contract: {
    skillId: 'check',
    ontology: { ontologyId: 'o1', ontologyVersion: '2' },
    inputs: [
      {
        required: true,
        factType: {
          ontologyId: 'o1',
          ontologyVersion: '2',
          conceptId: 'order',
          factTypeId: 'submitted',
        },
      },
    ],
    outputs: [],
    actions: [
      {
        actionId: 'approve',
        concept: { ontologyId: 'o1', ontologyVersion: '2', conceptId: 'order' },
      },
    ],
    permissions: ['order.read'],
  },
};
const agents = [
  { id: 'a', name: '审核', skills: ['check'] },
  { id: 'b', name: '复核', skills: ['check'] },
];
describe('real topology interaction', () => {
  it('switches keyboard tabs, merges shared skills and preserves full canonical details and version', () => {
    render(
      <SolutionGraphView
        agents={agents}
        skillDefs={[skill]}
        solutionVersion="v4"
      />
    );
    expect(screen.getAllByRole('button', { name: /技能：校验/ })).toHaveLength(
      2
    );
    const started = performance.now();
    fireEvent.keyDown(screen.getByRole('tab', { name: '工作流' }), {
      key: 'ArrowRight',
    });
    expect(
      screen.getByRole('tab', { name: '团队' }).getAttribute('aria-selected')
    ).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: '团队' })
    );
    expect(screen.getAllByRole('button', { name: /技能：校验/ })).toHaveLength(
      1
    );
    expect(screen.getByText('共享技能')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /技能：校验/ }));
    const detail = screen.getByRole('complementary', {
      name: '能力详情',
    }).textContent;
    for (const value of [
      'ontologyId',
      'o1',
      'ontologyVersion',
      '2',
      'order',
      'submitted',
      'approve',
      'order.read',
    ])
      expect(detail).toContain(value);
    expect(screen.getByText('方案版本：v4')).toBeTruthy();
    expect(performance.now() - started).toBeLessThan(5000);
  });
  it('preserves explicit workflow identities, edges, orphan skills and missing references', () => {
    const topologyViews = {
      workflow: {
        nodes: [
          { id: 'step-1', type: 'agent', contractRef: 'a' },
          { id: 'step-2', type: 'skill', contractRef: 'check' },
        ],
        edges: [
          {
            source: 'step-1',
            target: 'step-2',
            factType: skill.contract?.inputs[0]?.factType,
          },
          { source: 'step-2', target: 'missing' },
        ],
      },
    };
    render(
      <SolutionGraphView
        agents={agents}
        skillDefs={[skill, { id: 'orphan', name: '独立技能' }]}
        topologyViews={topologyViews}
      />
    );
    expect(
      screen.getByRole('list', { name: '图谱诊断' }).textContent
    ).toContain('missing');
    expect(screen.getByText(/关系明细（2）/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '团队' }));
    expect(screen.getByRole('button', { name: /独立技能/ })).toBeTruthy();
  });
  it('shows legacy field-level contracts and unresolved skill references', () => {
    render(
      <SolutionGraphView
        agents={[{ id: 'a', name: '角色', skills: ['legacy', 'lost'] }]}
        skillDefs={[
          {
            id: 'legacy',
            name: '旧技能',
            inputContract: {
              requires: [{ objectType: '订单', fields: ['金额'] }],
            },
          },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /技能：旧技能/ }));
    expect(screen.getByRole('complementary').textContent).toContain('金额');
    expect(screen.getByRole('complementary').textContent).toContain(
      '非已发布契约'
    );
    expect(
      screen.getByRole('list', { name: '图谱诊断' }).textContent
    ).toContain('lost');
  });
  it('projects and switches 50 agents and shared skills within 5 seconds', () => {
    const large = Array.from({ length: 50 }, (_, i) => ({
      id: `a${i}`,
      name: `角色${i}`,
      skills: ['check'],
    }));
    const started = performance.now();
    render(<SolutionGraphView agents={large} skillDefs={[skill]} />);
    fireEvent.click(screen.getByRole('tab', { name: '团队' }));
    expect(
      projectTopology(large, [skill], undefined, 'team').edges
    ).toHaveLength(100);
    expect(screen.getAllByRole('button', { name: /技能：校验/ })).toHaveLength(
      1
    );
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

it('keeps agent and skill namespaces separate and reports duplicate or malformed nodes', () => {
  const graph = projectTopology(
    [{ id: 'same', name: '角色同名' }],
    [{ id: 'same', name: '技能同名' }],
    {
      workflow: {
        nodes: [
          { id: 's', type: 'skill', contractRef: 'same' },
          { id: 'a', type: 'agent', contractRef: 'same' },
          { id: 's', type: 'skill', contractRef: 'same' },
          { id: 'bad', type: 'unknown' },
        ],
        edges: [],
      },
    },
    'workflow'
  );
  expect(graph.nodes.map((node) => node.name)).toEqual([
    '技能同名',
    '角色同名',
  ]);
  expect(graph.diagnostics).toEqual(['重复节点 ID：s', '节点 bad 类型无效']);
  expect(
    projectTopology([], [], { workflow: { nodes: null } }, 'workflow')
      .diagnostics[0]
  ).toContain('格式无效');
});

it('does not duplicate code-only embedded definitions', () => {
  const graph = projectTopology(
    [{ id: 'a', name: '角色', skills: [{ code: 's', name: '技能' }] }],
    [{ code: 's', name: '技能' }],
    undefined,
    'team'
  );
  expect(graph.nodes.filter((node) => node.kind === 'skill')).toHaveLength(1);
});

it('uses edges rather than source array order for workflow placement', async () => {
  const { layoutTopology } = await import('../topology-layout');
  const projection = projectTopology(
    [
      { id: 'end', name: '结束' },
      {
        id: 'start',
        name: '开始',
        collaborations: [{ target: 'end', type: 'trigger' }],
      },
    ],
    [],
    undefined,
    'workflow'
  );
  const layout = layoutTopology(projection, 'workflow');
  expect(layout.nodes.find((node) => node.id === 'start')!.x).toBeLessThan(
    layout.nodes.find((node) => node.id === 'end')!.x
  );
  expect(layout.edges[0]?.label).toBe('触发');
});

it('keeps partially generated draft contracts readable without crashing', () => {
  const unfinished = JSON.parse(
    '{"id":"draft","name":"草稿技能","contract":{"inputs":null}}'
  ) as TopologySkill;
  render(
    <SolutionGraphView
      agents={[{ id: 'a', name: '角色', skills: ['draft'] }]}
      skillDefs={[unfinished]}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /技能：草稿技能/ }));
  expect(screen.getByRole('alert').textContent).toBe('契约不完整，请检查设计');
});
