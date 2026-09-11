/**
 * 项目上下文加载器
 *
 * 在项目 Agent 启动时加载完整上下文（.md 文件 + 已安装技能）
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { scanInstalledSkills, type SkillInfo } from '../role-agent/skill-resolver';
import type { MemoryBlock } from '../../../../lib/integrations/pi-agent/cognitive/types';
import { parseBlocksFromMarkdown } from '../../../../modules/memory-core';

export { type SkillInfo };

/** 项目上下文 */
export interface ProjectContext {
  /** Agent.md 全文（角色身份） */
  agentMd: string;
  /** Tool.md 全文（工具配置） */
  toolMd: string | null;
  /** Taste.md 全文（风格指南） */
  tasteMd: string | null;
  /** Memory.md 全文（历史记忆） */
  memoryMd: string | null;
  /** Knowledge.md 全文（知识库索引快照） */
  knowledgeMd: string | null;
  /** Patterns.md 全文（经验模式索引快照） */
  patternsMd: string | null;
  /** Memory Blocks（C.9 三元记忆 Core） */
  memoryBlocks: MemoryBlock[] | null;
  /** 已安装技能列表 */
  installedSkills: SkillInfo[];
  /** Tool.md frontmatter 中的 allowedTools */
  allowedTools: string[];
  /** 项目工作目录 */
  workingDirectory: string;
  /** 项目 ID */
  projectId: string;
  /** Agent ID */
  agentId: string;
  /** OriginOS 业务项目 ID（ proj-{id} ），用于区分业务项目和本体中的"项目"概念 */
  originosProjectId: string | null;
}

/** 安全读取 .md 文件 */
function readMdFile(dir: string, fileName: string): string | null {
  const filePath = path.join(dir, fileName);
  if (!existsSync(filePath)) return null;
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** 兼容历史命名，优先读取 Memory Core 当前使用的 Memory.md */
function readProjectMemoryFile(dir: string): string | null {
  return readMdFile(dir, 'Memory.md') ?? readMdFile(dir, 'MEMORY.md');
}

/** 从 Tool.md frontmatter 提取 allowedTools */
function parseAllowedTools(toolMd: string | null): string[] {
  if (!toolMd) return [];
  const match = toolMd.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return [];
  const frontmatter = match[1];
  const keyMatch = frontmatter.match(/^allowedTools:\s*\[([^\]]*)\]/m);
  if (!keyMatch?.[1]) return [];
  return keyMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** 从 Memory.md 解析 Memory Blocks */
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
 * 加载项目上下文
 * @param projectDir 项目工作目录
 * @param projectId 项目 ID（可选）
 * @param agentId Agent ID（可选）
 * @returns ProjectContext，若 Agent.md 不存在则返回 null
 */
export async function loadProjectContext(projectDir: string, projectId?: string, agentId?: string): Promise<ProjectContext | null> {
  const agentMd = readMdFile(projectDir, 'Agent.md');
  if (!agentMd) return null;

  const toolMd = readMdFile(projectDir, 'Tool.md');
  const tasteMd = readMdFile(projectDir, 'Taste.md');
  const memoryMd = readProjectMemoryFile(projectDir);
  const knowledgeMd = readMdFile(projectDir, 'Knowledge.md');
  const patternsMd = readMdFile(projectDir, 'Patterns.md');

  const allowedTools = parseAllowedTools(toolMd);
  const installedSkills = scanInstalledSkills(projectDir);
  const memoryBlocks = parseMemoryBlocks(memoryMd);

  // 尝试从 project-collaboration-context.json 读取上下文信息
  let contextProjectId = projectId ?? null;
  let contextAgentId = agentId ?? null;
  let originosProjectId: string | null = null;

  const contextJsonPath = path.join(projectDir, 'project-collaboration-context.json');
  if (existsSync(contextJsonPath)) {
    try {
      const contextJson = JSON.parse(readFileSync(contextJsonPath, 'utf-8'));
      if (contextJson.projectId && !contextProjectId) {
        contextProjectId = contextJson.projectId;
      }
      if (contextJson.agentId && !contextAgentId) {
        contextAgentId = contextJson.agentId;
      }
      if (contextJson.originosProjectId) {
        originosProjectId = contextJson.originosProjectId;
      }
    } catch {
      // 忽略解析错误
    }
  }

  return {
    agentMd,
    toolMd,
    tasteMd,
    memoryMd,
    knowledgeMd,
    patternsMd,
    memoryBlocks,
    installedSkills,
    allowedTools,
    workingDirectory: projectDir,
    projectId: contextProjectId ?? '',
    agentId: contextAgentId ?? '',
    originosProjectId,
  };
}
