'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { TopologyContractDetail } from './TopologyContractDetail';
import { layoutTopology } from './topology-layout';
import {
  projectTopology,
  type GraphView,
  type TopologyAgent,
  type TopologySkill,
} from './solution-topology';

export function SolutionGraphView({
  agents,
  skillDefs = [],
  topologyViews,
  solutionVersion,
  view: initialView = 'workflow',
}: {
  agents: TopologyAgent[];
  skillDefs?: TopologySkill[];
  topologyViews?: unknown;
  solutionVersion?: string;
  view?: GraphView;
}): JSX.Element {
  const [view, setView] = useState<GraphView>(initialView);
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<string>();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const projections = useMemo(
    () => ({
      workflow: projectTopology(agents, skillDefs, topologyViews, 'workflow'),
      team: projectTopology(agents, skillDefs, topologyViews, 'team'),
    }),
    [agents, skillDefs, topologyViews]
  );
  const graph = projections[view];
  const selected = graph.nodes.find((node) => node.id === selection);
  const layouts = useMemo(
    () => ({
      workflow: layoutTopology(projections.workflow, 'workflow'),
      team: layoutTopology(projections.team, 'team'),
    }),
    [projections]
  );
  const positioned = layouts[view];
  return (
    <section className="space-y-3" aria-label="方案协作图谱">
      <div className="flex items-center gap-4">
        <div role="tablist" aria-label="图谱视图" className="flex gap-2">
          {(['workflow', 'team'] as const).map((item, index) => (
            <button
              key={item}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${id}-${item}`}
              aria-controls={`${id}-panel`}
              aria-selected={view === item}
              tabIndex={view === item ? 0 : -1}
              className={`rounded border px-3 py-2 focus-visible:ring-2 focus-visible:ring-blue-500 ${view === item ? 'bg-blue-100 text-blue-900' : 'bg-white text-gray-700'}`}
              onClick={() => {
                setView(item);
                setSelection(undefined);
              }}
              onKeyDown={(event) => {
                if (
                  !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                    event.key
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 1
                      : 1 - index;
                setView(next === 0 ? 'workflow' : 'team');
                setSelection(undefined);
                tabs.current[next]?.focus();
              }}
            >
              {item === 'workflow' ? '工作流' : '团队'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="缩小图谱"
            onClick={() => setZoom((value) => Math.max(0.4, value - 0.2))}
          >
            −
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            重置缩放
          </button>
          <button
            type="button"
            aria-label="放大图谱"
            onClick={() => setZoom((value) => Math.min(2, value + 0.2))}
          >
            ＋
          </button>
        </div>
        {solutionVersion && (
          <span className="text-sm text-gray-600">
            方案版本：{solutionVersion}
          </span>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${view}`}
        className="space-y-3"
      >
        <p className="text-sm text-gray-600">
          {graph.explicit
            ? '按方案显式拓扑展示'
            : view === 'workflow'
              ? '兼容视图：按角色展开技能调用；未提供显式工作流'
              : '兼容视图：按角色与共享技能组织'}
          ；蓝色为角色，绿色为技能。
        </p>
        {graph.diagnostics.length > 0 && (
          <ul
            aria-label="图谱诊断"
            className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            {graph.diagnostics.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {graph.nodes.length === 0 ? (
          <p>暂无 Agent 或 Skill 数据</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded border bg-white">
            <svg
              className="transition-all duration-200 motion-reduce:transition-none"
              width={positioned.width * zoom}
              height={positioned.height * zoom}
              viewBox={`0 0 ${positioned.width} ${positioned.height}`}
              aria-label={view === 'workflow' ? '工作流关系图' : '团队关系图'}
            >
              <defs>
                <marker
                  id={`${id}-arrow`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0 0 L10 5 L0 10z" fill="currentColor" />
                </marker>
              </defs>
              {positioned.edges.map((edge, index) => (
                <g
                  key={`${edge.source}-${edge.target}-${index}`}
                  className={
                    edge.label === '调用' ? 'text-green-700' : 'text-gray-600'
                  }
                >
                  <path
                    d={edge.path}
                    fill="none"
                    stroke="currentColor"
                    markerEnd={`url(#${id}-arrow)`}
                  />
                  <text
                    x={edge.x}
                    y={edge.y}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-xs"
                  >
                    {edge.label}
                  </text>
                </g>
              ))}
              {positioned.nodes.map((node) => (
                <foreignObject
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  width="250"
                  height="85"
                >
                  <button
                    type="button"
                    onClick={() => setSelection(node.id)}
                    aria-pressed={selection === node.id}
                    className={`h-full w-full rounded-lg border-2 p-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-blue-600 ${node.kind === 'agent' ? 'border-blue-300 bg-blue-50' : node.kind === 'skill' ? 'border-green-300 bg-green-50' : 'border-amber-500 bg-amber-50'}`}
                  >
                    <span className="block font-semibold">
                      {node.kind === 'agent'
                        ? '角色'
                        : node.kind === 'skill'
                          ? '技能'
                          : '缺失引用'}
                      ：{node.name}
                    </span>
                    <span>{node.shared ? '共享技能' : node.id}</span>
                  </button>
                </foreignObject>
              ))}
            </svg>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-sm">
            关系明细（{graph.edges.length}）
          </summary>
          <ul className="text-sm">
            {graph.edges.map((edge, index) => (
              <li key={index}>
                {graph.nodes.find((node) => node.id === edge.source)?.name} →{' '}
                {graph.nodes.find((node) => node.id === edge.target)?.name}：
                {edge.label}
                {edge.reference !== undefined && (
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(edge.reference, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </details>
        {selected && (
          <aside aria-label="能力详情" className="space-y-2 rounded border p-4">
            <h3 className="font-semibold">{selected.name}</h3>
            <p>
              {selected.detail?.responsibility ||
                selected.detail?.description ||
                selected.detail?.capability}
            </p>
            {selected.detail?.contract ? (
              <TopologyContractDetail contract={selected.detail.contract} />
            ) : (
              <>
                <p>旧格式兼容信息（非已发布契约）</p>
                <h4>输入</h4>
                <pre className="whitespace-pre-wrap text-sm">
                  {JSON.stringify(
                    selected.detail?.inputContract ?? null,
                    null,
                    2
                  )}
                </pre>
                <h4>输出</h4>
                <pre className="whitespace-pre-wrap text-sm">
                  {JSON.stringify(
                    selected.detail?.outputContract ?? null,
                    null,
                    2
                  )}
                </pre>
              </>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
