/**
 * Persistent Agent Manager - 管理多个项目的持久化 Agent
 *
 * 职责：
 * - 启动/停止项目 Agent
 * - 管理 Agent 生命周期
 * - 提供 Agent 状态查询
 * - 支持热重载
 */

import {
	PersistentAgent,
	parseAgentDefinition,
	parseToolDefinition,
	parseSkillDefinition,
	loadWorkspaceFiles,
	type AgentDefinition,
	type ToolDefinition,
	type AgentStatus,
} from './persistent-agent';
import { loadProjectContext } from './project-agent/project-context';
import { buildProjectPromptLayers, assembleProjectPrompt } from './project-agent/project-prompt';
import { provisionProjectSkills } from './project-agent/project-skill-provisioning';
import { initializeBuiltInTools } from './tools/index';
import { CognitiveManager, PracticeLogger, KnowledgeProvider, PatternProvider, KnowledgeIngest } from './cognitive';
import { MemoryCore, MemoryProvider, CoreMemoryTools, ArchivalMemoryTools } from '../../../modules/memory-core';
import fs from 'fs/promises';
import path from 'path';
import { getDataRoot } from '../../paths';
import type { RuntimeLLMConfig } from './llm-config';

// ============================================================================
// Persistent Agent Manager
// ============================================================================

/**
 * 持久化 Agent 管理器
 *
 * 单例模式，管理所有项目的 Agent 实例
 */
export class PersistentAgentManager {
	private agents = new Map<string, PersistentAgent>();
	private baseDir: string;

	constructor(baseDir?: string) {
		this.baseDir = baseDir || path.join(getDataRoot(), 'projects');
		// 确保内置工具已注册
		initializeBuiltInTools();
	}

	/**
	 * 启动项目 Agent
	 */
	async startAgent(projectId: string, llmConfig?: RuntimeLLMConfig): Promise<PersistentAgent> {
		console.log(`[Manager] ========== START AGENT: ${projectId} ==========`);
		const t0 = Date.now();
		let lastStepAt = t0;
		const logStep = (label: string): void => {
			const now = Date.now();
			console.log(`[Manager] ${label} in ${now - lastStepAt}ms (total ${now - t0}ms)`);
			lastStepAt = now;
		};

		// 1. 检查是否已启动
		if (this.agents.has(projectId)) {
			console.log(`[Manager] Agent already running for project: ${projectId}`);
			const existingAgent = this.agents.get(projectId)!;
			if (llmConfig) {
				existingAgent.applyLLMConfig(llmConfig);
			}
			return existingAgent;
		}

		// 2. 构建项目目录路径
		const projectDir = path.join(this.baseDir, projectId);
		console.log(`[Manager] Project dir: ${projectDir}`);

		// 3. 检查项目目录是否存在
		try {
			await fs.access(projectDir);
		} catch (error) {
			throw new Error(`Project directory not found: ${projectDir}`);
		}

		// 存量项目也必须在启动前幂等补齐访谈依赖技能。
		const provisionedSkills = await provisionProjectSkills(projectDir);
		const missingSkills = provisionedSkills.filter((result) => result.status === 'missing');
		if (missingSkills.length > 0) {
			throw new Error(`Bundled project skills not found: ${missingSkills.map((result) => result.skillName).join(', ')}`);
		}
		logStep('Step 3b project skills provisioned');

		// 4. 读取配置文件
		console.log(`[Manager] Step 4: Loading config files...`);
		const agentDef = await this.loadAgentDefinition(projectDir);
		console.log(`[Manager]   Agent: ${agentDef.name} (type=${agentDef.agentType}, version=${agentDef.version})`);
		const toolDef = await this.loadToolDefinition(projectDir);
		console.log(`[Manager]   Tools: ${toolDef.allowedTools.length > 0 ? toolDef.allowedTools.join(', ') : 'ALL'}`);
		const skillDef = await parseSkillDefinition(projectDir);
		console.log(`[Manager]   Skills: ${skillDef.content ? 'Skill.md' : skillDef.skills.length + ' skill(s)'}`);
		logStep('Step 4 config files loaded');

		// 4b. 加载工作空间文件（向后兼容）
		const workspaceFiles = await loadWorkspaceFiles(projectDir);
		console.log(`[Manager] Step 4b: Loaded ${workspaceFiles.length} workspace file(s): ${workspaceFiles.map(f => f.name).join(', ')}`);
		logStep('Step 4b workspace files loaded');

		// 4c. 加载 7 层项目上下文并构建 prompt
		const projectCtx = await loadProjectContext(projectDir, projectId, agentDef.agentId);
		let systemPrompt: string | undefined;
		if (projectCtx) {
			const layers = buildProjectPromptLayers(projectCtx);
			systemPrompt = assembleProjectPrompt(layers);
			console.log(`[Manager] Step 4c: Built 7-layer system prompt`);
		} else {
			console.warn(`[Manager] Step 4c: ProjectContext not loaded, falling back to workspace files`);
		}
		logStep('Step 4c project context loaded');

		// 4d. 创建认知管理器并注册 Providers
		const cognitiveManager = new CognitiveManager(projectDir);
		cognitiveManager.register(new PracticeLogger(projectDir));
		const knowledgeProvider = new KnowledgeProvider(projectDir);
		cognitiveManager.register(knowledgeProvider);

		// 4d2. 注册 Memory Core Provider（三层记忆）
		const memoryCore = new MemoryCore(projectDir, projectId);
		const memoryProvider = new MemoryProvider(memoryCore, projectId, knowledgeProvider);
		cognitiveManager.register(memoryProvider);

		// 4d3. 注册新版 PatternProvider（上层应用，底层走 archival）
		const patternProvider = new PatternProvider(projectDir, memoryCore.archival);
		patternProvider.initialize()
			.then(() => console.log(`[Manager] PatternProvider initialized in background for ${projectId}`))
			.catch((e: unknown) => console.warn('[Manager] PatternProvider init error:', e));
		cognitiveManager.register(patternProvider);

		console.log(`[Manager] Step 4d: Created CognitiveManager with 4 providers (practice, knowledge, memory, pattern)`);
		logStep('Step 4d cognitive providers created');

		// 4e. 初始化 KnowledgeIngest（解析 business-model.json）
		const knowledgeIngest = new KnowledgeIngest(path.join(projectDir, 'knowledge'), projectDir);
		knowledgeIngest.ingestBusinessModel().catch(err => {
			console.warn('[Manager] Failed to ingest business model:', err);
		});

		// 5. 创建 Agent 实例
		console.log(`[Manager] Step 5: Creating agent instance...`);
		const agent = new PersistentAgent({
			projectId,
			workingDirectory: projectDir,
			agentDefinition: agentDef,
			toolDefinition: toolDef,
			skillDefinition: skillDef,
			workspaceFiles,
			builtSystemPrompt: systemPrompt,
			cognitiveManager,
			completionGuardEnabled: false,
		});
		logStep('Step 5 agent object created');

		// 6. 初始化 Agent
		console.log(`[Manager] Step 6: Initializing agent...`);
		await agent.initialize(llmConfig);
		logStep('Step 6 agent initialized');

		// 7. 注入 Memory Core 工具到内部 OriginOSAgent
		console.log(`[Manager] Step 7: Injecting Memory Core tools...`);
		this.injectMemoryTools(agent, memoryCore);
		logStep('Step 7 memory tools injected');

		// 8. 缓存 Agent
		this.agents.set(projectId, agent);

		const elapsed = Date.now() - t0;
		console.log(`[Manager] ========== Agent started in ${elapsed}ms ==========`);
		return agent;
	}

	/**
	 * 停止 Agent
	 */
	async stopAgent(projectId: string): Promise<void> {
		const agent = this.agents.get(projectId);
		if (!agent) {
			console.warn(`[PersistentAgentManager] No agent running for project: ${projectId}`);
			return;
		}

		console.log(`[PersistentAgentManager] Stopping agent for project: ${projectId}`);

		await agent.shutdown();
		this.agents.delete(projectId);

		console.log(`[PersistentAgentManager] Agent stopped for project: ${projectId}`);
	}

	/**
	 * 获取运行中的 Agent
	 */
	getAgent(projectId: string): PersistentAgent | null {
		return this.agents.get(projectId) || null;
	}

	/**
	 * 检查 Agent 是否运行
	 */
	isAgentRunning(projectId: string): boolean {
		return this.agents.has(projectId);
	}

	/**
	 * 获取所有运行中的 Agent 状态
	 */
	getAllAgentStatus(): AgentStatus[] {
		return Array.from(this.agents.values()).map(agent => agent.getStatus());
	}

	/**
	 * 热重载 Agent 配置
	 */
	async reloadAgent(projectId: string): Promise<void> {
		const agent = this.agents.get(projectId);
		if (!agent) {
			throw new Error(`No agent running for project: ${projectId}`);
		}

		console.log(`[PersistentAgentManager] Reloading agent for project: ${projectId}`);

		// 重新读取配置文件（包含工作空间文件）
		const projectDir = path.join(this.baseDir, projectId);
		const agentDef = await this.loadAgentDefinition(projectDir);
		const toolDef = await this.loadToolDefinition(projectDir);
		const skillDef = await parseSkillDefinition(projectDir);
		const workspaceFiles = await loadWorkspaceFiles(projectDir);
		console.log(`[PersistentAgentManager] Reloaded ${workspaceFiles.length} workspace files`);

		// 重新加载项目上下文并构建 7 层 prompt
		const projectCtx = await loadProjectContext(projectDir, projectId, agentDef.agentId);
		if (projectCtx) {
			const layers = buildProjectPromptLayers(projectCtx);
			const systemPrompt = assembleProjectPrompt(layers);
			await agent.reload(agentDef, toolDef, skillDef, workspaceFiles, systemPrompt);
		} else {
			await agent.reload(agentDef, toolDef, skillDef, workspaceFiles);
		}

		console.log(`[PersistentAgentManager] Agent reloaded for project: ${projectId}`);
	}

	/**
	 * 停止所有 Agent
	 */
	async stopAllAgents(): Promise<void> {
		console.log(`[PersistentAgentManager] Stopping all agents...`);

		const stopPromises = Array.from(this.agents.keys()).map(projectId =>
			this.stopAgent(projectId)
		);

		await Promise.all(stopPromises);

		console.log(`[PersistentAgentManager] All agents stopped`);
	}

	// ========================================================================
	// 私有方法：加载配置文件
	// ========================================================================

	/**
	 * 注入 Memory Core 工具到 PersistentAgent 内部的 OriginOSAgent
	 */
	private injectMemoryTools(agent: PersistentAgent, memoryCore: MemoryCore): void {
		try {
			const innerAgent = agent.getAgent();
			if (!innerAgent) return;

			const coreMemoryTools = new CoreMemoryTools(memoryCore.memory);
			const archivalMemoryTools = new ArchivalMemoryTools(memoryCore.archival);

			const registerTool = (name: string, description: string, label: string, params: unknown, execute: (toolCallId: string, args: any) => Promise<{ content: { type: string; text: string }[]; details: {} }>) => {
				innerAgent.registerTool({ name, description, label, parameters: params, execute } as any);
			};

			registerTool('core_memory_append', 'Append content to a core memory block. Available blocks: human, persona, project, scratchpad, temporal.',
				'core_memory_append',
				{ type: 'object', properties: { label: { type: 'string' }, content: { type: 'string' } }, required: ['label', 'content'] },
				async (_toolCallId, args) => {
					if (!args?.label) return { content: [{ type: 'text', text: "Error: 'label' parameter is required. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
					if (!args?.content) return { content: [{ type: 'text', text: "Error: 'content' parameter is required." }], details: {} };
					const result = await coreMemoryTools.core_memory_append(args.label, args.content);
					return { content: [{ type: 'text', text: result }], details: {} };
				});
			registerTool('core_memory_replace', 'Replace content in a core memory block. Available blocks: human, persona, project, scratchpad, temporal.',
				'core_memory_replace',
				{ type: 'object', properties: { label: { type: 'string' }, old_content: { type: 'string' }, new_content: { type: 'string' } }, required: ['label', 'old_content', 'new_content'] },
				async (_toolCallId, args) => {
					if (!args?.label) return { content: [{ type: 'text', text: "Error: 'label' parameter is required. Available blocks: human, persona, project, scratchpad, temporal." }], details: {} };
					if (!args?.old_content) return { content: [{ type: 'text', text: "Error: 'old_content' parameter is required." }], details: {} };
					if (!args?.new_content) return { content: [{ type: 'text', text: "Error: 'new_content' parameter is required." }], details: {} };
					const result = await coreMemoryTools.core_memory_replace(args.label, args.old_content, args.new_content);
					return { content: [{ type: 'text', text: result }], details: {} };
				});
			registerTool('insert_memory_block', 'Create a new custom core memory block.',
				'insert_memory_block',
				{ type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, description: { type: 'string' } }, required: ['label', 'value'] },
				async (_toolCallId, args) => {
					const result = await coreMemoryTools.insert_memory_block(args.label, args.value, args.description);
					return { content: [{ type: 'text', text: result }], details: {} };
				});
			registerTool('read_memory_block', 'Read a core memory block.',
				'read_memory_block',
				{ type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
				async (_toolCallId, args) => {
					const result = await coreMemoryTools.read_memory_block(args.label);
					return { content: [{ type: 'text', text: result }], details: {} };
				});
			registerTool('archival_memory_insert', 'Insert text into archival memory.',
				'archival_memory_insert',
				{ type: 'object', properties: { text: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['text'] },
				async (_toolCallId, args) => {
					const result = await archivalMemoryTools.archival_memory_insert(args.text, args.tags);
					return { content: [{ type: 'text', text: result }], details: {} };
				});
			registerTool('archival_memory_search', 'Semantically search archival memory.',
				'archival_memory_search',
				{ type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
				async (_toolCallId, args) => {
					const result = await archivalMemoryTools.archival_memory_search(args.query, args.limit);
					return { content: [{ type: 'text', text: result }], details: {} };
				});

			console.log('[Manager] Injected 6 Memory Core tools into PersistentAgent');
		} catch (err) {
			console.warn('[Manager] Failed to inject Memory Core tools:', err);
		}
	}

	/**
	 * 从项目目录读取 Agent.md
	 */
	private async loadAgentDefinition(projectDir: string): Promise<AgentDefinition> {
		const filePath = path.join(projectDir, 'Agent.md');

		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return parseAgentDefinition(content);
		} catch (error) {
			console.warn(`[PersistentAgentManager] Agent.md not found, using default`);

			// 返回默认配置
			return {
				agentId: 'default-agent',
				agentType: 'generic',
				version: '1.0.0',
				name: 'Project Agent',
				content: this.getDefaultAgentContent(),
			};
		}
	}

	/**
	 * 从项目目录读取 Tool.md
	 */
	private async loadToolDefinition(projectDir: string): Promise<ToolDefinition> {
		const filePath = path.join(projectDir, 'Tool.md');

		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return parseToolDefinition(content);
		} catch (error) {
			console.warn(`[PersistentAgentManager] Tool.md not found, allowing all tools`);

			// 返回默认配置（允许所有工具）
			return {
				toolsVersion: '1.0.0',
				allowedTools: [], // 空数组表示允许所有工具
				content: this.getDefaultToolContent(),
			};
		}
	}

	/**
	 * 获取默认 Agent 内容
	 */
	private getDefaultAgentContent(): string {
		return `---
agentId: default-agent
agentType: generic
version: 1.0.0
name: Project Agent
---

# Project Agent

I am a general-purpose project agent. I can help you with various tasks including:

- File operations (read, write, list)
- Ontology management
- System operations

Please provide me with specific instructions on what you'd like me to do.
`;
	}

	/**
	 * 获取默认 Tool 内容
	 */
	private getDefaultToolContent(): string {
		return `---
toolsVersion: 1.0.0
---

# Available Tools

All built-in tools are available by default.

## File Tools
- write_file - Write content to a file
- read_file - Read file content
- list_files - List files in a directory
- delete_file - Delete a file

## Ontology Tools
- ontology_create - Create ontology entity
- ontology_update - Update ontology entity
- ontology_query - Query ontology entities

## System Tools
- get_current_time - Get current timestamp
- log_message - Log a message
`;
	}
}

// ============================================================================
// 全局单例实例
// ============================================================================

/**
 * 全局 Persistent Agent Manager 实例 — 挂载到 globalThis 避免 Next.js HMR 实例隔离。
 */
declare global {
  // eslint-disable-next-line no-var
  var __globalPersistentAgentManager: PersistentAgentManager | undefined;
}

function getGlobalPersistentAgentManager(): PersistentAgentManager {
  if (!globalThis.__globalPersistentAgentManager) {
    globalThis.__globalPersistentAgentManager = new PersistentAgentManager();
  }
  return globalThis.__globalPersistentAgentManager;
}

export const persistentAgentManager = getGlobalPersistentAgentManager();
