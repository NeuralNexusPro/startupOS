/**
 * 项目数据类型定义
 */

import type { ProjectOntologyRef } from './project-ontology-entry';

export interface Project {
	/**
	 * 项目唯一 ID
	 */
	id: string;

	/**
	 * 项目名称
	 */
	name: string;

	/**
	 * 项目描述
	 */
	description: string;

	/**
	 * 项目领域/领域
	 */
	domain: string;

	/**
	 * 项目类型
	 */
	type: string;

	/**
	 * 本体 ID
	 */
	ontologyId: string;

	/**
	 * 创建时间
	 */
	createdAt: number;

	/**
	 * 更新时间
	 */
	updatedAt: number;

	/**
	 * 最后修改时间
	 */
	lastModified: number;

	/**
	 * 创建者用户 ID
	 */
	userId: string;

	/**
	 * 项目状态
	 */
	status: ProjectStatus;

	/**
	 * 项目颜色主题
	 */
	color: string;

	/**
	 * 项目图标
	 */
	icon?: string;

	/**
	 * 元数据
	 */
	metadata?: ProjectMetadata;
}

/**
 * 项目状态
 */
export type ProjectStatus = "active" | "archived" | "deleted";

/**
 * 项目元数据
 */
export interface ProjectMetadata {
	/**
	 * 项目绑定的 canonical ontology 精确引用。缺失时项目必须通过显式迁移
	 * 获得该引用，读取方不得猜测或选择最新版本。
	 */
	ontologyRef?: ProjectOntologyRef;
	/**
	 * 目标用户
	 */
	targetUsers?: string;

	/**
	 * 主要功能
	 */
	mainFeatures?: string;

	/**
	 * 工作模式
	 */
	workMode?: string;

	/**
	 * 自定义标签
	 */
	tags?: string[];

	/**
	 * 其他自定义字段
	 */
	[key: string]: string | string[] | number | boolean | ProjectOntologyRef | undefined;
}

/**
 * 创建项目请求数据
 */
export interface CreateProjectRequest {
	/**
	 * 项目名称（必填）
	 */
	name: string;

	/**
	 * 项目描述（可选）
	 */
	description?: string;

	/**
	 * 项目领域（必填）
	 */
	domain: string;

	/**
	 * 项目类型（可选）
	 */
	type?: string;

	/**
	 * 本体 ID（可选，创建后生成）
	 */
	ontologyId?: string;

	/**
	 * 用户 ID（可选，默认为 current-user）
	 */
	userId?: string;

	/**
	 * 项目颜色（可选）
	 */
	color?: string;

	/**
	 * 项目图标（可选）
	 */
	icon?: string;

	/**
	 * 项目状态（可选）
	 */
	status?: ProjectStatus;

	/**
	 * 元数据（可选）
	 */
	metadata?: Record<string, unknown>;
}

/**
 * 更新项目请求数据
 */
export interface UpdateProjectRequest {
	/**
	 * 项目名称
	 */
	name?: string;

	/**
	 * 项目描述
	 */
	description?: string;

	/**
	 * 项目领域
	 */
	domain?: string;

	/**
	 * 项目状态
	 */
	status?: ProjectStatus;

	/**
	 * 本体 ID
	 */
	ontologyId?: string;

	/**
	 * 项目颜色
	 */
	color?: string;

	/**
	 * 项目图标
	 */
	icon?: string;

	/**
	 * 元数据更新
	 */
	metadata?: Partial<ProjectMetadata>;
}

/**
 * 项目列表项（用于列表显示）
 */
export interface ProjectListItem {
	id: string;
	name: string;
	description: string;
	domain: string;
	createdAt: number;
	lastModified: number;
	ontologySize: number;
	ontologyId: string;
	color: string;
	status: ProjectStatus;
	hasSolution: boolean;
}

/**
 * 项目查询选项
 */
export interface ProjectQuery {
	/**
	 * 用户 ID
	 */
	userId?: string;

	/**
	 * 项目状态过滤
	 */
	status?: ProjectStatus;

	/**
	 * 领域过滤
	 */
	domain?: string;

	/**
	 * 搜索关键词
	 */
	search?: string;

	/**
	 * 排序字段
	 */
	sortBy?: "createdAt" | "updatedAt" | "name" | "lastModified";

	/**
	 * 排序方向
	 */
	sortOrder?: "asc" | "desc";

	/**
	 * 限制数量
	 */
	limit?: number;

	/**
	 * 偏移量
	 */
	offset?: number;

	/**
	 * 页码
	 */
	page?: number;
}
