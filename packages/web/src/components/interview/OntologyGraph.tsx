'use client';

import { useEffect, useRef, useState } from 'react';

import type { OntologyModel, OntologyNode } from '@originos/core/types';
import type { CanonicalSemanticKind } from '@originos/core/lib/features/ontology/types';

import { SEMANTIC_KIND_OPTIONS, semanticKindLabel } from './semantic-kind';

interface SemanticNode extends OntologyNode {
  semanticKind?: CanonicalSemanticKind;
  sourceConceptId?: string;
  targetConceptId?: string;
  relationName?: string;
}
interface GraphNode { id: string; name: string; semanticKind: CanonicalSemanticKind; x: number; y: number; vx: number; vy: number; }
interface GraphLink { source: string; target: string; label: string; }
interface OntologyGraphProps { ontology?: OntologyModel | null; className?: string; onEntityClick?: (entityName: string) => void; selectedEntity?: string; }

function asSemanticNode(node: OntologyNode): SemanticNode { return node as SemanticNode; }

function colorFor(kind: CanonicalSemanticKind, color: (name: string) => string): string {
  const tokens: Record<CanonicalSemanticKind, string> = {
    role: '--primary', organization: '--accent', object: '--foreground', activity: '--ring', document: '--secondary-foreground', standard: '--destructive', unclassified: '--muted-foreground',
  };
  return color(tokens[kind]!);
}

/** Renders canonical relations only when their authoritative concept IDs are present. */
export function OntologyGraph({ ontology, className = '', onEntityClick, selectedEntity }: OntologyGraphProps) {
  const graphRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const hoveredNodeRef = useRef<string | null>(null);
  const [filter, setFilter] = useState<CanonicalSemanticKind | 'all'>('all');
  const [version, setVersion] = useState(0);
  const [viewport, setViewport] = useState({ width: 600, height: 440 });

  useEffect(() => () => { if (animationRef.current !== null) cancelAnimationFrame(animationRef.current); }, []);

  useEffect(() => {
    const element = graphRef.current;
    if (!element) return undefined;
    const update = (width: number) => {
      const nextWidth = Math.max(320, Math.round(width));
      const nextHeight = Math.min(640, Math.max(360, Math.round(nextWidth * 0.72)));
      setViewport((current) => current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight });
    };
    update(element.clientWidth);
    const observer = new ResizeObserver((entries) => update(entries[0]?.contentRect.width ?? element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ontology || !canvas) { nodesRef.current = []; linksRef.current = []; setVersion((value) => value + 1); return; }
    const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
    const concepts = ontology.nodes.filter((node) => node.type === 'entity' || node.type === 'class').map(asSemanticNode)
      .filter((node) => filter === 'all' || (node.semanticKind ?? 'unclassified') === filter);
    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;
    const radius = Math.min(Math.min(viewport.width, viewport.height) * 0.32, 70 + concepts.length * 13);
    const nodes = concepts.map((node, index): GraphNode => {
      const old = previous.get(node.id); const angle = (index / Math.max(concepts.length, 1)) * Math.PI * 2 - Math.PI / 2;
      return { id: node.id, name: node.name, semanticKind: node.semanticKind ?? 'unclassified', x: old?.x ?? centerX + Math.cos(angle) * radius, y: old?.y ?? centerY + Math.sin(angle) * radius, vx: old?.vx ?? 0, vy: old?.vy ?? 0 };
    });
    const visible = new Set(nodes.map((node) => node.id));
    const links = ontology.nodes.filter((node) => node.type === 'relationship').map(asSemanticNode).flatMap((relation): GraphLink[] => {
      if (!relation.sourceConceptId || !relation.targetConceptId || !visible.has(relation.sourceConceptId) || !visible.has(relation.targetConceptId)) return [];
      return [{ source: relation.sourceConceptId, target: relation.targetConceptId, label: relation.relationName ?? relation.description ?? relation.name }];
    });
    nodesRef.current = nodes; linksRef.current = links; setVersion((value) => value + 1);
  }, [filter, ontology, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext('2d');
    if (!canvas || !context || nodesRef.current.length === 0) return;
    const style = window.getComputedStyle(canvas);
    const token = (name: string, alpha?: number) => { const value = style.getPropertyValue(name).trim(); return alpha === undefined ? `hsl(${value})` : `hsl(${value} / ${alpha})`; };
    let last = 0;
    const draw = (time: number) => {
      const speed = Math.min(Math.max((time - last) / 16, 0.5), 2); last = time;
      const nodes = nodesRef.current; const links = linksRef.current;
      for (let index = 0; index < nodes.length; index += 1) for (let other = index + 1; other < nodes.length; other += 1) {
        const left = nodes[index]!; const right = nodes[other]!; const dx = right.x - left.x; const dy = right.y - left.y; const distance = Math.hypot(dx, dy) || 1; const force = 1900 / (distance * distance) * speed;
        left.vx -= dx / distance * force; left.vy -= dy / distance * force; right.vx += dx / distance * force; right.vy += dy / distance * force;
      }
      for (const link of links) {
        const source = nodes.find((node) => node.id === link.source); const target = nodes.find((node) => node.id === link.target); if (!source || !target) continue;
        const dx = target.x - source.x; const dy = target.y - source.y; const distance = Math.hypot(dx, dy) || 1; const force = (distance - 110) * 0.012 * speed;
        source.vx += dx / distance * force; source.vy += dy / distance * force; target.vx -= dx / distance * force; target.vy -= dy / distance * force;
      }
      for (const node of nodes) { const padding = 64; node.vx = (node.vx + (canvas.width / 2 - node.x) * 0.0006 * speed) * 0.88; node.vy = (node.vy + (canvas.height / 2 - node.y) * 0.0006 * speed) * 0.88; node.x = Math.max(padding, Math.min(canvas.width - padding, node.x + node.vx * speed)); node.y = Math.max(padding, Math.min(canvas.height - padding, node.y + node.vy * speed)); }
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const link of links) {
        const source = nodes.find((node) => node.id === link.source); const target = nodes.find((node) => node.id === link.target); if (!source || !target) continue;
        context.beginPath(); context.moveTo(source.x, source.y); context.lineTo(target.x, target.y); context.strokeStyle = token('--muted-foreground'); context.globalAlpha = 0.55; context.lineWidth = 1.5; context.stroke(); context.globalAlpha = 1;
        const x = (source.x + target.x) / 2; const y = (source.y + target.y) / 2; context.font = '10px system-ui'; const width = context.measureText(link.label).width; context.fillStyle = token('--card', 0.92); context.fillRect(x - width / 2 - 4, y - 8, width + 8, 16); context.fillStyle = token('--muted-foreground'); context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(link.label, x, y);
      }
      for (const node of nodes) {
        const active = node.name === selectedEntity || node.id === hoveredNodeRef.current; context.beginPath(); context.arc(node.x, node.y, 24, 0, Math.PI * 2); context.fillStyle = colorFor(node.semanticKind, (name) => token(name)); context.globalAlpha = active ? 1 : 0.82; context.fill(); context.globalAlpha = 1;
        if (active) { context.strokeStyle = token('--foreground'); context.lineWidth = 2; context.stroke(); }
        context.fillStyle = token('--foreground'); context.font = '11px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(node.name, node.x, node.y - 3); context.fillStyle = token('--card'); context.font = '9px system-ui'; context.fillText(semanticKindLabel(node.semanticKind), node.x, node.y + 10);
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    animationRef.current = requestAnimationFrame(draw);
    return () => { if (animationRef.current !== null) cancelAnimationFrame(animationRef.current); };
  }, [selectedEntity, version]);

  const nodeAt = (event: React.MouseEvent<HTMLCanvasElement>): GraphNode | undefined => {
    const canvas = canvasRef.current; if (!canvas) return undefined; const bounds = canvas.getBoundingClientRect(); const x = (event.clientX - bounds.left) * canvas.width / bounds.width; const y = (event.clientY - bounds.top) * canvas.height / bounds.height;
    return nodesRef.current.find((node) => Math.hypot(x - node.x, y - node.y) <= 29);
  };

  return <div ref={graphRef} className={`relative min-w-0 text-foreground ${className}`}>
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label="概念分类图例"><span className="mr-1">分类：</span><button type="button" onClick={() => setFilter('all')} className={`rounded border px-2 py-1 ${filter === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted'}`}>全部</button>{SEMANTIC_KIND_OPTIONS.map((kind) => <button key={kind} type="button" onClick={() => setFilter(kind)} className={`rounded border px-2 py-1 ${filter === kind ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted'}`}>{semanticKindLabel(kind)}</button>)}</div>
    <canvas ref={canvasRef} width={viewport.width} height={viewport.height} onMouseMove={(event) => { const found = nodeAt(event); hoveredNodeRef.current = found?.id ?? null; event.currentTarget.style.cursor = found ? 'pointer' : 'default'; }} onClick={(event) => { const found = nodeAt(event); if (found) onEntityClick?.(found.name); }} className="block w-full rounded-lg" />
    {nodesRef.current.length === 0 && <div className="absolute inset-x-0 bottom-1/2 text-center text-sm text-muted-foreground">暂无符合筛选条件的概念</div>}
  </div>;
}
