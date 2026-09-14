/**
 * OS.3: Agent 对象定义 - Type Definitions
 */

// ============ Agent Type Enum ============

export enum AgentType {
  ARCHITECT = 'architect',
  DEVELOPER = 'developer',
  QA_ENGINEER = 'qa-engineer',
  UX_DESIGNER = 'ux-designer',
  PM = 'pm',
  PROJECT_INITIALIZER = 'project-initializer',
}

// ============ Agent Status Enum ============

export enum AgentStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  ERROR = 'error',
  UNREGISTERED = 'unregistered',
}

// ============ Agent Type Info ============

export interface AgentTypeInfo {
  id: AgentType;
  name: string;
  displayName: string;
  icon: string;
  color: string;
  capabilities: string[];
}

export const AGENT_TYPE_INFO: Record<AgentType, AgentTypeInfo> = {
  [AgentType.ARCHITECT]: {
    id: AgentType.ARCHITECT,
    name: 'architect',
    displayName: '架构师',
    icon: '🏗️',
    color: '#3B82F6',
    capabilities: ['architecture', 'design', 'review'],
  },
  [AgentType.DEVELOPER]: {
    id: AgentType.DEVELOPER,
    name: 'developer',
    displayName: '开发者',
    icon: '💻',
    color: '#10B981',
    capabilities: ['code', 'test', 'debug'],
  },
  [AgentType.QA_ENGINEER]: {
    id: AgentType.QA_ENGINEER,
    name: 'qa-engineer',
    displayName: 'QA 工程师',
    icon: '🧪',
    color: '#F59E0B',
    capabilities: ['test', 'review', 'quality'],
  },
  [AgentType.UX_DESIGNER]: {
    id: AgentType.UX_DESIGNER,
    name: 'ux-designer',
    displayName: 'UX 设计师',
    icon: '🎨',
    color: '#8B5CF6',
    capabilities: ['design', 'research', 'prototyping'],
  },
  [AgentType.PM]: {
    id: AgentType.PM,
    name: 'pm',
    displayName: '产品经理',
    icon: '📋',
    color: '#EC4899',
    capabilities: ['planning', 'requirements', 'coordination'],
  },
  [AgentType.PROJECT_INITIALIZER]: {
    id: AgentType.PROJECT_INITIALIZER,
    name: 'project-initializer',
    displayName: '项目初始化',
    icon: '🚀',
    color: '#6366F1',
    capabilities: ['project_create', 'ontology_build', 'team_coordination', 'interview'],
  },
};

// ============ Agent Status Icons & Colors ============

export const AGENT_STATUS_ICON: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]: '⚪',
  [AgentStatus.INITIALIZING]: '🔵',
  [AgentStatus.RUNNING]: '🟢',
  [AgentStatus.PAUSED]: '🟡',
  [AgentStatus.ERROR]: '🔴',
  [AgentStatus.UNREGISTERED]: '⚫',
};

export const AGENT_STATUS_COLOR: Record<AgentStatus, string> = {
  [AgentStatus.IDLE]: '#9CA3AF',
  [AgentStatus.INITIALIZING]: '#3B82F6',
  [AgentStatus.RUNNING]: '#10B981',
  [AgentStatus.PAUSED]: '#F59E0B',
  [AgentStatus.ERROR]: '#EF4444',
  [AgentStatus.UNREGISTERED]: '#6B7280',
};

// ============ Agent Object ============

export interface AgentObject {
  id: string;
  name: string;
  displayName: string;
  type: AgentType;
  status: AgentStatus;
  icon: string;
  color: string;
  capabilities: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  lastActivatedAt: number;
}

export interface AgentMetadata {
  version?: string;
  description?: string;
  author?: string;
  tags?: string[];
  config?: Record<string, unknown>;
}

// ============ Agent Registry State ============

export interface AgentRegistryState {
  agents: Record<string, AgentObject>;
  activeAgentId: string | null;
  isLoading: boolean;

  // Actions
  setAgent: (id: string, agent: AgentObject) => void;
  removeAgent: (id: string) => void;
  updateAgent: (id: string, updates: Partial<AgentObject>) => void;
  setActiveAgent: (id: string | null) => void;
  setAgentStatus: (id: string, status: AgentStatus) => void;
  bulkSetAgents: (agents: AgentObject[]) => void;
  clearAll: () => void;
}

// ============ Agent Props ============

export interface AgentIconProps {
  agent: AgentObject;
  onClick?: () => void;
  onRightClick?: (e: React.MouseEvent) => void;
}

// ============ Agent Session Types ============

/**
 * Agent message in a session
 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'toolResult';
  content: string;
  timestamp: number;
  toolResults?: Array<{
    toolCallId: string;
    result: unknown;
  }>;
  metadata?: Record<string, unknown>;

  // AI 推理过程（Task #17 - 仅 assistant 消息有）
  thinking?: ThinkingData;
}

/**
 * Project context for a session
 */
export interface SessionProjectContext {
  projectId: string;
  projectName: string;
  entryType?: 'skill' | 'agent' | 'role-agent';
  entryId?: string;
  ontologyId?: string;
  currentPath?: string;
  outputDir?: string;
  userId?: string;
  phase?: string;
  projectEntityId?: string;
  entitiesCreated?: number | string[];
}

/**
 * Agent session configuration
 */
export interface AgentSessionConfig {
  sessionId: string;
  systemPrompt?: string;
  agentType?: string;
}

/**
 * Agent session data
 */
export interface AgentSession {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'completed' | 'archived' | 'cancelled';
  messages: AgentMessage[];
  projectContext: SessionProjectContext;
  systemPrompt: string;
  agentType: string;
  config: AgentSessionConfig;
  summary?: string;
  taskRuntime?: import('../lib/integrations/pi-agent/task-runtime').AgentTaskRuntimePersistenceV1;
  llmConfig?: {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    anthropicAuthToken?: string;
    anthropicApiKey?: string;
    anthropicBaseUrl?: string;
    anthropicCredentialSource?: "anthropicAuthToken" | "anthropicApiKey" | "authToken" | "apiKey";
    authToken?: string;
    model?: string;
    maxTokens?: number;
  };
}

/**
 * Agent session data for file storage
 */
export interface AgentSessionData {
  version: string;
  createdAt: string;
  updatedAt: string;
  data: AgentSession;
}

/**
 * Request to create a new session
 */
export interface CreateSessionRequest {
  projectId: string;
  projectName: string;
  systemPrompt?: string;
  agentType?: string;
  projectContext?: Partial<SessionProjectContext>;
  sessionId?: string; // Optional: client-provided session ID
  llmConfig?: {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    anthropicAuthToken?: string;
    anthropicApiKey?: string;
    anthropicBaseUrl?: string;
    anthropicCredentialSource?: "anthropicAuthToken" | "anthropicApiKey" | "authToken" | "apiKey";
    authToken?: string;
    model?: string;
    maxTokens?: number;
  };
}

/**
 * Request to update a session
 */
export interface UpdateSessionRequest {
  messages?: AgentMessage[];
  status?: 'active' | 'completed' | 'archived' | 'cancelled';
  projectContext?: Partial<SessionProjectContext>;
  summary?: string;
  llmConfig?: {
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    maxTokens?: number;
  };
  taskRuntime?: import('../lib/integrations/pi-agent/task-runtime').AgentTaskRuntimePersistenceV1;
}

/**
 * Session list item for display
 */
export interface SessionListItem {
  sessionId: string;
  projectId: string;
  projectName: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  summary?: string;
  agentType?: string;
}

/**
 * Session summary statistics
 */
export interface SessionSummary {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  firstMessage?: string;
  lastMessage?: string;
}

/**
 * Session statistics for a project
 */
export interface SessionStatistics {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  totalMessages: number;
  averageMessagesPerSession: number;
}

// ============================================================================
// Skill-related Types (for pi-agent-core integration)
// ============================================================================

/**
 * Skill type for agent sessions
 */
export type AgentSkillType =
  | 'architect'
  | 'developer'
  | 'qa-engineer'
  | 'ux-designer'
  | 'pm'
  | 'project-initialization'
  | 'ontology'
  | 'generic';

// ============================================================================
// AI Thinking Types (Task #17 - AI 推理过程展示)
// ============================================================================

/**
 * 推理步骤（P1 - 结构化步骤支持）
 */
export interface ThinkingStep {
  id: string;
  order: number;
  status: 'pending' | 'thinking' | 'completed' | 'error';
  // 步骤内容
  title: string;
  content?: string;
  // 工具调用
  toolCalls?: ToolCallInfo[];
  // 时间信息
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  // 元数据
  metadata?: {
    confidence?: number;
    alternativesThinking?: string;
  };
}

/**
 * 工具调用信息
 */
export interface ToolCallInfo {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  input?: unknown;
  output?: unknown;
  error?: string;
  duration?: number;
}

/**
 * 推理过程数据
 */
export interface ThinkingData {
  // 完整的推理内容（从 pi-agent 合并后获得）
  content: string;
  // 结构化步骤（可选，后期增强时支持）
  steps?: ThinkingStep[];
  // 状态
  status: 'in-progress' | 'completed' | 'error';
  // 错误信息
  error?: string;
  // 签名（用于安全验证）
  signature?: string;
}

/**
 * 推理展示偏好设置
 */
export interface ThinkingPreference {
  /// 显示模式
  displayMode: 'always-hide' | 'user-choice' | 'always-show';
  /// 流式更新时自动展开
  autoExpandStreaming: boolean;
  /// 显示工具调用结果
  showToolCalls: boolean;
  /// 显示置信度评分（P1）
  showConfidence: boolean;
  /// 最大可见步骤数（P1）
  maxVisibleSteps?: number;
}

/**
 * 推理过程流式数据（SSE）
 */
export interface ThinkingStreamData {
  content?: string;        // 增量内容（delta）或完整内容（end）
  fullContent?: string;    // 累计的完整内容
  isStreaming?: boolean;   // 是否正在流式输出
  signature?: string;      // 推理签名
  redacted?: boolean;      // 是否被安全过滤器脱敏
}
