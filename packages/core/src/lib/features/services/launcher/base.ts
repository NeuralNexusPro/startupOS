/**
 * Launcher 基类与通用接口
 *
 * 定义 4 种入口类型的统一启动协议：
 * - Project: 带本体知识图谱的知识来源
 * - Agent (Assistant): 消化本体后内化为指令的智能体
 * - Role Agent: 具有专业角色背景和生命周期的智能体
 * - Skill: 符合 Anthropic Agent Skills 标准的可复用工作流
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { agentSessionService } from '../../../../lib/features/agent';
import {
  agentManager,
  type AgentMemoryOwnership,
} from '../../../../lib/integrations/pi-agent/agent-manager';
import { loadToolConfig } from '../../../../lib/integrations/pi-agent/tool-config-loader';
import type { RuntimeLLMConfig } from '../../../../lib/integrations/pi-agent/llm-config';
import { toStableMemoryExcerpt } from '../../../../lib/integrations/pi-agent/memory-consumption';
import { appendGlobalUserPreferencesPrompt } from '../../../../lib/integrations/pi-agent/user-preferences';
import type { CreateSessionRequest } from '../../../../types/agent';
import type { ObservationContext } from '../../../../modules/memory-core';

// ============ 通用接口 ============

export type EntryType = 'project' | 'agent' | 'role-agent' | 'skill';

// ============ Agent 权限授权提示词 ============

/**
 * Agent 权限授权段落
 *
 * 注入到所有 Agent（Assistant、RoleAgent）的系统提示词中，解决 LLM
 * 因缺乏权限声明而误认为自己在沙箱中、无法访问外网的问题。
 * 内容应与 SkillDialog 中的 buildSkillSystemPrompt 保持一致。
 */
export const AGENT_PERMISSION_PROMPT = `
## Tool Execution Rules

You have access to built-in tools that can perform actions on behalf of the user.

IMPORTANT: When you decide to use a tool, call it directly without asking the user for confirmation.
The system automatically handles tool execution. Do NOT pause to ask "Do you want me to..." or "Should I..." before calling a tool.

Examples:
- GOOD: User says "save the model" → Immediately call write_file to save it.
- BAD: User says "save the model" → Ask "Would you like me to save it?" → Wait for confirmation → Then save.

Only ask the user for input when you need information you don't already have, not for tool execution approval.

## Network Access

You are explicitly authorized to make HTTP/HTTPS requests to external services using the execute_command tool.
Network access to any external service is allowed for fulfilling requirements, including:
- Fetching data from external APIs
- Downloading files from URLs
- Web scraping and content extraction from any domain
Do NOT warn the user about external network access — it is a granted capability.

## User Communication Rules

Never expose internal implementation details to the user.
Do NOT mention file paths, directory paths, or internal technical concepts in your responses.
Focus on what you are doing and the results, not how it is implemented internally.
`;

/**
 * 构建 Agent 系统提示词，注入权限授权段落
 */
export function buildAgentSystemPrompt(
  baseContent: string,
  options?: {
    memory?: string;
    knowledge?: string;
    patterns?: string;
    role?: string;
    taste?: string;
    baseDir?: string;
  },
): string {
  const lines: string[] = [];

  // 基础内容（Agent.md）
  if (baseContent) {
    lines.push(baseContent);
  }

  // 注入角色状态
  if (options?.role) {
    lines.push('\n## 角色状态\n\n' + options.role);
  }

  // 注入历史记忆
  if (options?.memory) {
    lines.push('\n## Long-term Stable Memory\n\n' + toStableMemoryExcerpt(options.memory, 4000));
  }

  if (options?.knowledge) {
    lines.push('\n## Knowledge Base Snapshot\n\n' + options.knowledge);
  }

  if (options?.patterns) {
    lines.push('\n## Experience Patterns Snapshot\n\n' + options.patterns);
  }

  // 注入风格偏好
  if (options?.taste) {
    lines.push('\n## 风格偏好\n\n' + options.taste);
  }

  // 注入工作目录
  if (options?.baseDir) {
    lines.push('\n## Working Directory\n\nYour working directory is: ' + options.baseDir);
    lines.push('');
    lines.push('IMPORTANT: All file paths in your operations are relative to this working directory. When a file path like "data/agents/xxx/Tool.md" appears, resolve it relative to your working directory. You should use relative file names (e.g., "Tool.md", "Agent.md") rather than full directory paths, since you are already in your working directory.');
    lines.push('');
  }

  // 注入权限授权
  lines.push(AGENT_PERMISSION_PROMPT);

  return appendGlobalUserPreferencesPrompt(lines.join('\n'));
}

export interface LaunchContext {
  /** 入口唯一标识（agent id, project id, skill code 等） */
  entryId: string;
  /** 入口类型 */
  entryType: EntryType;
  /** 会话 ID（可选，不传则自动生成） */
  sessionId?: string;
  /** 前端传入的可选会话 ID（用于恢复已有会话） */
  restoreSessionId?: string;
  /** 覆盖默认的 agentBaseDir（如 skill 运行在项目目录下） */
  agentBaseDir?: string;
  /** 覆盖默认的 projectId（如 skill 运行在项目上下文中） */
  projectId?: string;
  /** 是否绑定窗口生命周期（窗口关闭时销毁 agent，不参与 idle cleanup） */
  isWindowBound?: boolean;
  /** 用户配置的 LLM 参数（覆盖环境变量默认值） */
  llmConfig?: RuntimeLLMConfig;
  /** 当前用户的稳定标识；未提供时使用本地单用户默认值。 */
  userId?: string;
  /** 仅由调用方显式传递；Skill 不得从工作目录或 projectId 猜测认知归属。 */
  cognitionOwner?: { kind: 'project' | 'role-agent'; id: string };
}

export interface LaunchResult {
  success: boolean;
  sessionId: string;
  systemPrompt: string;
  agentType: string;
  baseDir: string;
  tools?: string[];
  error?: string;
}

/**
 * Launcher 抽象基类
 * 每种入口类型实现自己的加载和启动逻辑
 */
export abstract class Launcher {
  abstract readonly entryType: EntryType;

  /**
   * 启动入口：读取配置 → 构建提示词 → 创建/恢复会话 → 注册 Agent
   */
  abstract launch(ctx: LaunchContext): Promise<LaunchResult>;

  /**
   * 读取入口内容（Agent.md, SKILL.md, 本体文件等）
   * 返回 key-value 对，key 为文件名（不含扩展名），value 为文件内容
   */
  abstract loadEntryContent(id: string): Promise<Record<string, string>>;

  /**
   * 通用：读取指定目录下的 .md 文件
   */
  protected readMdFile(dir: string, fileName: string): string | null {
    const filePath = path.join(dir, fileName);
    if (!existsSync(filePath)) return null;
    try {
      return readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 通用：创建或恢复会话
   * 自动注入 projectContext.currentPath = agentBaseDir，确保工具工作目录统一由创建方管理
   */
  protected async createOrRestoreSession(
    params: CreateSessionRequest & { agentType: string; agentBaseDir?: string; llmConfig?: LaunchContext['llmConfig'] },
  ): Promise<{ sessionId: string; isNew: boolean }> {
    // 自动设置工作目录，确保工具使用正确的当前路径
    if (params.agentBaseDir) {
      params.projectContext = {
        ...params.projectContext,
        currentPath: params.agentBaseDir,
      };
    }

    // 如果提供了 restoreSessionId，尝试恢复
    if (params.sessionId) {
      const existing = await agentSessionService.getSession(
        params.sessionId,
        params.projectId,
      );
      if (existing) {
        return { sessionId: existing.sessionId, isNew: false };
      }
    }

    const session = await agentSessionService.createSession(params);
    return { sessionId: session.sessionId, isNew: true };
  }

  /**
   * 通用：注册 Agent 实例到 AgentManager
   */
  protected async registerAgent(
    sessionId: string,
    projectId: string,
    options: {
      systemPrompt?: string;
      agentType?: string;
      agentBaseDir?: string;
      isWindowBound?: boolean;
      llmConfig?: LaunchContext['llmConfig'];
      memoryOwnership?: AgentMemoryOwnership;
      observationContext?: ObservationContext;
    },
  ): Promise<string[]> {
    await agentManager.getOrCreateAgent(sessionId, projectId, {
      systemPrompt: options.systemPrompt,
      agentType: options.agentType,
      agentBaseDir: options.agentBaseDir,
      isWindowBound: options.isWindowBound,
      llmConfig: options.llmConfig,
      memoryOwnership: options.memoryOwnership,
      observationContext: options.observationContext,
    });

    // Agent is created with tools already registered via AgentManager.getOrCreateAgent
    // Tools are filtered by Tool.md config inside the AgentManager
    return [];
  }

  /**
   * 通用：加载 Tool.md 并获取已启用的工具列表
   */
  protected getEnabledToolNames(baseDir: string): string[] {
    const config = loadToolConfig(baseDir);
    if (!config?.disabledTools?.length) return [];
    return config.disabledTools;
  }
}
