/**
 * Persistent Agent - 持久化 Agent 实例
 *
 * Agent 启动时从项目目录读取配置文件（Agent.md, Tool.md, Skill.md）
 * 参考 OpenClaw 的 bootstrap 文件加载机制，自主理解能力和职责
 * 不依赖前端传入 systemPrompt
 */

import { OriginOSAgent, createOriginOSAgent } from './core/agent';
import { getAgentTools, initializeBuiltInTools } from './tools/index';
import { setToolContext, removeToolContext, getToolContextManager } from './tools/context';
import { bindToolsToSession } from './tools/bind-session';
import { agentSessionService } from '../../../lib/features/agent/session-service';
import { CognitiveManager } from './cognitive';
import { detectCorrections } from './cognitive/pattern/correction-detector';
import { SleepComputeScheduler } from './cognitive/sleep-compute';
import { createRuntimeModel } from './server-config';
import type { RuntimeLLMConfig } from './llm-config';
import type { AgentTool } from '@originos/pi-agent-adapter';
import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// 工作空间文件加载（OpenClaw bootstrap 风格）
// ============================================================================

/**
 * 工作空间上下文文件
 */
export interface WorkspaceContextFile {
  name: string;   // 文件名（如 Agent.md）
  path: string;   // 相对于项目目录的路径
  content: string; // 文件内容
}

/**
 * 不需要加载的工作空间文件（排除列表）
 * 对应 OpenClaw 中排除的 bootstrap.md, user.md, HEARTBEAT.md
 */
const EXCLUDED_WORKSPACE_FILES = new Set([
  'bootstrap.md',
  'user.md',
  'HEARTBEAT.md',
]);

/**
 * 从项目目录加载工作空间 .md 文件
 * 对应 OpenClaw 的 loadWorkspaceBootstrapFiles()
 *
 * 加载顺序（优先级）：
 * - Agent.md     - Agent 身份和能力定义
 * - Tool.md      - 工具使用指南
 * - Skill.md     - 技能定义（如存在）
 * - taste.md     - 品味工程文件（新增）
 * - SOUL.md      - 人格和风格定义
 * - MEMORY.md    - 长期记忆
 * - IDENTITY.md  - 身份标识
 * - 其他 .md 文件（根目录下）
 */
export async function loadWorkspaceFiles(projectDir: string): Promise<WorkspaceContextFile[]> {
  const files: WorkspaceContextFile[] = [];

  // 优先加载的文件（按顺序）
  const priorityFiles = [
    'Agent.md',
    'Tool.md',
    'Skill.md',
    'taste.md',
    'SOUL.md',
    'MEMORY.md',
    'IDENTITY.md',
  ];

  // 首先加载优先级文件
  for (const fileName of priorityFiles) {
    if (EXCLUDED_WORKSPACE_FILES.has(fileName)) continue;
    const filePath = path.join(projectDir, fileName);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.trim()) {
        files.push({ name: fileName, path: fileName, content });
      }
    } catch {
      // 文件不存在，跳过
    }
  }

  // 然后加载其他根目录下的 .md 文件（非优先级、非排除）
  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md') && !entry.name.endsWith('.MD')) continue;
      if (EXCLUDED_WORKSPACE_FILES.has(entry.name)) continue;
      if (priorityFiles.includes(entry.name)) continue; // 已加载
      if (files.some(f => f.name === entry.name)) continue; // 防重复

      try {
        const filePath = path.join(projectDir, entry.name);
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.trim()) {
          files.push({ name: entry.name, path: entry.name, content });
        }
      } catch {
        // 跳过无法读取的文件
      }
    }
  } catch {
    // 目录读取失败，仅使用优先级文件
  }

  return files;
}

/**
 * 将工作空间文件注入为 system prompt 的 "Project Context" 部分
 * 对应 OpenClaw 的 buildAgentSystemPrompt() 中的 contextFiles 处理
 *
 * 格式：
 * # Project Context
 *
 * ## Agent.md
 *
 * <Agent.md content>
 *
 * ## taste.md
 *
 * <taste.md content>
 * ...
 */
export function buildProjectContextSection(files: WorkspaceContextFile[]): string {
  if (files.length === 0) return '';

  const lines: string[] = [
    '# Project Context',
    '',
    '以下工作空间文件已加载。请遵循其中的定义和指导：',
  ];

  // 检查是否有 SOUL.md 或 taste.md（类似 OpenClaw 的 SOUL.md 特殊处理）
  const hasSoulFile = files.some(f => f.name.toLowerCase() === 'soul.md');
  const hasTasteFile = files.some(f => f.name.toLowerCase() === 'taste.md');

  if (hasSoulFile || hasTasteFile) {
    lines.push('如果存在 SOUL.md 或 taste.md，请体现其人格风格，避免刻板回复，遵循其指导（除非更高优先级的指令覆盖）。');
  }

  lines.push('');

  for (const file of files) {
    lines.push(`## ${file.path}`, '', file.content, '');
  }

  return lines.join('\n');
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Agent 定义（从 Agent.md 解析）
 */
export interface AgentDefinition {
	agentId: string;
	agentType: string;
	version: string;
	name: string;
	content: string; // 完整的 markdown 内容
}

/**
 * 工具定义（从 Tool.md 解析）
 */
export interface ToolDefinition {
	toolsVersion: string;
	allowedTools: string[]; // 允许的工具名称列表
	content: string;
}

/**
 * 技能定义（从 Skill.md 或 skills/ 目录解析）
 */
export interface SkillDefinition {
	skills: Array<{
		name: string;
		content: string;
	}>;
	content?: string; // 如果是单个 Skill.md
}

/**
 * Persistent Agent 配置
 */
export interface PersistentAgentConfig {
	projectId: string;
	workingDirectory: string;
	agentDefinition: AgentDefinition;
	toolDefinition: ToolDefinition;
	skillDefinition: SkillDefinition;
	workspaceFiles?: WorkspaceContextFile[];
	builtSystemPrompt?: string;
	cognitiveManager?: CognitiveManager;
	sleepScheduler?: SleepComputeScheduler;
	completionGuardEnabled?: boolean;
}

/**
 * Agent 状态
 */
export interface AgentStatus {
	projectId: string;
	isRunning: boolean;
	agentType: string;
	version: string;
	startedAt: number;
}

// ============================================================================
// Persistent Agent 类
// ============================================================================

/**
 * 持久化 Agent 实例
 *
 * 特点：
 * - 启动时读取项目目录下的 Agent.md, Tool.md, Skill.md
 * - 自主理解能力和职责
 * - 支持热重载（修改配置文件后重新加载）
 * - 独立运行，不依赖前端传入配置
 */
export class PersistentAgent {
	private agent: OriginOSAgent | null = null;
	private projectId: string;
	private workingDirectory: string;
	private agentDefinition: AgentDefinition;
	private toolDefinition: ToolDefinition;
	private skillDefinition: SkillDefinition;
	private workspaceFiles: WorkspaceContextFile[];
	private builtSystemPrompt?: string;
	private cognitiveManager?: CognitiveManager;
	private sleepScheduler?: SleepComputeScheduler;
	private completionGuardEnabled: boolean;
	private isRunning = false;
	private startedAt = 0;
	private turnCounter = 0;
	private turnArgs = new Map<string, unknown>();
	private processingPromise: Promise<void> | null = null;

	constructor(config: PersistentAgentConfig) {
		this.projectId = config.projectId;
		this.workingDirectory = config.workingDirectory;
		this.agentDefinition = config.agentDefinition;
		this.toolDefinition = config.toolDefinition;
		this.skillDefinition = config.skillDefinition;
		this.workspaceFiles = config.workspaceFiles ?? [];
		this.builtSystemPrompt = config.builtSystemPrompt;
		this.cognitiveManager = config.cognitiveManager;
		this.sleepScheduler = config.sleepScheduler;
		this.completionGuardEnabled = config.completionGuardEnabled ?? true;
	}

	/**
	 * 初始化 Agent
	 */
	async initialize(llmConfig?: {
		provider?: string;
		baseUrl?: string;
		apiKey?: string;
		model?: string;
		maxTokens?: number;
	}): Promise<void> {
		if (this.isRunning) {
			console.warn(`[PersistentAgent] Agent already running for project: ${this.projectId}`);
			return;
		}

		console.log(`[PersistentAgent] Initializing agent for project: ${this.projectId}`);

		// 1. 构建 system prompt（优先使用 7 层体系，否则回退旧逻辑）
		const systemPrompt = this.builtSystemPrompt ?? this.buildSystemPrompt();

		// 2. 创建 Agent 实例
		this.agent = await createOriginOSAgent({
			sessionId: `persistent-${this.projectId}`,
			systemPrompt,
			variables: {
				projectId: this.projectId,
				projectName: this.agentDefinition.name,
			},
			llmConfig,
			completionGuardEnabled: this.completionGuardEnabled,
		});

		// 3. 注册工具（从 Tool.md）
		const persistentSessionId = `persistent-${this.projectId}`;
		const tools = bindToolsToSession(this.buildTools(), persistentSessionId);
		this.agent.setTools(tools as AgentTool<any>[]);

		// 4. 设置工具上下文
		const context = {
			workingDirectory: this.workingDirectory,
			sessionId: persistentSessionId,
		};
		setToolContext(persistentSessionId, context);
		getToolContextManager().setDefaultContext(context);

		// 5. 创建持久化 session 记录
		try {
			await agentSessionService.createSession({
				sessionId: persistentSessionId,
				projectId: this.projectId,
				projectName: this.agentDefinition.name,
				systemPrompt,
				agentType: this.agentDefinition.agentType,
			});
		} catch (err) {
			console.warn('[PersistentAgent] Failed to create session record:', err);
		}

		// 6. 订阅 agent 事件（agent_end 保存对话 + cognitive hooks）
		this.agent.subscribe(async (event: any) => {
			// 追踪 tool args（tool_execution_start 是唯一携带参数的地方）
			if (event.type === 'tool_execution_start') {
				this.turnArgs.set(event.toolCallId, event.args ?? {});
			}

			if (event.type === 'agent_end' && event.messages?.length > 0) {
				try {
					await agentSessionService.updateSession(persistentSessionId, {
						messages: event.messages,
						status: 'completed',
					}, this.projectId);
				} catch (err) {
					console.warn('[PersistentAgent] Failed to save session messages:', err);
				}
			}

			// cognitive: turn_end 事件处理
			if (event.type === 'turn_end') {
				const toolResults = event.toolResults ?? [];
				const messages = event.messages ?? [];
				const lastUser = findLastMessage(messages, 'user');
				const lastAssistant = findLastMessage(messages, 'assistant');
				const lastThinking = findLastThinking(messages);

				let anyError = false;
				const toolCalls = toolResults.map((tr: any) => {
					const args = this.turnArgs.get(tr.toolCallId) ?? {};
					this.turnArgs.delete(tr.toolCallId);
					const content = Array.isArray(tr.content)
						? tr.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
						: String(tr.content ?? '');
					if (tr.isError) anyError = true;
					return {
						name: tr.toolName ?? 'unknown',
						params: args,
						result: content,
						success: !tr.isError,
					};
				});

				this.cognitiveManager?.on_turn_end({
					turnNumber: ++this.turnCounter,
					userMessage: lastUser ?? '',
					assistantMessage: lastAssistant ?? '',
					assistantThinking: lastThinking,
					toolCalls,
					outcome: {
						resolved: !anyError,
						toolChainLength: toolResults.length,
						userCorrections: detectCorrections(lastUser ?? '').length || undefined,
					},
					timestamp: Date.now(),
				});
			}

			// cognitive: agent_end 事件处理
			if (event.type === 'agent_end' && event.messages?.length > 0) {
				this.cognitiveManager?.on_session_end(event.messages);
			}

			// sleep-compute: 会话结束时取出待执行的睡眠任务
			if (event.type === 'agent_end' && this.sleepScheduler) {
				const pendingTasks = this.sleepScheduler.executePendingForSessionEnd();
				if (pendingTasks.length > 0) {
					this.cognitiveManager?.on_sleep_tasks(pendingTasks);
				}
			}
		});

		this.isRunning = true;
		this.startedAt = Date.now();

		console.log(`[PersistentAgent] Agent initialized successfully`);
		console.log(`[PersistentAgent] - Agent Type: ${this.agentDefinition.agentType}`);
		console.log(`[PersistentAgent] - Version: ${this.agentDefinition.version}`);
		console.log(`[PersistentAgent] - Allowed Tools: ${this.toolDefinition.allowedTools.length || 'all'}`);
	}

	/**
	 * 应用用户运行时 LLM 配置，不重启 Agent。
	 */
	applyLLMConfig(llmConfig: RuntimeLLMConfig): void {
		if (!this.agent) {
			throw new Error('Agent is not initialized');
		}
		const model = createRuntimeModel(llmConfig);
		console.log(`[PersistentAgent] Applying llmConfig for project ${this.projectId}: ${model.id}`);
		this.agent.setModel(model);
	}

	/**
	 * 处理消息
	 */
	async handleMessage(message: string, _sessionId?: string): Promise<void> {
		if (!this.isRunning || !this.agent) {
			throw new Error('Agent is not running');
		}

		let resolve!: () => void;
		this.processingPromise = new Promise<void>(r => { resolve = r; });

		try {
			await this.agent.prompt(message);
			console.log(`[PersistentAgent] prompt() completed successfully`);
		} catch (err) {
			console.error(`[PersistentAgent] prompt() threw error:`, err);
			throw err;
		} finally {
			this.processingPromise = null;
			resolve();
		}
	}

	/**
	 * 订阅 Agent 事件
	 */
	subscribe(listener: (event: any) => void): () => void {
		if (!this.agent) {
			throw new Error('Agent is not initialized');
		}
		return this.agent.subscribe(listener);
	}

	/**
	 * 获取 Agent 实例（用于直接操作）
	 */
	getAgent(): OriginOSAgent | null {
		return this.agent;
	}

	/**
	 * 中断当前消息处理
	 */
	abort(): void {
		if (this.agent) {
			console.log(`[PersistentAgent] Aborting current operation for project: ${this.projectId}`);
			this.agent.abort();
		}
	}

	/**
	 * 关闭 Agent
	 */
	async shutdown(): Promise<void> {
		if (!this.isRunning) {
			return;
		}

		console.log(`[PersistentAgent] Shutting down agent for project: ${this.projectId}`);

		// 等待 in-flight 消息处理完成，避免 destroy 中断流式输出
		if (this.processingPromise) {
			console.log(`[PersistentAgent] Waiting for in-flight message to complete...`);
			try {
				await Promise.race([
					this.processingPromise,
					new Promise<void>(r => setTimeout(r, 10_000)), // 最多等 10 秒
				]);
			} catch {
				// 忽略等待期间的错误
			}
		}

		if (this.agent) {
			this.agent.destroy();
			this.agent = null;
		}

		const persistentSessionId = `persistent-${this.projectId}`;
		removeToolContext(persistentSessionId);
		// 不清空 defaultContext — 避免 in-flight 工具调用丢失 workingDirectory
		// AgentManager 会在下次 getOrCreateAgent 时刷新 defaultContext
		this.isRunning = false;

		console.log(`[PersistentAgent] Agent shutdown complete`);
	}

	/**
	 * 热重载配置（当 Agent.md/Tool.md/Skill.md 修改时）
	 */
	async reload(
		agentDef?: AgentDefinition,
		toolDef?: ToolDefinition,
		skillDef?: SkillDefinition,
		workspaceFiles?: WorkspaceContextFile[],
		builtSystemPrompt?: string,
	): Promise<void> {
		console.log(`[PersistentAgent] Reloading configuration for project: ${this.projectId}`);

		// 更新配置
		if (agentDef) this.agentDefinition = agentDef;
		if (toolDef) this.toolDefinition = toolDef;
		if (skillDef) this.skillDefinition = skillDef;
		if (workspaceFiles) this.workspaceFiles = workspaceFiles;
		if (builtSystemPrompt !== undefined) this.builtSystemPrompt = builtSystemPrompt;

		if (!this.agent) {
			throw new Error('Agent is not initialized');
		}

		// 重新构建 system prompt 和工具
		const systemPrompt = this.builtSystemPrompt ?? this.buildSystemPrompt();
		this.agent.setSystemPrompt(systemPrompt);

		const tools = bindToolsToSession(this.buildTools(), `persistent-${this.projectId}`);
		this.agent.setTools(tools as AgentTool<any>[]);

		console.log(`[PersistentAgent] Configuration reloaded successfully`);
	}

	/**
	 * 获取 Agent 状态
	 */
	getStatus(): AgentStatus {
		return {
			projectId: this.projectId,
			isRunning: this.isRunning,
			agentType: this.agentDefinition.agentType,
			version: this.agentDefinition.version,
			startedAt: this.startedAt,
		};
	}

	// ========================================================================
	// 私有方法
	// ========================================================================

	/**
	 * 从工作空间文件构建 system prompt（OpenClaw 风格）
	 *
	 * 结构：
	 * 1. 基础身份行
	 * 2. 工作目录
	 * 3. # Project Context（注入工作空间文件，含 Agent.md, taste.md, SOUL.md 等）
	 *
	 * 如果没有工作空间文件，则回退到旧的结构化格式
	 */
	private buildSystemPrompt(): string {
		// 如果有工作空间文件，使用 OpenClaw 风格的注入
		if (this.workspaceFiles.length > 0) {
			const lines: string[] = [];

			// 基础身份行
			lines.push('You are an AI assistant running inside OriginOS.');
			lines.push('');

			// 工作目录
			lines.push('## Workspace');
			lines.push(`Your working directory is: ${this.workingDirectory}`);
			lines.push('Treat this directory as the workspace for all file operations.');
			lines.push('');

			// Tool 使用规范
			lines.push('## Tool Execution Rules');
			lines.push('You have access to tools that can perform actions on behalf of the user.');
			lines.push('');
			lines.push('IMPORTANT: When you decide to use a tool, call it directly without asking the user for confirmation.');
			lines.push('The system automatically handles tool execution. Do NOT pause to ask "Do you want me to..." or "Should I..." before calling a tool.');
			lines.push('');
			lines.push('Examples:');
			lines.push('- GOOD: User says "save the model" → Immediately call write_file to save it.');
			lines.push('- BAD: User says "save the model" → Ask "Would you like me to save it?" → Wait for confirmation → Then save.');
			lines.push('');
			lines.push('Only ask the user for input when you need information you don\'t already have, not for tool execution approval.');
			lines.push('');

			// 注入工作空间文件（OpenClaw 风格的 Project Context）
			const contextSection = buildProjectContextSection(this.workspaceFiles);
			if (contextSection) {
				lines.push(contextSection);
			}

			// 技能定义（如果不在工作空间文件中）
			const hasSkillInWorkspace = this.workspaceFiles.some(f =>
				f.name === 'Skill.md' || f.name === 'SKILL.md'
			);
			if (!hasSkillInWorkspace) {
				if (this.skillDefinition.content) {
					lines.push('## Skill', '', this.skillDefinition.content, '');
				} else if (this.skillDefinition.skills.length > 0) {
					lines.push('## Skills', '');
					for (const skill of this.skillDefinition.skills) {
						lines.push(`### ${skill.name}`, '', skill.content, '');
					}
				}
			}

			return lines.join('\n');
		}

		// 回退：旧的结构化格式（无工作空间文件时）
		let prompt = '';

		// Tool 使用规范
		prompt += `# Tool Execution Rules\n\n`;
		prompt += `IMPORTANT: When you decide to use a tool, call it directly without asking the user for confirmation.\n`;
		prompt += `The system automatically handles tool execution. Do NOT pause to ask "Do you want me to..." or "Should I..." before calling a tool.\n`;
		prompt += `Only ask the user for input when you need information you don't already have, not for tool execution approval.\n\n`;

		// Agent 身份定义
		if (this.agentDefinition.content) {
			prompt += `# AGENT DEFINITION\n\n${this.agentDefinition.content}\n\n`;
		}

		// 技能定义
		if (this.skillDefinition.content) {
			// 单个 Skill.md
			prompt += `# SKILL\n\n${this.skillDefinition.content}\n\n`;
		} else if (this.skillDefinition.skills.length > 0) {
			// 多个技能
			prompt += `# SKILLS\n\n`;
			for (const skill of this.skillDefinition.skills) {
				prompt += `## ${skill.name}\n\n${skill.content}\n\n`;
			}
		}

		// 添加工作目录信息
		prompt += `# WORKING DIRECTORY\n\n`;
		prompt += `Your working directory is: ${this.workingDirectory}\n`;
		prompt += `All file operations are relative to this directory.\n\n`;

		return prompt;
	}

	/**
	 * 从 Tool.md 构建工具列表
	 */
	private buildTools(): AgentTool[] {
		// 防御性调用：确保内置工具已注册（避免时序问题）
		initializeBuiltInTools();

		// 1. 获取所有内置工具
		const builtInTools = getAgentTools();

		// 2. 根据 Tool.md 过滤允许的工具
		const allowedToolNames = this.toolDefinition.allowedTools || [];

		if (allowedToolNames.length === 0) {
			// 如果没有指定，允许所有工具
			console.log(`[PersistentAgent] Using all built-in tools (${builtInTools.length} tools)`);
			return builtInTools;
		}

		// 只返回允许的工具
		const filteredTools = builtInTools.filter(tool =>
			allowedToolNames.includes(tool.name)
		);

		console.log(`[PersistentAgent] Using ${filteredTools.length} allowed tools: ${allowedToolNames.join(', ')}`);
		return filteredTools;
	}
}

// ============================================================================
// 工具函数：解析配置文件
// ============================================================================

/**
 * 从消息数组中查找最后一个指定角色的消息
 */
function findLastMessage(messages: any[], role: string): string {
	let last = '';
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === role) {
			if (typeof msg.content === 'string') {
				last = msg.content;
			} else if (Array.isArray(msg.content)) {
				last = msg.content
					.filter((c: any) => c.type === 'text' && c.text)
					.map((c: any) => c.text)
					.join(' ');
			}
			break;
		}
	}
	return last;
}

function findLastThinking(messages: any[]): string {
	let last = '';
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === 'assistant') {
			if (Array.isArray(msg.content)) {
				last = msg.content
					.filter((c: any) => c.type === 'thinking' && c.thinking)
					.map((c: any) => c.thinking)
					.join(' ');
			}
			break;
		}
	}
	return last;
}

/**
 * 解析 Agent.md 文件
 */
export function parseAgentDefinition(content: string): AgentDefinition {
	// 解析 YAML frontmatter
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

	let agentId = 'unknown';
	let agentType = 'generic';
	let version = '1.0.0';
	let name = 'Agent';

	if (frontmatterMatch?.[1]) {
		const frontmatter = frontmatterMatch[1];

		const agentIdMatch = frontmatter.match(/^agentId:\s*(.+)$/m);
		if (agentIdMatch?.[1]) agentId = agentIdMatch[1].trim();

		const agentTypeMatch = frontmatter.match(/^agentType:\s*(.+)$/m);
		if (agentTypeMatch?.[1]) agentType = agentTypeMatch[1].trim();

		const versionMatch = frontmatter.match(/^version:\s*(.+)$/m);
		if (versionMatch?.[1]) version = versionMatch[1].trim();

		const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
		if (nameMatch?.[1]) name = nameMatch[1].trim();
	}

	return {
		agentId,
		agentType,
		version,
		name,
		content,
	};
}

/**
 * 解析 Tool.md 文件
 */
export function parseToolDefinition(content: string): ToolDefinition {
	// 解析 YAML frontmatter
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

	let toolsVersion = '1.0.0';
	const allowedTools: string[] = [];

	if (frontmatterMatch?.[1]) {
		const frontmatter = frontmatterMatch[1];

		const versionMatch = frontmatter.match(/^toolsVersion:\s*(.+)$/m);
		if (versionMatch?.[1]) toolsVersion = versionMatch[1].trim();

		// 解析 allowedTools 列表
		const allowedToolsMatch = frontmatter.match(/^allowedTools:\s*\[(.*?)\]$/m);
		if (allowedToolsMatch?.[1]) {
			const toolsList = allowedToolsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
			allowedTools.push(...toolsList);
		}
	}

	// 如果 frontmatter 中没有 allowedTools，尝试从内容中提取
	if (allowedTools.length === 0) {
		// 匹配 markdown 列表中的工具名称
		// 例如：- write_file - 写入文件
		const toolMatches = content.matchAll(/^-\s+(\w+)\s+-/gm);
		for (const match of toolMatches) {
			const toolName = match[1];
			if (toolName) {
				allowedTools.push(toolName);
			}
		}
	}

	return {
		toolsVersion,
		allowedTools,
		content,
	};
}

/**
 * 解析 Skill.md 或 skills/ 目录
 */
export async function parseSkillDefinition(
	projectDir: string
): Promise<SkillDefinition> {
	// 优先读取 Skill.md
	const skillFilePath = path.join(projectDir, 'Skill.md');
	try {
		const content = await fs.readFile(skillFilePath, 'utf-8');
		return {
			skills: [],
			content,
		};
	} catch (error) {
		// Skill.md 不存在，尝试读取 skills/ 目录
	}

	// 读取 skills/ 目录
	const skillsDir = path.join(projectDir, 'skills');
	try {
		const entries = await fs.readdir(skillsDir, { withFileTypes: true });
		const skills: Array<{ name: string; content: string }> = [];

		for (const entry of entries) {
			if (entry.isDirectory()) {
				const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
				try {
					const content = await fs.readFile(skillMdPath, 'utf-8');
					skills.push({
						name: entry.name,
						content,
					});
				} catch (error) {
					console.warn(`[parseSkillDefinition] Failed to read ${skillMdPath}:`, error);
				}
			}
		}

		return { skills };
	} catch (error) {
		console.warn(`[parseSkillDefinition] No skills found in ${projectDir}`);
		return { skills: [] };
	}
}
