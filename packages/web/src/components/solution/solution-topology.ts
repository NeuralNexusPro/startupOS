import type { CanonicalContract } from '@originos/core/lib/features/ontology';

export interface TopologySkill {
  id?: string;
  name?: string;
  code?: string;
  capability?: string;
  responsibility?: string;
  domain?: string;
  description?: string;
  contract?: CanonicalContract;
  inputContract?: unknown;
  outputContract?: unknown;
  dependsOn?: string[];
}
export interface TopologyAgent extends TopologySkill {
  id: string;
  name: string;
  skills?: Array<string | TopologySkill>;
  collaborations?: Array<{
    targetAgentId?: string;
    target?: string;
    targetAgentName?: string;
    type: string;
    description?: string;
  }>;
}
export type GraphView = 'workflow' | 'team';
export interface GraphNode {
  id: string;
  name: string;
  kind: 'agent' | 'skill' | 'missing';
  detail?: TopologySkill;
  shared?: boolean;
}
export interface GraphEdge {
  source: string;
  target: string;
  label: string;
  reference?: unknown;
}
export interface GraphProjection {
  nodes: GraphNode[];
  edges: GraphEdge[];
  diagnostics: string[];
  explicit: boolean;
}
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** Read-only presentation: never infer canonical contracts or update source manifests. */
export function projectTopology(
  agents: TopologyAgent[],
  skills: TopologySkill[],
  views: unknown,
  view: GraphView
): GraphProjection {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const diagnostics: string[] = [];
  const definitions = new Map<string, TopologySkill>();
  for (const skill of skills)
    for (const key of [skill.id, skill.code, skill.name])
      if (key) definitions.set(key, skill);
  const agentDefinitions = new Map(agents.map((agent) => [agent.id, agent]));
  const selected = record(record(views)?.[view]);
  if (
    record(views)?.[view] !== undefined &&
    (!selected ||
      !Array.isArray(selected['nodes']) ||
      !Array.isArray(selected['edges']))
  )
    diagnostics.push(`${view} 拓扑格式无效，显示兼容信息`);
  const explicit =
    !!selected &&
    Array.isArray(selected['nodes']) &&
    Array.isArray(selected['edges']);
  const addEdge = (edge: GraphEdge) => {
    for (const id of [edge['source'], edge['target']])
      if (!nodes.has(id)) {
        nodes.set(id, { id, name: `缺失引用：${id}`, kind: 'missing' });
        diagnostics.push(`关系引用不存在：${id}`);
      }
    edges.push(edge);
  };
  if (explicit) {
    for (const raw of selected['nodes'] as unknown[]) {
      const node = record(raw);
      if (!node || !text(node['id'])) {
        diagnostics.push('存在缺少 ID 的节点');
        continue;
      }
      const id = text(node['id']);
      const ref = text(node['contractRef']) || id;
      if (nodes.has(id)) {
        diagnostics.push(`重复节点 ID：${id}`);
        continue;
      }
      if (node['type'] !== 'skill' && node['type'] !== 'agent') {
        diagnostics.push(`节点 ${id} 类型无效`);
        continue;
      }
      const kind = node['type'];
      const detail =
        kind === 'skill' ? definitions.get(ref) : agentDefinitions.get(ref);
      nodes.set(id, {
        id,
        name: detail?.name || text(node['name']) || id,
        kind: detail ? kind : 'missing',
        detail,
      });
      if (!detail) diagnostics.push(`节点 ${id} 的能力引用不存在：${ref}`);
    }
    for (const raw of selected['edges'] as unknown[]) {
      const edge = record(raw);
      if (!edge || !text(edge['source']) || !text(edge['target'])) {
        diagnostics.push('存在缺少端点的关系');
        continue;
      }
      addEdge({
        source: text(edge['source']),
        target: text(edge['target']),
        label:
          edgeLabel(text(edge['type'])) ||
          (nodes.get(text(edge['source']))?.kind === 'agent' &&
          nodes.get(text(edge['target']))?.kind === 'skill'
            ? '调用'
            : nodes.get(text(edge['source']))?.kind === 'skill' &&
                nodes.get(text(edge['target']))?.kind === 'agent'
              ? '输出'
              : '数据流'),
        reference: edge['factType'],
      });
    }
  } else {
    for (const agent of agents)
      nodes.set(agent.id, {
        id: agent.id,
        name: agent.name,
        kind: 'agent',
        detail: agent,
      });
    const usage = new Map<string, Set<string>>();
    for (const agent of agents)
      for (const [index, reference] of (agent.skills || []).entries()) {
        const ref =
          typeof reference === 'string'
            ? reference
            : reference.id ||
              reference.code ||
              reference.name ||
              `${agent.id}:${index}`;
        const detail =
          typeof reference === 'string'
            ? definitions.get(ref)
            : { ...definitions.get(ref), ...reference };
        const canonicalId = detail?.id || detail?.code || ref;
        const id =
          view === 'team'
            ? `skill:${canonicalId}`
            : `skill:${agent.id}:${canonicalId}`;
        const owners = usage.get(id) || new Set<string>();
        owners.add(agent.id);
        usage.set(id, owners);
        nodes.set(id, {
          id,
          name: detail?.name || ref,
          kind: detail ? 'skill' : 'missing',
          detail,
          shared: owners.size > 1,
        });
        if (!detail) diagnostics.push(`${agent.name} 引用的技能不存在：${ref}`);
        addEdge({ source: agent.id, target: id, label: '调用' });
        addEdge({ source: id, target: agent.id, label: '输出' });
      }
    // Keep standalone definitions visible; they must not disappear just because no agent references them.
    for (const [index, skill] of skills.entries()) {
      if (
        [...nodes.values()].some(
          (node) =>
            node.detail === skill ||
            [skill.id, skill.code, skill.name]
              .filter(Boolean)
              .some((key) =>
                [
                  node.detail?.id,
                  node.detail?.code,
                  node.detail?.name,
                ].includes(key)
              )
        )
      )
        continue;
      const id = `skill:standalone:${skill.id || skill.code || index}`;
      nodes.set(id, {
        id,
        name: skill.name || skill.id || id,
        kind: 'skill',
        detail: skill,
      });
    }
    for (const agent of agents)
      for (const edge of agent.collaborations || []) {
        const target = edge.targetAgentId || edge['target'];
        if (target)
          addEdge({
            source: agent.id,
            target,
            label: edgeLabel(edge['type']),
            reference: edge.description,
          });
      }
  }
  if (view === 'team')
    for (const node of nodes.values())
      if (node.kind === 'skill') {
        node.shared =
          new Set(
            edges
              .filter(
                (edge) =>
                  edge['target'] === node['id'] &&
                  nodes.get(edge['source'])?.kind === 'agent'
              )
              .map((edge) => edge['source'])
          ).size > 1;
      }
  return {
    nodes: [...nodes.values()],
    edges,
    diagnostics: [...new Set(diagnostics)],
    explicit,
  };
}

function edgeLabel(value: string): string {
  return (
    (
      {
        trigger: '触发',
        notify: '通知',
        depend: '依赖',
        'agent-skill': '调用',
        'skill-agent': '输出',
      } as Record<string, string>
    )[value] || value
  );
}
