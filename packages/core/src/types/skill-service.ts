import type { AgentMessage, SessionListItem } from './agent';

/**
 * Frontmatter structure for SKILL.md files
 */
export interface SkillFrontmatter {
	name?: string;
	code?: string;
	description?: string;
	"disable-model-invocation"?: boolean;
	"originos-system"?: boolean | string;
	[key: string]: unknown;
}

/**
 * Skill object representing a loaded skill
 */
export interface Skill {
	name: string;
	code?: string;
	description: string;
	filePath: string;
	baseDir: string;
	source: "bundled" | "user" | "project";
	disableModelInvocation: boolean;
	systemManaged?: boolean;
	/** 产物输出目录（与 workingDirectory 分离）。相对路径基于 getDataRoot() 解析 */
	outputDir?: string;
}

/**
 * Diagnostic info from skill loading
 */
export interface SkillDiagnostic {
	type: "warning" | "error" | "collision";
	message: string;
	path: string;
	collision?: {
		resourceType: string;
		name: string;
		winnerPath: string;
		loserPath: string;
	};
}

export type SkillSource = Skill['source'];

export interface SkillListRequest {
  source?: SkillSource;
  includeInvisible?: boolean;
  includeDiagnostics?: boolean;
}

export interface SkillListItem {
  name: string;
  code?: string;
  description: string;
  source: SkillSource;
  filePath?: string;
  baseDir?: string;
  disableModelInvocation?: boolean;
  systemManaged?: boolean;
}

export interface SkillListResponse {
  skills: SkillListItem[];
  diagnostics: SkillDiagnostic[];
}

export interface SkillContentRequest {
  name: string;
  includeFrontmatter?: boolean;
}

export interface SkillContentResponse {
  content: string;
  baseDir: string;
  /** 技能工作目录（CWD，用于 bash 执行和认知文件写入） */
  workingDir: string;
  /** 产物输出目录（用于创建 Agent 等产物） */
  outputDir: string;
  /** 系统内置技能不允许作为用户技能导出 */
  systemManaged: boolean;
  frontmatter?: SkillFrontmatter;
}

export interface SkillDetailRequest {
  name: string;
  includeInvisible?: boolean;
}

export interface SkillDetailResponse {
  name: string;
  description: string;
  source: SkillSource;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
  content: string;
  frontmatter: SkillFrontmatter;
}

export interface SkillSessionsRequest {
  skillName?: string;
}

export interface SkillSessionsResponse {
  sessions: SessionListItem[];
  count: number;
}

export interface SkillExecutionStartRequest {
  skillName?: string;
  sessionId?: string;
  data?: unknown;
  args?: unknown;
  config?: unknown;
  input?: unknown;
}

export interface SkillExecutionStartResponse {
  executionId: string;
  skillName: string;
  status: 'initializing' | 'running' | 'completed' | 'failed';
  startedAt: string;
  sessionId: string;
  message?: string;
  data?: unknown;
}

export interface SkillExecutionCompleteRequest {
  executionId: string;
  sessionId?: string;
  cancelled?: boolean;
}

export interface SkillExecutionCompleteResponse {
  success: boolean;
  status: 'completed' | 'cancelled';
  endedAt: string;
  summary: {
    totalMessages: number;
    duration: number;
  };
}

export interface SkillExecutionTimelineRequest {
  executionId: string;
  sessionId?: string;
}

export interface SkillExecutionTimelineItem {
  type: 'start' | 'end' | 'message' | 'tool' | 'error';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface SkillExecutionTimelineResponse {
  executionId: string;
  skillName: string;
  startedAt: string;
  status: 'completed' | 'failed' | 'running';
  endedAt?: string;
  timeline: SkillExecutionTimelineItem[];
}

export interface SkillExecutionMessageRequest {
  executionId: string;
  sessionId?: string;
  content?: string;
  role?: AgentMessage['role'];
  metadata?: Record<string, unknown>;
}

export interface SkillExecutionMessageResponse {
  message: {
    role: string;
    content: string;
    timestamp: string;
  };
  assistantMessage?: {
    role: 'assistant';
    content: string;
    timestamp: string;
  };
  executionStatus?: {
    status: string;
    progress?: unknown;
  };
}

export type SkillExecutionStreamEventType =
  | 'user_message'
  | 'assistant_message'
  | 'error'
  | 'done';

export interface SkillExecutionStreamEvent {
  executionId: string;
  type: SkillExecutionStreamEventType;
  data: unknown;
}

export interface SkillExecutionStreamRequest extends SkillExecutionMessageRequest {
  streamId?: string;
}

