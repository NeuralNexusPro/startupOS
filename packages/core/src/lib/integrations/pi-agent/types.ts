/**
 * Pi Agent Core 集成类型定义
 * 扩展 pi-agent-core 的消息类型，添加 OriginOS 特定的消息
 */

import type {
	AgentEvent,
	AgentMessage,
	AgentTool,
	AgentToolResult,
} from "@originos/pi-agent-adapter";
import type { Model } from "@originos/pi-agent-adapter/ai";
import type { TSchema, Static } from "@sinclair/typebox";
import type { AgentToolUpdateCallback } from "@originos/pi-agent-adapter";

// ============================================================================
// 扩展 pi-agent-core 的消息类型
// ============================================================================

declare module "@originos/pi-agent-adapter" {
	interface CustomAgentMessages {
		// OriginOS 系统事件消息
		system_event: SystemEventMessage;

		// 进度消息
		progress: ProgressMessage;

		// 本体状态消息
		ontology_state: OntologyStateMessage;

		// 文件操作消息
		file_operation: FileOperationMessage;

		// 技能加载消息
		skill_operation: SkillOperationMessage;
	}
}

// ============================================================================
// 自定义消息类型
// ============================================================================

/**
 * 系统事件消息
 * 用于系统级别的通知和状态变化
 */
export interface SystemEventMessage {
	role: "system_event";
	/**
	 * 事件类型
	 */
	eventType:
		| "project_created"
		| "session_started"
		| "session_ended"
		| "ontology_updated"
		| "error_occurred"
		| "state_changed";
	/**
	 * 事件数据
	 */
	data: Record<string, unknown>;
	timestamp: number;
}

/**
 * 进度消息
 * 用于显示任务的执行进度
 */
export interface ProgressMessage {
	role: "progress";
	/**
	 * 任务ID
	 */
	taskId: string;
	/**
	 * 任务名称
	 */
	taskName: string;
	/**
	 * 当前进度 (0-1)
	 */
	progress: number;
	/**
	 * 进度消息
	 */
	message?: string;
	/**
	 * 当前步骤
	 */
	currentStep?: string;
	/**
	 * 总步骤数
	 */
	totalSteps?: number;
	timestamp: number;
}

/**
 * 本体状态消息
 * 用于通知本体图谱的状态变化
 */
export interface OntologyStateMessage {
	role: "ontology_state";
	/**
	 * 事件类型
	 */
	operationType:
		| "node_created"
		| "node_updated"
		| "node_deleted"
		| "relation_created"
		| "relation_updated"
		| "relation_deleted";
	/**
	 * 本体ID
	 */
	ontologyId: string;
	/**
	 * 相关数据
	 */
	data: {
		nodeId?: string;
		nodeType?: string;
		nodeName?: string;
		relationId?: string;
	};
	timestamp: number;
}

/**
 * 文件操作消息
 * 用于通知文件系统操作
 */
export interface FileOperationMessage {
	role: "file_operation";
	/**
	 * 操作类型
	 */
	operationType:
		| "read"
		| "write"
		| "create"
		| "delete"
		| "move"
		| "rename";
	/**
	 * 文件路径
	 */
	filePath: string;
	/**
	 * 操作状态
	 */
	status: "started" | "progress" | "completed" | "failed";
	/**
	 * 额外数据
	 */
	data?: {
		bytesRead?: number;
		bytesWritten?: number;
		totalBytes?: number;
		error?: string;
	};
	timestamp: number;
}

/**
 * 技能操作消息
 * 用于通知技能的加载和执行状态
 */
export interface SkillOperationMessage {
	role: "skill_operation";
	/**
	 * 操作类型
	 */
	operationType: "loaded" | "unloaded" | "executed" | "failed";
	/**
	 * 技能名称
	 */
	skillName: string;
	/**
	 * 技能ID
	 */
	skillId?: string;
	/**
	 * 操作结果
	 */
	result?: unknown;
	/**
	 * 错误信息
	 */
	error?: string;
	timestamp: number;
}

// ============================================================================
// OriginOS Agent 配置类型
// ============================================================================

/**
 * OriginOS Agent 配置
 */
export interface OriginOSAgentConfig {
	/**
	 * 系统提示词
	 */
	systemPrompt: string;

	/**
	 * LLM 模型
	 */
	model: Model<any>;

	/**
	 * 会话ID
	 */
	sessionId?: string;

	/**
	 * 注册的工具
	 */
	tools?: AgentTool<any>[];

	/**
	 * 项目上下文
	 */
	projectContext?: ProjectContext;

	/**
	 * 思考级别
	 */
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";

	/**
	 * 是否启用语义完成度检查与自动恢复。
	 *
	 * 默认开启；交互式项目访谈会显式关闭，避免把正常追问误判为未完成任务。
	 */
	completionGuardEnabled?: boolean;
}

/**
 * 项目上下文
 */
export interface ProjectContext {
	/**
	 * 项目ID
	 */
	projectId: string;

	/**
	 * 本体ID
	 */
	ontologyId?: string;

	/**
	 * 当前路径
	 */
	currentPath?: string;

	/**
	 * 当前 Session 的产物输出目录
	 */
	outputDir?: string;

	/**
	 * 项目名称
	 */
	projectName?: string;

	/**
	 * 当前会话所属入口。新会话必须持久化；旧会话恢复时由已校验的请求补齐。
	 */
	entryType?: "skill" | "agent" | "role-agent";
	entryId?: string;

	/**
	 * 用户ID
	 */
	userId?: string;
}

// ============================================================================
// Agent 状态类型
// ============================================================================

/**
 * OriginOS Agent 状态
 */
export interface OriginOSAgentState {
	/**
	 * Agent 是否已初始化
	 */
	isInitialized: boolean;

	/**
	 * 会话ID
	 */
	sessionId: string;

	/**
	 * 项目上下文
	 */
	projectContext?: ProjectContext;

	/**
	 * 当前UI状态
	 */
	uiState: {
		/**
		 * 是否正在思考
		 */
		isThinking: boolean;

		/**
		 * 正在执行的工具
		 */
		activeTools: Array<{
			toolName: string;
			startTime: number;
		}>;

		/**
		 * 当前进度
		 */
		progress?: ProgressMessage;
	};

	/**
	 * 最后的错误
	 */
	lastError?: {
		message: string;
		timestamp: number;
	};
}

// ============================================================================
// 事件处理类型
// ============================================================================

/**
 * 事件处理器
 */
export type EventHandler = (event: AgentEvent) => void;

/**
 * 进度回调
 */
export interface ProgressCallback {
	onProgress?: (progress: ProgressMessage) => void;
	onComplete?: () => void;
	onError?: (error: Error) => void;
}

// ============================================================================
// 工具注册类型
// ============================================================================

/**
 * 工具定义（UI 显示用）
 * 仅用于 UI 层展示工具列表，不包含执行逻辑
 */
export interface ToolDefinition {
	/**
	 * 工具名称
	 */
	name: string;

	/**
	 * 工具标签（UI显示）
	 */
	label: string;

	/**
	 * 工具描述
	 */
	description?: string;

	/**
	 * 工具分类
	 */
	category?: "file" | "ontology" | "graph" | "skill" | "system";

	/**
	 * 是否启用
	 */
	enabled?: boolean;
}

/**
 * Agent 类型枚举
 * 不同 launcher 启动的 agent 类型，用于控制工具的可用范围
 */
export type AgentType =
	| 'assistant'    // AgentLauncher — 普通 agent 助手
	| 'role-agent'   // RoleAgentLauncher — 角色化专业 agent
	| 'skill'        // SkillLauncher — 技能执行
	| 'project'      // 项目解决方案
	| 'solution'     // 解决方案
	| string;        // 支持未来扩展

/**
 * 工具注册（完整类型，包含执行逻辑）
 * 统一的工具注册接口，用于注册具有完整执行能力的工具
 */
export interface ToolRegistration<
	TParameters extends TSchema = any,
 TResult = unknown,
> {
	/**
	 * 工具名称
	 */
	name: string;

	/**
	 * 工具标签（UI 显示）
	 */
	label: string;

	/**
	 * 工具描述
	 */
	description: string;

	/**
	 * 工具参数 Schema
	 */
	parameters: TParameters;

	/**
	 * 工具执行函数
	 *
	 * @param toolCallId - 工具调用 ID，用于追踪和日志记录
	 * @param params - 工具参数
	 * @param signal - AbortSignal，用于取消工具执行
	 * @param onUpdate - 进度更新回调，用于报告执行进度
	 * @returns 工具执行结果
	 */
	execute: (
		toolCallId: string,
		params: Static<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TResult>
	) => Promise<AgentToolResult<TResult>>;

	/**
	 * 工具分类
	 */
	category: "file" | "ontology" | "graph" | "skill" | "system";

	/**
	 * 是否启用
	 */
	enabled: boolean;

	/**
	 * 适用的 agent 类型。
	 * 不声明 = 所有类型通用（如 read_file, write_file 等基础设施）
	 * 声明数组 = 仅限这些类型使用
	 */
	scopes?: AgentType[];

	/**
	 * 是否允许被系统级定时任务以 system-tool 动作调用。
	 * 默认 false，必须显式声明以避免定时任务绕过工具权限边界。
	 */
	schedulable?: boolean;
}

// ============================================================================
// 会话管理类型
// ============================================================================

/**
 * 会话数据
 */
export interface SessionData {
	/**
	 * 会话ID
	 */
	sessionId: string;

	/**
	 * 用户消息
	 */
	messages: AgentMessage[];

	/**
	 * 系统提示词
	 */
	systemPrompt: string;

	/**
	 * 模型信息
	 */
	model: {
		provider: string;
		id: string;
	};

	/**
	 * 会话创建时间
	 */
	createdAt: number;

	/**
	 * 最后更新时间
	 */
	updatedAt: number;

	/**
	 * 项目上下文
	 */
	projectContext?: ProjectContext;
}
