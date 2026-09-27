import type { CanonicalAgentContract, CanonicalSkillContract } from "./ontology-contract";
/**
 * AI 解决方案数据类型定义
 * 第二阶段：AI 解决方案设计
 */

/**
 * 建模维度
 */
export type ModelingDimension = 'task' | 'role';

/**
 * 方案状态
 */
export type SolutionStatus = 'draft' | 'reviewing' | 'confirmed';

/**
 * Agent 类型
 */
export type SolutionAgentType = 'agent' | 'role-agent';

/**
 * 协作关系类型
 */
export type CollaborationType = 'trigger' | 'notify' | 'depend';

/**
 * Skill 触发类型
 */
export type SkillTriggerType = 'conversation' | 'event' | 'scheduled';

/**
 * Skill 文件大纲（Phase 3 创建实际文件时使用）
 */
export interface SkillFileOutline {
	/**
	 * 触发场景描述
	 */
	triggerScenario: string;

	/**
	 * 执行步骤列表
	 */
	steps: string[];

	/**
	 * 输入格式说明
	 */
	inputFormat: string;

	/**
	 * 输出格式说明
	 */
	outputFormat: string;
}

/**
 * Skill 级输入契约
 */
export interface SkillInputContract {
	requires: Array<{
		objectType: string;
		minCount?: number;
		fields?: string[];
	}>;
}

/**
 * Skill 级输出契约
 */
export interface SkillOutputContract {
	produces: Array<{
		objectType: string;
		fields: string[];
		replaces?: boolean;
	}>;
}

/**
 * SOP 步骤级 I/O 数据流
 */
export interface SOPStepIO {
	input: {
		source: 'ontology' | 'previous-step' | 'user';
		objects: Array<{
			type: string;
			operation: 'read' | 'query' | 'validate';
			filter?: string;
			fromStep?: string;
		}>;
	};
	output: {
		objects: Array<{
			type: string;
			operation: 'create' | 'update' | 'calculate';
			cardinality: 'one' | 'many';
		}>;
	};
}

/**
 * Agent 技能规划
 */
export interface AgentSkill {
  /** Canonical execution declaration; legacy I/O fields are display-only. */
  contract?: CanonicalSkillContract;
	/**
	 * Skill 标识符（kebab-case，如: "order-validator"）
	 */
	id: string;

	/**
	 * Skill 名称
	 */
	name: string;

	/**
	 * Skill 代码（kebab-case，用于 API 查询和目录命名）
	 */
	code: string;

	/**
	 * 能力描述 — 该 Skill 提供什么能力
	 */
	capability: string;

	/**
	 * 触发描述 — 何时应该使用这个 Skill
	 */
	description: string;

	/**
	 * 触发类型
	 */
	triggerType: SkillTriggerType;

	/**
	 * 操作的本体对象列表
	 */
	ontologyObjects: string[] | Record<string, string[]>;

	/**
	 * 输入契约 — 期望从本体读取哪些对象
	 */
	inputContract?: SkillInputContract;

	/**
	 * 输出契约 — 承诺向本体写入哪些对象
	 */
	outputContract?: SkillOutputContract;

	/**
	 * SOP 步骤级数据流（规划阶段填充）
	 */
	sopIO?: SOPStepIO;

	/**
	 * 与其他 Skill 的依赖关系（可选）
	 */
	dependsOn?: string[];

	/**
	 * SKILL.md 文件大纲（Phase 3 创建实际文件时使用）
	 */
	skillFileOutline?: SkillFileOutline;
}

/**
 * Agent 工程文件内容
 */
export interface AgentFiles {
	/**
	 * Agent.md 内容 — 身份、职责、工作模式
	 */
	'Agent.md': string;

	/**
	 * Memory.md 内容 — 记忆模板
	 */
	'Memory.md': string;

	/**
	 * Taste.md 内容 — 沟通风格
	 */
	'Taste.md': string;

	/**
	 * Tool.md 内容 — 工具权限和角色技能
	 */
	'Tool.md': string;

	/**
	 * Role.md 内容（仅 role-agent 类型需要）
	 */
	'Role.md'?: string;
}

/**
 * 本体对象操作
 */
export interface OntologyObjectOperation {
	/**
	 * 本体对象名称
	 */
	name: string;

	/**
	 * 操作类型列表
	 */
	operations: string[];
}

/**
 * Agent 协作关系
 */
export interface AgentCollaboration {
	/**
	 * 目标 Agent ID
	 */
	targetAgentId: string;

	/**
	 * 目标 Agent 名称
	 */
	targetAgentName: string;

	/**
	 * 协作类型
	 */
	type: CollaborationType;

	/**
	 * 协作描述
	 */
	description: string;
}

/**
 * 方案中的 Agent 规划
 */
export interface SolutionAgent {
  /** Exact canonical declaration used by versioned publication. */
  contract?: CanonicalAgentContract;
	/**
	 * Agent ID
	 */
	id: string;

	/**
	 * Agent 类型
	 */
	type: SolutionAgentType;

	/**
	 * Agent 名称
	 */
	name: string;

	/**
	 * 职责描述
	 */
	responsibility: string;

	/**
	 * 业务领域
	 */
	domain: string;

	/**
	 * 来源 — 业务模型中的哪个流程/领域衍生出此 Agent
	 */
	derivedFrom: string;

	/**
	 * 操作的本体对象
	 */
	ontologyObjects: OntologyObjectOperation[];

	/**
	 * Agent 工程文件内容（Phase 3 创建实际文件时使用）
	 */
	agentFiles?: AgentFiles;

	/**
	 * 规划的 Skill 列表
	 */
	skills: AgentSkill[];

	/**
	 * 协作关系
	 */
	collaborations: AgentCollaboration[];
}

/**
 * 拓扑图节点
 */
export interface TopologyNode {
	/**
	 * 节点 ID（对应 Agent ID）
	 */
	id: string;

	/**
	 * 节点标签
	 */
	label: string;

	/**
	 * 节点类型
	 */
	type: SolutionAgentType;

	/**
	 * 位置坐标
	 */
	position: {
		x: number;
		y: number;
	};

	/**
	 * 样式
	 */
	style?: {
		color?: string;
		size?: number;
	};
}

/**
 * 拓扑图边
 */
export interface TopologyEdge {
	/**
	 * 边 ID
	 */
	id: string;

	/**
	 * 源节点 ID
	 */
	source: string;

	/**
	 * 目标节点 ID
	 */
	target: string;

	/**
	 * 协作类型
	 */
	type: CollaborationType;

	/**
	 * 边标签
	 */
	label?: string;
}

/**
 * 协作拓扑
 */
export interface CollaborationTopology {
	/**
	 * 节点列表
	 */
	nodes: TopologyNode[];

	/**
	 * 边列表
	 */
	edges: TopologyEdge[];
}

/**
 * 执行清单
 */
export interface ExecutionManifest {
	/**
	 * 方案 ID
	 */
	solutionId: string;

	/**
	 * 方案版本
	 */
	solutionVersion: string;

	/**
	 * 建模维度
	 */
	modelingDimension: ModelingDimension;

	/**
	 * 业务目标
	 */
	businessGoal: string;

	/**
	 * Agent 列表
	 */
	agents: SolutionAgent[];

	/**
	 * 拓扑
	 */
	topology: CollaborationTopology;

	/**
	 * 生成时间
	 */
	generatedAt: number;
}

/**
 * AI 解决方案
 */
export interface Solution {
	/**
	 * 方案 ID
	 */
	id: string;

	/**
	 * 归属项目 ID
	 */
	projectId: string;

	/**
	 * 基于的本体 ID
	 */
	ontologyId: string;

	/**
	 * 方案名称
	 */
	name: string;

	/**
	 * 方案版本
	 */
	version: string;

	/**
	 * 方案状态
	 */
	status: SolutionStatus;

	/**
	 * 建模维度
	 */
	modelingDimension: ModelingDimension;

	/**
	 * 业务目标描述
	 */
	businessGoal: string;

	/**
	 * AI 推荐理由
	 */
	recommendation: string;

	/**
	 * Agent 规划列表
	 */
	agents: SolutionAgent[];

	/**
	 * 协作拓扑
	 */
	topology: CollaborationTopology;

	/**
	 * 创建时间
	 */
	createdAt: number;

	/**
	 * 更新时间
	 */
	updatedAt: number;

	/**
	 * 创建者用户 ID
	 */
	userId: string;
}

/**
 * 创建方案请求
 */
export interface CreateSolutionRequest {
	/**
	 * 项目 ID
	 */
	projectId: string;

	/**
	 * 本体 ID
	 */
	ontologyId: string;

	/**
	 * 方案名称（可选，默认生成）
	 */
	name?: string;

	/**
	 * 用户 ID（可选）
	 */
	userId?: string;
}

/**
 * 更新方案请求
 */
export interface UpdateSolutionRequest {
	/**
	 * 方案名称
	 */
	name?: string;

	/**
	 * 建模维度
	 */
	modelingDimension?: ModelingDimension;

	/**
	 * 业务目标
	 */
	businessGoal?: string;

	/**
	 * Agent 列表
	 */
	agents?: SolutionAgent[];

	/**
	 * 拓扑
	 */
	topology?: CollaborationTopology;

	/**
	 * 状态
	 */
	status?: SolutionStatus;
}

/**
 * 方案列表项
 */
export interface SolutionListItem {
	id: string;
	projectId: string;
	name: string;
	version: string;
	status: SolutionStatus;
	modelingDimension: ModelingDimension;
	agentCount: number;
	createdAt: number;
	updatedAt: number;
}

/**
 * 方案查询选项
 */
export interface SolutionQuery {
	/**
	 * 项目 ID
	 */
	projectId?: string;

	/**
	 * 状态过滤
	 */
	status?: SolutionStatus;

	/**
	 * 建模维度过滤
	 */
	modelingDimension?: ModelingDimension;

	/**
	 * 排序字段
	 */
	sortBy?: 'createdAt' | 'updatedAt' | 'name';

	/**
	 * 排序方向
	 */
	sortOrder?: 'asc' | 'desc';
}

// --- Story P2.7: Agent–Skill 协作图谱与建模维度扩展 ---

/** 拓扑图节点 */
export interface SolutionTopologyNode {
  id: string;
  type: 'agent' | 'skill';
  name: string;
  label?: string;
  domain?: string;
}

/** 拓扑图边 */
export interface SolutionTopologyEdge {
  source: string;
  target: string;
  type: 'trigger' | 'notify' | 'depend' | 'agent-skill';
}

/** 多视图拓扑结构 */
export interface SolutionTopologyView {
  view: 'workflow' | 'team';
  nodes: SolutionTopologyNode[];
  edges: SolutionTopologyEdge[];
}
