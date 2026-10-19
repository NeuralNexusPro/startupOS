'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { TopologyContractDetail } from './TopologyContractDetail';
import { fitTopologyToViewport, layoutTopology } from './topology-layout';
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
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const canvas = useRef<HTMLDivElement | null>(null);
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
  const fitZoom = useMemo(
    () =>
      fitTopologyToViewport(
        positioned.width,
        positioned.height,
        viewport.width,
        viewport.height
      ),
    [positioned.height, positioned.width, viewport.height, viewport.width]
  );

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const update = () =>
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setZoom(fitZoom);
  }, [fitZoom, view]);

  const graphWidth = positioned.width * zoom;
  const graphHeight = positioned.height * zoom;
  return (
    <section className="space-y-4 text-slate-900" aria-label="方案协作图谱">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
        <div role="tablist" aria-label="图谱视图" className="flex rounded-lg bg-slate-200/70 p-1">
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
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${view === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
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
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            aria-label="缩小图谱"
            className="h-8 w-8 rounded-md text-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setZoom((value) => Math.max(0.08, value - 0.1))}
          >
            −
          </button>
          <button
            type="button"
            className="h-8 rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => setZoom(fitZoom)}
          >
            适应画布
          </button>
          <span className="min-w-12 text-center text-xs tabular-nums text-slate-500">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="放大图谱"
            className="h-8 w-8 rounded-md text-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
          >
            ＋
          </button>
        </div>
        {solutionVersion && (
          <span className="rounded-md bg-slate-200/70 px-2 py-1 text-xs text-slate-600">
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>
            {graph.explicit
              ? '按方案显式拓扑展示'
              : view === 'workflow'
                ? '兼容视图：按角色展开技能调用；未提供显式工作流'
                : '兼容视图：按角色与共享技能组织'}
          </p>
          <div className="flex items-center gap-3" aria-label="图谱图例">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Agent</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Skill</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />缺失引用</span>
          </div>
        </div>
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
          <div
            ref={canvas}
            aria-label="协同图画布"
            className="solution-scrollbar h-[clamp(360px,calc(100vh-300px),680px)] min-h-[360px] w-full overflow-auto rounded-xl border border-slate-200 bg-slate-50"
          >
            <div
              className="flex min-h-full min-w-full items-center justify-center p-3"
              style={{ width: Math.max(graphWidth + 24, viewport.width), height: Math.max(graphHeight + 24, viewport.height) }}
            >
              <svg
                className="shrink-0 transition-[width,height] duration-200 motion-reduce:transition-none"
                width={graphWidth}
                height={graphHeight}
                viewBox={`0 0 ${positioned.width} ${positioned.height}`}
                preserveAspectRatio="xMidYMid meet"
                aria-label={view === 'workflow' ? '工作流关系图' : '团队关系图'}
              >
              <defs>
                <pattern id={`${id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" className="fill-slate-300" />
                </pattern>
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
              <rect width="100%" height="100%" fill={`url(#${id}-grid)`} opacity="0.45" />
              {positioned.edges.map((edge, index) => (
                <g
                  key={`${edge.source}-${edge.target}-${index}`}
                  className={
                    edge.label === '调用' ? 'text-emerald-600' : 'text-slate-500'
                  }
                >
                  <path
                    d={edge.path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    markerEnd={`url(#${id}-arrow)`}
                  />
                  <text
                    x={edge.x}
                    y={edge.y}
                    textAnchor="middle"
                    fill="currentColor"
                    className="text-[11px] font-medium"
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
                    className={`h-[calc(100%-6px)] w-[calc(100%-6px)] translate-x-[3px] translate-y-[3px] rounded-xl border p-3 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${node.kind === 'agent' ? 'border-blue-200 bg-white text-blue-950' : node.kind === 'skill' ? 'border-emerald-200 bg-white text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}
                  >
                    <span className="mb-1 block truncate font-semibold">
                      {node.kind === 'agent'
                        ? '角色'
                        : node.kind === 'skill'
                          ? '技能'
                          : '缺失引用'}
                      ：{node.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{node.shared ? '共享技能' : node.id}</span>
                  </button>
                </foreignObject>
              ))}
              </svg>
            </div>
          </div>
        )}
        <details className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            关系明细（{graph.edges.length}）
          </summary>
          <ul className="mt-2 space-y-2 border-t border-slate-100 pt-2 text-sm text-slate-600">
            {graph.edges.map((edge, index) => (
              <li key={index}>
                {graph.nodes.find((node) => node.id === edge.source)?.name} →{' '}
                {graph.nodes.find((node) => node.id === edge.target)?.name}：
                {edge.label}
                {edge.reference !== undefined && (
                  <pre className="solution-scrollbar mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs">
                    {JSON.stringify(edge.reference, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </details>
        {selected && (
          <aside aria-label="能力详情" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
