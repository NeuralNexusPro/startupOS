'use client';

import { useRef, useEffect, useState } from 'react';
import type { OntologyModel } from '@originos/core/types';

interface GraphNode {
  id: string;
  name: string;
  type: 'entity' | 'class' | 'relationship' | 'property' | 'rule';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string; // Relationship name to display on edge
}

interface OntologyGraphProps {
  ontology?: OntologyModel | null;
  className?: string;
  onEntityClick?: (entityName: string) => void;
  selectedEntity?: string;
}

const COLORS = {
  entity: '#6366F1',      // Primary blue
  class: '#8B5CF6',       // Purple
  relationship: '#F59E0B', // Amber
  property: '#10B981',     // Emerald
};

const getNodeRadius = (type: string) => {
  switch (type) {
    case 'entity': return 24;
    case 'class': return 20;
    case 'relationship': return 16;
    case 'property': return 12;
    default: return 16;
  }
};

const getNodeColor = (type: string) => {
  return COLORS[type as keyof typeof COLORS] || COLORS.entity;
};

export function OntologyGraph({ ontology, className = '', onEntityClick, selectedEntity }: OntologyGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const hoveredNodeRef = useRef<string | null>(null);
  // Add state to track node/link count for re-rendering
  const [nodeCount, setNodeCount] = useState(0);
  const [linkCount, setLinkCount] = useState(0);

  // 清除动画
  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // 当 ontology 变化时计算节点位置（保留现有节点位置）
  useEffect(() => {
    if (!ontology) {
      nodesRef.current = [];
      linksRef.current = [];
      setNodeCount(0);
      setLinkCount(0);
      return;
    }

    // 从现有节点复制位置和速度
    const existingNodesMap = new Map(nodesRef.current.map(n => [n.name, {
      x: n.x,
      y: n.y,
      vx: n.vx,
      vy: n.vy,
    }]));

    const processedNodes = new Set<string>();
    const newNodes: GraphNode[] = [];
    const newLinks: GraphLink[] = [];

    // 处理实体/类节点 (DO NOT include property nodes)
    const entityNodes = ontology.nodes.filter(
      n => n.type === 'entity' || n.type === 'class'
    );

    // 使用圆形布局
    const centerX = 300;
    const centerY = 300;
    const radius = Math.min(200, 50 + entityNodes.length * 15);

    entityNodes.forEach((node, index) => {
      if (processedNodes.has(node.name)) return;
      processedNodes.add(node.name);

      const existingPos = existingNodesMap.get(node.name);
      const angle = (index / Math.max(1, entityNodes.length)) * Math.PI * 2 - Math.PI / 2;

      // 如果节点已存在，保留位置；否则使用圆形布局
      const targetX = existingPos?.x ?? centerX + Math.cos(angle) * radius;
      const targetY = existingPos?.y ?? centerY + Math.sin(angle) * radius;

      newNodes.push({
        id: node.id,
        name: node.name,
        type: node.type as any,
        x: targetX,
        y: targetY,
        vx: existingPos?.vx ?? 0,
        vy: existingPos?.vy ?? 0,
        radius: getNodeRadius(node.type),
        color: getNodeColor(node.type),
      });

      // DO NOT add property nodes or links - properties are hidden as requested
    });

    // 处理关系节点 - Create direct edges between entities
    const relationshipNodes = ontology?.nodes.filter(n => n.type === 'relationship') ?? [];

    // Create reverse mapping from Chinese to English for entity lookup
    const chineseToEnglishMap = new Map<string, string>();
    const commonEntityNames: Record<string, string> = {
      'Order': '订单',
      'WorkOrder': '生产任务',
      'Material': '物料',
      'Delivery': '物流',
      'ExceptionEvent': '异常事件',
      'Customer': '客户',
      'Supplier': '供应商',
      'User': '用户',
      'Product': '产品',
      'Task': '任务',
    };

    // Build the mapping from the actual nodes
    newNodes.forEach(node => {
      // Find if this Chinese name maps to an English name
      for (const [eng, chi] of Object.entries(commonEntityNames)) {
        if (node.name === chi) {
          chineseToEnglishMap.set(chi, eng);
          break;
        }
      }
    });

    relationshipNodes.forEach((node) => {
      const parts = node.name.split('→').map(s => s.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const chineseFrom = parts[0];
        const chineseTo = parts[1];

        // Map Chinese names back to English for lookup
        // Find the entity nodes (use Chinese names for display names)
        const sourceNode = newNodes.find(n => n.name === chineseFrom);
        const targetNode = newNodes.find(n => n.name === chineseTo);

        if (sourceNode && targetNode) {
          // Extract relationship label from description
          const relationshipLabel = node.description?.match(/^([^\(]+)/)?.[1]?.trim() || '';

          // Create direct edge between entities with label
          newLinks.push({
            source: sourceNode.id,
            target: targetNode.id,
            sourceNodeId: chineseFrom,
            targetNodeId: chineseTo,
            label: relationshipLabel, // Add relationship label to display on edge
          });
        } else {
          // Log missing nodes for debugging
          if (!sourceNode) {
            console.warn(`[OntologyGraph] Source node not found for relationship: ${chineseFrom} → ${chineseTo}`);
          }
          if (!targetNode) {
            console.warn(`[OntologyGraph] Target node not found for relationship: ${chineseFrom} → ${chineseTo}`);
          }
        }
      } else {
        console.warn(`[OntologyGraph] Invalid relationship format: ${node.name}`);
      }
    });

    nodesRef.current = newNodes;
    linksRef.current = newLinks;
    setNodeCount(newNodes.length);
    setLinkCount(newLinks.length);
  }, [ontology]);

  // 力导向模拟
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const style = window.getComputedStyle(canvas);
    const themeColor = (name: string, alpha?: number) => {
      const value = style.getPropertyValue(name).trim();
      return alpha === undefined ? `hsl(${value})` : `hsl(${value} / ${alpha})`;
    };
    const foregroundColor = style.color;
    const mutedForegroundColor = themeColor('--muted-foreground');
    const labelBackgroundColor = themeColor('--card', 0.9);

    const nodes = nodesRef.current || [];
    const links = linksRef.current || [];

    if (nodes.length === 0) return;

    let lastTimestamp = 0;

    const simulate = (timestamp: number) => {
      const deltaTime = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      // 物理参数
      const k = 0.01;  // 弹簧常数
      const repulsion = 2000;  // 斥力
      const damping = 0.9;  // 阻尼
      const speed = Math.min(deltaTime / 16, 2); // 时间步长限制

      // 计算力
      // 1. 斥力（节点之间互斥）
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const ni = nodes[i]!;
          const nj = nodes[j]!;
          const dx = nj.x - ni.x;
          const dy = nj.y - ni.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force * speed;
          const fy = (dy / dist) * force * speed;

          ni.vx -= fx;
          ni.vy -= fy;
          nj.vx += fx;
          nj.vy += fy;
        }
      }

      // 2. 弹簧力（连接的节点互相吸引）
      for (const link of links) {
        const source = nodes.find(n => n.id === link.source);
        const target = nodes.find(n => n.id === link.target);
        if (!source || !target) continue;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const force = (dist - 100) * k * speed;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        source.vx += fx;
        source.vy += fy;
        target.vx -= fx;
        target.vy -= fy;
      }

      // 3. 中心引力（防止节点飞得太远）
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      for (const node of nodes) {
        const dx = centerX - node.x;
        const dy = centerY - node.y;
        node.vx += dx * 0.0005 * speed;
        node.vy += dy * 0.0005 * speed;
      }

      // 更新位置
      for (const node of nodes) {
        node.vx *= damping;
        node.vy *= damping;
        node.x += node.vx * speed;
        node.y += node.vy * speed;

        // 边界约束
        const padding = node.radius + 10;
        node.x = Math.max(padding, Math.min(canvas.width - padding, node.x));
        node.y = Math.max(padding, Math.min(canvas.height - padding, node.y));
      }

      // 绘制
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 绘制连接线
      for (const link of links) {
        if (!link) continue;
        const source = nodes.find(n => n.id === link.source);
        const target = nodes.find(n => n.id === link.target);
        if (!source || !target) continue;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        // 渐变色连接线
        const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
        gradient.addColorStop(0, source.color + '60');
        gradient.addColorStop(1, target.color + '60');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw relationship label on edge if available
        if (link.label) {
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;

          // Draw label background
          ctx.font = '10px system-ui';
          const textWidth = ctx.measureText(link.label).width;
          const padding = 4;

          ctx.fillStyle = labelBackgroundColor;
          ctx.beginPath();
          ctx.roundRect(midX - textWidth/2 - padding, midY - 8, textWidth + padding*2, 16, 4);
          ctx.fill();

          // Draw label text
          ctx.fillStyle = mutedForegroundColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(link.label, midX, midY);
        }
      }

      // 绘制节点
      for (const node of nodes) {
        const isHovered = hoveredNodeRef.current === node.id;
        const isSelected = selectedEntity === node.name;

        // 绘制节点阴影
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color + '20';
        ctx.fill();

        // 绘制节点主体
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        // Use different fill for selected/hovered state
        ctx.fillStyle = (isSelected || isHovered) ? node.color : node.color + 'CC';
        ctx.fill();

        // 绘制边框
        if (isSelected) {
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 4;
          ctx.stroke();
        } else if (isHovered) {
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // 文字标签
        ctx.fillStyle = foregroundColor;
        ctx.font = isHovered ? 'bold 12px system-ui' : '11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 超长文本截断
        const maxTextWidth = node.radius * 2.5;
        let text = node.name;
        if (ctx.measureText(text).width > maxTextWidth) {
          while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 3) {
            text = text.slice(0, -1);
          }
          text += '...';
        }

        ctx.fillText(text, node.x, node.y + node.radius + 15);

        // 类型徽章
        if (node.type === 'entity' || node.type === 'class') {
          ctx.font = '10px system-ui';
          ctx.fillStyle = mutedForegroundColor;
          ctx.fillText(node.type === 'entity' ? '实体' : '类', node.x, node.y);
        }
      }

      animationRef.current = requestAnimationFrame(simulate);
    };

    animationRef.current = requestAnimationFrame(simulate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodeCount, linkCount, selectedEntity]);

  // 处理交互
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let found = null;
    for (const node of nodesRef.current) {
      const dx = x - node.x;
      const dy = y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 5) { // +5px tolerance for easier clicking
        found = node.id;
        break;
      }
    }

    hoveredNodeRef.current = found;
    canvas.style.cursor = found ? 'pointer' : 'default';
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Recalculate hit on click for reliability
    let found = null;
    for (const node of nodesRef.current) {
      const dx = x - node.x;
      const dy = y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius + 5) {
        found = node;
        break;
      }
    }

    if (found && (found.type === 'entity' || found.type === 'class')) {
      console.log('[OntologyGraph] Node clicked:', found.name);
      onEntityClick?.(found.name);
    }
  };

  // 设置 canvas 尺寸
  const canvasSize = { width: 600, height: 600 };

  return (
    <div className={`relative text-foreground ${className}`} style={{ width: canvasSize.width, height: canvasSize.height }}>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        className="w-full h-full"
      />
      {nodeCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
          暂无实体数据
        </div>
      )}
    </div>
  );
}
