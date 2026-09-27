import { Graph, layout } from '@dagrejs/dagre';
import type {
  GraphProjection,
  GraphView,
  GraphNode,
  GraphEdge,
} from './solution-topology';

interface PositionedTopology {
  nodes: Array<GraphNode & { x: number; y: number }>;
  edges: Array<GraphEdge & { path: string; x: number; y: number }>;
  width: number;
  height: number;
}

export function layoutTopology(
  projection: GraphProjection,
  view: GraphView
): PositionedTopology {
  const graph = new Graph({ multigraph: true });
  graph.setGraph({
    rankdir: view === 'workflow' ? 'LR' : 'TB',
    nodesep: 50,
    ranksep: 100,
    marginx: 30,
    marginy: 30,
  });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of projection.nodes)
    graph.setNode(node.id, { width: 250, height: 85 });
  projection.edges.forEach((edge, index) =>
    graph.setEdge(
      edge.source,
      edge.target,
      { label: edge.label, width: 50, height: 20 },
      String(index)
    )
  );
  layout(graph);
  const nodes = projection.nodes.map((node) => {
    const placed = graph.node(node.id);
    return { ...node, x: placed.x - 125, y: placed.y - 42.5 };
  });
  const edges = projection.edges.map((edge, index) => {
    const placed = graph.edge({
      v: edge.source,
      w: edge.target,
      name: String(index),
    });
    const points = placed.points as Array<{ x: number; y: number }>;
    return {
      ...edge,
      path: points
        .map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`)
        .join(' '),
      x: placed.x,
      y: placed.y,
    };
  });
  return {
    nodes,
    edges,
    width: Math.max(graph.graph().width || 0, 400),
    height: Math.max(graph.graph().height || 0, 220),
  };
}
