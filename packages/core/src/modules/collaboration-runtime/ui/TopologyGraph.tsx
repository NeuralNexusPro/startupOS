"use client";

import { useMemo } from "react";

import type { CollaborationTopology } from "../session/types";
import type { AgentActivity, AgentStatus } from "./store";

const NODE_WIDTH = 220;
const BODY_MIN_HEIGHT = 76;
const BADGE_HEIGHT = 16;
const PADDING = 42;

const STATUS_STYLES: Record<AgentStatus, {
  shell: string;
  accent: string;
  dot: string;
  title: string;
  meta: string;
  badge: string;
  label: string;
}> = {
  idle: { shell: "#ffffff", accent: "#94a3b8", dot: "#64748b", title: "#0f172a", meta: "#64748b", badge: "#f8fafc", label: "空闲" },
  running: { shell: "#ffffff", accent: "#4f46e5", dot: "#4f46e5", title: "#0f172a", meta: "#475569", badge: "#e0e7ff", label: "执行中" },
  thinking: { shell: "#ffffff", accent: "#0284c7", dot: "#0284c7", title: "#0f172a", meta: "#475569", badge: "#e0f2fe", label: "思考中" },
  tool_call: { shell: "#ffffff", accent: "#ea580c", dot: "#ea580c", title: "#0f172a", meta: "#475569", badge: "#ffedd5", label: "调用工具" },
  complete: { shell: "#ffffff", accent: "#059669", dot: "#059669", title: "#0f172a", meta: "#475569", badge: "#d1fae5", label: "已完成" },
  fail: { shell: "#ffffff", accent: "#dc2626", dot: "#dc2626", title: "#0f172a", meta: "#475569", badge: "#fee2e2", label: "失败" },
  waiting: { shell: "#ffffff", accent: "#ca8a04", dot: "#ca8a04", title: "#0f172a", meta: "#475569", badge: "#fef3c7", label: "等待中" },
};

const EDGE_STYLES: Record<string, {
  stroke: string;
  soft: string;
  label: string;
  dash?: string;
}> = {
  trigger: { stroke: "#d97706", soft: "#fef3c7", label: "触发" },
  notify: { stroke: "#059669", soft: "#d1fae5", label: "通知", dash: "6 6" },
  depend: { stroke: "#2563eb", soft: "#dbeafe", label: "依赖" },
};

interface TopologyGraphProps {
  topology: CollaborationTopology | null;
  activities?: Record<string, AgentActivity>;
  recentlyActiveAgents?: string[];
  onNodeClick?: (agentId: string) => void;
}

interface LayoutNode {
  id: string;
  name: string;
  domain: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  description: string;
  path: string;
  labelX: number;
  labelY: number;
}

interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

function estimateNodeHeight(): number {
  return BODY_MIN_HEIGHT;
}

function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function hasCjkText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function getNodeTitle(node: LayoutNode, index: number): string {
  return hasCjkText(node.name) ? node.name : `角色 ${index + 1}`;
}

function getNodeSubtitle(node: LayoutNode): string {
  if (hasCjkText(node.domain)) {
    return node.domain;
  }
  return "协作任务";
}

function buildLayout(topology: CollaborationTopology | null): GraphLayout {
  if (!topology) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const agents = Object.values(topology.agents);
  const layoutEdgesSource = topology.edges.filter(
    (edge) => edge.type === "trigger" || edge.type === "depend"
  );
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const depthMap = new Map<string, number>();

  for (const agent of agents) {
    inDegree.set(agent.id, 0);
    outgoing.set(agent.id, []);
  }

  for (const edge of layoutEdgesSource) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const queue: string[] = [];
  for (const agent of agents) {
    if ((inDegree.get(agent.id) ?? 0) === 0) {
      queue.push(agent.id);
      depthMap.set(agent.id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthMap.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      depthMap.set(next, Math.max(depthMap.get(next) ?? 0, currentDepth + 1));
      const nextInDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(next);
      }
    }
  }

  const layers = new Map<number, typeof agents>();
  for (const agent of agents) {
    const depth = depthMap.get(agent.id) ?? 0;
    const layer = layers.get(depth) ?? [];
    layer.push(agent);
    layers.set(depth, layer);
  }

  const levelGapX = 280;
  const levelGapY = 118;
  const nodes: LayoutNode[] = [];

  const layerEntries = Array.from(layers.entries()).sort((a, b) => a[0] - b[0]);

  for (const [depth, layerAgents] of layerEntries) {
    layerAgents.forEach((agent, index) => {
      nodes.push({
        id: agent.id,
        name: agent.name,
        domain: agent.domain,
        width: NODE_WIDTH,
        height: estimateNodeHeight(),
        x: PADDING + depth * levelGapX,
        y: PADDING + index * levelGapY,
      });
    });
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  const edges: LayoutEdge[] = topology.edges
    .map((edge) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) {
        return null;
      }

      const fromX = from.x + from.width;
      const fromY = from.y + from.height / 2;
      const toX = to.x;
      const toY = to.y + to.height / 2;
      const midX = (fromX + toX) / 2;
      const bend = edge.type === "notify" ? 28 : 0;
      const path = `M ${fromX} ${fromY} C ${midX + bend} ${fromY}, ${midX - bend} ${toY}, ${toX} ${toY}`;

      return {
        id: `${edge.from}-${edge.to}-${edge.type}`,
        from: edge.from,
        to: edge.to,
        type: edge.type,
        description: edge.description,
        path,
        labelX: midX,
        labelY: (fromY + toY) / 2 - 14,
      };
    })
    .filter((edge) => edge !== null) as LayoutEdge[];

  const width = Math.max(...nodes.map((node) => node.x + node.width), 0) + PADDING;
  const height = Math.max(...nodes.map((node) => node.y + node.height), 0) + PADDING;

  return { nodes, edges, width, height };
}

export function TopologyGraph({ topology, activities, recentlyActiveAgents = [], onNodeClick }: TopologyGraphProps) {
  const layout = useMemo(() => buildLayout(topology), [topology]);

  if (!topology || layout.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-500">
        暂无拓扑数据
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white p-4 text-slate-900">
      <div className="mb-3 flex flex-shrink-0 items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-slate-700">协同拓扑</div>
          <div className="mt-0.5 text-[10px] text-slate-500">{layout.nodes.length} 个节点 / {layout.edges.length} 条连接</div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          {Object.entries(EDGE_STYLES).map(([type, style]) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden="true">
                <rect x="0" y="2" width="16" height="2" rx="1" fill={style.stroke} />
              </svg>
              {style.label}
            </span>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
        <svg
          width="100%"
          height="100%"
          className="block"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <pattern id="collab-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
            </pattern>
            <radialGradient id="collab-vignette" cx="50%" cy="22%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.86)" />
              <stop offset="58%" stopColor="rgba(255,255,255,0.00)" />
              <stop offset="100%" stopColor="rgba(226,232,240,0.58)" />
            </radialGradient>
            <filter id="collab-node-shadow" x="-24%" y="-36%" width="148%" height="180%">
              <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="rgba(15,23,42,0.12)" />
            </filter>
            {Object.entries(EDGE_STYLES).map(([type, style]) => (
              <marker
                key={type}
                id={`collab-arrow-${type}`}
                viewBox="0 0 12 12"
                refX="10"
                refY="6"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 6 L 0 11 z" fill={style.stroke} opacity="0.95" />
              </marker>
            ))}
          </defs>

          <rect x="0" y="0" width={layout.width} height={layout.height} fill="#f8fafc" />
          <rect x="0" y="0" width={layout.width} height={layout.height} fill="url(#collab-grid)" />
          <rect x="0" y="0" width={layout.width} height={layout.height} fill="url(#collab-vignette)" />

          {layout.edges.map((edge) => {
            const style = EDGE_STYLES[edge.type] ?? EDGE_STYLES["trigger"]!;
            return (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={6}
                  strokeDasharray={style.dash}
                  opacity={0.12}
                />
                <path
                  d={edge.path}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={1.8}
                  strokeDasharray={style.dash}
                  markerEnd={`url(#collab-arrow-${edge.type})`}
                  opacity={0.70}
                />
                <g transform={`translate(${edge.labelX}, ${edge.labelY})`}>
                  <rect
                    x={-24}
                    y={-9}
                    width={48}
                    height={18}
                    rx={9}
                    fill={style.soft}
                    stroke={style.stroke}
                    strokeWidth={0.7}
                    opacity={0.94}
                  />
                  <text
                    textAnchor="middle"
                    dy="0.35em"
                    className="text-[8px] font-semibold"
                    fill={style.stroke}
                  >
                    {style.label}
                  </text>
                </g>
              </g>
            );
          })}

          {layout.nodes.map((node, index) => {
            const activity = activities?.[node.id];
            const status = activity?.status ?? "idle";
            const styles = STATUS_STYLES[status];
            const statusLabel = styles.label;
            const isActive = recentlyActiveAgents.includes(node.id);
            const isExecuting = status === "running" || status === "thinking" || status === "tool_call";
            const nodeTitle = getNodeTitle(node, index);
            const nodeSubtitle = getNodeSubtitle(node);

            return (
              <g
                key={node.id}
                onClick={() => onNodeClick?.(node.id)}
                className="cursor-pointer"
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={8}
                  fill={styles.shell}
                  stroke={isActive || isExecuting ? styles.accent : "#dbe3ee"}
                  strokeWidth={isActive || isExecuting ? 2 : 1}
                  filter="url(#collab-node-shadow)"
                />
                <rect
                  x={node.x}
                  y={node.y}
                  width={4}
                  height={node.height}
                  rx={8}
                  fill={styles.accent}
                />
                <text
                  x={node.x + 20}
                  y={node.y + 25}
                  className="text-[12.5px] font-semibold"
                  fill={styles.title}
                >
                  {compactText(nodeTitle, 16)}
                </text>
                <text
                  x={node.x + 20}
                  y={node.y + 47}
                  className="text-[9.5px] font-medium"
                  fill={styles.meta}
                >
                  {compactText(nodeSubtitle, 18)}
                </text>
                <g transform={`translate(${node.x + node.width - 78}, ${node.y + 52})`}>
                  <rect
                    width={60}
                    height={BADGE_HEIGHT}
                    rx={8}
                    fill={styles.badge}
                    stroke={styles.accent}
                    strokeWidth={0.7}
                  />
                  <text
                    x={30}
                    y={10.5}
                    textAnchor="middle"
                    className="text-[7.5px] font-semibold"
                    fill={styles.dot}
                  >
                    {statusLabel}
                  </text>
                </g>
                {/* Preserve the card hit target after visual simplification. */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={8}
                  fill="transparent"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
