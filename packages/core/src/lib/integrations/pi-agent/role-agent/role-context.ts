/**
 * 角色上下文加载器（Story R.1）
 *
 * 在角色启动时加载完整的角色上下文（5 个 .md 文件 + 已安装技能），
 * 为后续的状态恢复、system prompt 构建提供数据基础。
 */

import {
  existsSync,
  readFileSync,
} from 'fs';
import path from 'path';
import { scanInstalledSkills, type SkillInfo } from './skill-resolver';
import type { MemoryBlock } from '../../../../lib/integrations/pi-agent/cognitive/types';
import { parseBlocksFromMarkdown } from '../../../../modules/memory-core';

// Re-export SkillInfo for downstream consumers
export { type SkillInfo };
// Re-export scanInstalledSkills so callers can use it from this module too
export { scanInstalledSkills } from './skill-resolver';
// Re-export MemoryBlock for downstream consumers
export { type MemoryBlock } from '../../../../lib/integrations/pi-agent/cognitive/types';
// Re-export Memory Block parser
export { parseBlocksFromMarkdown } from '../../../../modules/memory-core';

// ============================================================================
// 类型定义
// ============================================================================

/** 角色上下文 — 统一接口 */
export interface RoleContext {
  /** Agent.md 全文（角色身份） */
  agentMd: string;
  /** Role.md 全文（状态机 + 生命周期） */
  roleMd: string | null;
  /** Taste.md 全文（风格指南） */
  tasteMd: string | null;
  /** Memory.md 全文（历史记忆） */
  memoryMd: string | null;
  /** Tool.md 全文（工具箱配置） */
  toolMd: string | null;
  /** Knowledge.md 全文（知识库索引快照） */
  knowledgeMd: string | null;
  /** Patterns.md 全文（经验模式索引快照） */
  patternsMd: string | null;
  /** Memory Blocks（C.9 三元记忆 Core） */
  memoryBlocks: MemoryBlock[] | null;
  /** 当前所处阶段名（从 Role.md 解析，默认第一个阶段） */
  currentPhase: string;
  /** 已安装技能列表（从 .skills/ 目录扫描） */
  installedSkills: SkillInfo[];
  /** Tool.md frontmatter 中提取的允许工具列表 */
  allowedTools: string[];
  /** 角色工作目录 */
  agentBaseDir: string;
}

// ============================================================================
// 内部辅助
// ============================================================================

/** 安全读取 .md 文件，不存在时返回 null */
function readMdFile(dir: string, fileName: string): string | null {
  const filePath = path.join(dir, fileName);
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** 从 Markdown frontmatter 中提取指定键的值 */
function parseFrontmatterArray(content: string | null, key: string): string[] {
  if (!content) return [];
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return [];
  const frontmatter = match[1];
  const keyMatch = frontmatter.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm'));
  if (!keyMatch?.[1]) return [];
  return keyMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/**
 * 从 Tool.md frontmatter 中提取 allowedTools / disabledTools。
 * 返回 allowedTools 列表（如果未定义则返回空数组）。
 */
export function parseToolMdTools(toolMd: string | null): {
  allowedTools: string[];
  disabledTools: string[];
} {
  return {
    allowedTools: parseFrontmatterArray(toolMd, 'allowedTools'),
    disabledTools: parseFrontmatterArray(toolMd, 'disabledTools'),
  };
}

/**
 * 从 Role.md 中提取当前阶段名。
 * 若 Role.md 中未定义阶段，返回默认阶段 'default'。
 */
function extractCurrentPhase(roleMd: string | null): string {
  if (!roleMd) return 'default';

  const fmPhase = parseFrontmatterArray(roleMd, 'currentPhase');
  if (fmPhase.length > 0) return fmPhase[0]!;

  const match = roleMd.match(/^---\n([\s\S]*?)\n---/);
  if (match?.[1]) {
    const phaseMatch = match[1].match(/^currentPhase:\s*(.+)$/m);
    if (phaseMatch?.[1]) return phaseMatch[1].trim();
  }

  return 'default';
}

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 从 Memory.md 解析 Memory Blocks 数组。
 */
function parseMemoryBlocks(memoryMd: string | null): MemoryBlock[] | null {
  if (!memoryMd) return null;
  try {
    const blocks = parseBlocksFromMarkdown(memoryMd);
    return Array.from(blocks.values());
  } catch {
    return null;
  }
}

/**
 * 加载角色上下文。
 *
 * @param agentDir 角色工作目录（data/agents/{id}/）
 * @returns RoleContext 对象，若 Agent.md 不存在则返回 null
 */
export async function loadRoleContext(agentDir: string): Promise<RoleContext | null> {
  const agentMd = readMdFile(agentDir, 'Agent.md');
  if (!agentMd) return null;

  const roleMd = readMdFile(agentDir, 'Role.md');
  const tasteMd = readMdFile(agentDir, 'Taste.md');
  const memoryMd = readMdFile(agentDir, 'Memory.md');
  const toolMd = readMdFile(agentDir, 'Tool.md');
  const knowledgeMd = readMdFile(agentDir, 'Knowledge.md');
  const patternsMd = readMdFile(agentDir, 'Patterns.md');

  const { allowedTools } = parseToolMdTools(toolMd);
  const installedSkills = scanInstalledSkills(agentDir);
  const currentPhase = extractCurrentPhase(roleMd);

  // C.9: 解析 Memory Blocks
  const memoryBlocks = parseMemoryBlocks(memoryMd);

  return {
    agentMd,
    roleMd,
    tasteMd,
    memoryMd,
    toolMd,
    knowledgeMd,
    patternsMd,
    memoryBlocks,
    currentPhase,
    installedSkills,
    allowedTools,
    agentBaseDir: agentDir,
  };
}
