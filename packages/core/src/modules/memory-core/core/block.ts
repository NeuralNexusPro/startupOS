/**
 * Block — 记忆基本单元。
 *
 * Story M.1: 类型定义与 Block 抽象
 *
 * 借鉴 Letta BaseBlock，扩展 OriginOS 需求：
 * - namespace 支持层级标签（system/persona）
 * - tags 支持分类和语义检索
 * - version 支持版本追溯
 * - 去除 Letta 多租户字段（template_*, deployment_id）
 */

// ============================================================================
// Types
// ============================================================================

/** Block 元数据 */
export interface BlockMetadata {
  lastEditedBy?: 'agent' | 'user' | 'dream' | 'system';
  lastEdited?: number;
  priority?: 'high' | 'medium' | 'low';
  category?: string;
  hidden?: boolean;
}

/** Block: LLM 上下文窗口的保留区 */
export interface Block {
  id: string;
  label: string;
  value: string;
  limit: number;
  description: string;
  metadata: BlockMetadata;
  readOnly: boolean;
  tags: string[];
  namespace?: string;
  createdAt: number;
  updatedAt: number;
  version: number;
}

/** 默认 Block 定义（用于初始化） */
export interface BlockDefinition {
  label: string;
  description: string;
  limit: number;
  readOnly?: boolean;
  namespace?: string;
  tags?: string[];
}

/** 旧 MemoryBlock 接口（兼容 cognitive/types.ts） */
import type { MemoryBlock as LegacyMemoryBlock } from '../../../lib/shared/cognitive/types';
export type { MemoryBlock as LegacyMemoryBlock } from '../../../lib/shared/cognitive/types';

// ============================================================================
// Default Blocks
// ============================================================================

export const DEFAULT_BLOCKS: BlockDefinition[] = [
  { label: 'human', description: '用户画像、偏好、历史习惯', limit: 2000, namespace: 'system' },
  { label: 'persona', description: 'Agent 角色认知、工作风格、专业语言', limit: 2000, namespace: 'system' },
  { label: 'project', description: '当前项目状态、活跃任务、关键决策', limit: 3000, namespace: 'system' },
  { label: 'scratchpad', description: '临时笔记、待办、注意项', limit: 1000, namespace: 'system' },
  { label: 'temporal', description: '关键事件时间线', limit: 3000, readOnly: true, namespace: 'system' },
];

// ============================================================================
// Factory & Utilities
// ============================================================================

/** 生成唯一 ID */
function generateId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/** 从 BlockDefinition 创建 Block 实例 */
export function createBlock(def: BlockDefinition, value = ''): Block {
  const now = Date.now();
  return {
    id: generateId(),
    label: def.label,
    value,
    limit: def.limit,
    description: def.description,
    metadata: {},
    readOnly: def.readOnly ?? false,
    tags: def.tags ?? [],
    namespace: def.namespace,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/** 校验 Block 是否有效 */
export function validateBlock(block: Block): string | null {
  if (!block.label || block.label.trim() === '') {
    return 'Block label must not be empty';
  }
  if (block.value.length > block.limit) {
    return `Block value exceeds limit (${block.value.length} > ${block.limit})`;
  }
  if (block.limit <= 0) {
    return 'Block limit must be positive';
  }
  return null;
}

/** 将 Block 转换为旧 MemoryBlock 格式（兼容层） */
export function toLegacyBlock(block: Block): LegacyMemoryBlock {
  return {
    label: block.label,
    value: block.value,
    limit: block.limit,
    description: block.description,
    metadata: block.metadata as Record<string, unknown>,
    readOnly: block.readOnly,
  };
}

/** 将旧 MemoryBlock 转换为新 Block 格式 */
export function fromLegacyBlock(legacy: LegacyMemoryBlock, overrides?: Partial<Block>): Block {
  const now = Date.now();
  return {
    id: overrides?.id ?? generateId(),
    label: legacy.label,
    value: legacy.value,
    limit: legacy.limit,
    description: legacy.description,
    metadata: legacy.metadata as BlockMetadata,
    readOnly: legacy.readOnly,
    tags: overrides?.tags ?? [],
    namespace: overrides?.namespace,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    version: overrides?.version ?? 1,
  };
}

/** 序列化 Block 为 JSON（用于持久化） */
export function serializeBlock(block: Block): Record<string, unknown> {
  return { ...block };
}

/** 从 JSON 反序列化 Block */
export function deserializeBlock(data: Record<string, unknown>): Block {
  return {
    id: String(data['id'] ?? ''),
    label: String(data['label'] ?? ''),
    value: String(data['value'] ?? ''),
    limit: Number(data['limit'] ?? 2000),
    description: String(data['description'] ?? ''),
    metadata: (data['metadata'] ?? {}) as BlockMetadata,
    readOnly: Boolean(data['readOnly']),
    tags: Array.isArray(data['tags']) ? data['tags'] : [],
    namespace: typeof data['namespace'] === 'string' ? data['namespace'] : undefined,
    createdAt: Number(data['createdAt'] ?? Date.now()),
    updatedAt: Number(data['updatedAt'] ?? Date.now()),
    version: Number(data['version'] ?? 1),
  };
}
