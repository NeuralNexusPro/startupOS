export const IPC_CHANNELS = {
  WINDOW_CREATE: 'window:create',
  WINDOW_CLOSE: 'window:close',
  WINDOW_FOCUS: 'window:focus',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSED: 'window:closed',
  FS_READ: 'fs:read',
  FS_WRITE: 'fs:write',
  FS_LIST: 'fs:list',
  FS_DELETE: 'fs:delete',
  FS_WATCH: 'fs:watch',
  FS_UNWATCH: 'fs:unwatch',
  FS_CHANGED: 'fs:changed',
  WORKSPACE_RESOLVE: 'workspace:resolve',
  WORKSPACE_FILE_LIST: 'workspace:file:list',
  WORKSPACE_FILE_READ: 'workspace:file:read',
  WORKSPACE_FILE_WRITE: 'workspace:file:write',
  WORKSPACE_FILE_DELETE: 'workspace:file:delete',
  WORKSPACE_FILE_UPLOAD: 'workspace:file:upload',
  ENTRY_EXPORT: 'entry:export',
  AGENT_START: 'agent:start',
  AGENT_STOP: 'agent:stop',
  AGENT_MESSAGE: 'agent:message',
  AGENT_ABORT: 'agent:abort',
  AGENT_EVENT: 'agent:event',
  AGENT_EXIT: 'agent:exit',
  AGENT_SESSION_LIST: 'agent:session:list',
  AGENT_SESSION_CREATE: 'agent:session:create',
  AGENT_SESSION_GET: 'agent:session:get',
  AGENT_SESSION_UPDATE: 'agent:session:update',
  AGENT_SESSION_DELETE: 'agent:session:delete',
  AGENT_SESSION_DESTROY: 'agent:session:destroy',
  AGENT_SESSION_STATISTICS: 'agent:session:statistics',
  AGENT_SESSION_SUMMARY: 'agent:session:summary',
  AGENT_SESSION_MESSAGE: 'agent:session:message',
  AGENT_SESSION_MESSAGE_STREAM: 'agent:session:message:stream',
  AGENT_SESSION_ABORT: 'agent:session:abort',
  AGENT_TASK_CREATE: 'agent:task:create',
  AGENT_TASK_GET: 'agent:task:get',
  AGENT_TASK_CONTROL: 'agent:task:control',
  AGENT_TASK_EVENT: 'agent:task:event',
  AGENT_MEMORY_CONSOLIDATE: 'agent:memory:consolidate',
  AGENT_TEST_LLM: 'agent:test-llm',
  AGENT_CONTENT_GET: 'agent:content:get',
  AGENT_PROJECT_START: 'agent:project:start',
  AGENT_PROJECT_STOP: 'agent:project:stop',
  AGENT_PROJECT_MESSAGE: 'agent:project:message',
  AGENT_PROJECT_ABORT: 'agent:project:abort',
  SKILL_LIST: 'skill:list',
  SKILL_CONTENT: 'skill:content',
  SKILL_REFRESH: 'skill:refresh',
  SKILL_SESSION_LIST: 'skill:session:list',
  SKILL_EXECUTION_START: 'skill:execution:start',
  SKILL_EXECUTION_MESSAGE: 'skill:execution:message',
  SKILL_EXECUTION_MESSAGE_STREAM: 'skill:execution:message:stream',
  SKILL_EXECUTION_EVENT: 'skill:execution:event',
  SKILL_EXECUTION_COMPLETE: 'skill:execution:complete',
  SKILL_EXECUTION_TIMELINE: 'skill:execution:timeline',
  SKILL_EVOLUTION_RUN: 'skill:evolution:run',
  PROJECT_LIST: 'project:list',
  PROJECT_GET: 'project:get',
  PROJECT_CREATE: 'project:create',
  PROJECT_UPDATE: 'project:update',
  PROJECT_EVENT: 'project:event',
  PROJECT_DELETE: 'project:delete',
  PROJECT_ARTIFACT_GET: 'project:artifact:get',
  PROJECT_INITIALIZE: 'project:initialize',
  PROJECT_SYNC_ONTOLOGY: 'project:sync-ontology',
  PROJECT_SOLUTION_INITIALIZE: 'project:solution:initialize',
  PROJECT_SOLUTION_LIST: 'project:solution:list',
  PROJECT_SOLUTION_GET: 'project:solution:get',
  PROJECT_EXPORT: 'project:export',
  PROJECT_IMPORT: 'project:import',
  PROJECT_CREATION_START: 'project:creation:start',
  PROJECT_CREATION_ANSWER: 'project:creation:answer',
  PROJECT_CREATION_COMPLETE: 'project:creation:complete',
  ONTOLOGY_ENTITY_LIST: 'ontology:entity:list',
  ONTOLOGY_ENTITY_GET: 'ontology:entity:get',
  ONTOLOGY_ENTITY_CREATE: 'ontology:entity:create',
  ONTOLOGY_ENTITY_UPDATE: 'ontology:entity:update',
  ONTOLOGY_ENTITY_DELETE: 'ontology:entity:delete',
  ONTOLOGY_ENTITY_RELATED: 'ontology:entity:related',
  ONTOLOGY_VALIDATE: 'ontology:validate',
  ONTOLOGY_GET: 'ontology:get',
  ONTOLOGY_UPDATE: 'ontology:update',
  ONTOLOGY_CONFIRM: 'ontology:confirm',
  ONTOLOGY_CHAT: 'ontology:chat',
  ONTOLOGY_GENERATE: 'ontology:generate',
  USER_AGENT_LIST: 'user-agent:list',
  USER_AGENT_GET: 'user-agent:get',
  USER_SKILL_LIST: 'user-skill:list',
  USER_SKILL_GET: 'user-skill:get',
  INTERVIEW_LIST: 'interview:list',
  INTERVIEW_CREATE: 'interview:create',
  INTERVIEW_GET: 'interview:get',
  INTERVIEW_COMPLETE: 'interview:complete',
  INTERVIEW_ANSWER_SUBMIT: 'interview:answer:submit',
  NOTIFICATION_LIST: 'notification:list',
  NOTIFICATION_UPDATE: 'notification:update',
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_CLICK: 'notification:click',
  USER_AGENT_DELETE: 'user-agent:delete',
  USER_SKILL_DELETE: 'user-skill:delete',
  LAUNCH: 'launch',
  DEBUG_ENV: 'debug:env',
  USER_CONFIG_GET: 'user-config:get',
  USER_CONFIG_SET: 'user-config:set',
  UPDATE_STATUS: 'update:status',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_EVENT: 'update:event',
  ONTOLOGY_DATA_DOMAIN_CREATE: 'ontology-data:domain:create',
  ONTOLOGY_DATA_DOMAIN_DELETE: 'ontology-data:domain:delete',
  ONTOLOGY_DATA_CONCEPT_LIST: 'ontology-data:concept:list',
  ONTOLOGY_DATA_CONCEPT_CREATE: 'ontology-data:concept:create',
  ONTOLOGY_DATA_INSTANCE_LIST: 'ontology-data:instance:list',
  ONTOLOGY_DATA_INSTANCE_CREATE: 'ontology-data:instance:create',
  ONTOLOGY_DATA_INSTANCE_UPDATE: 'ontology-data:instance:update',
  ONTOLOGY_DATA_INSTANCE_DELETE: 'ontology-data:instance:delete',
  ONTOLOGY_DATA_SYNC: 'ontology-data:sync',
  ONTOLOGY_DATA_CONCEPT_SCHEMA_GET: 'ontology-data:concept:schema:get',
  ONTOLOGY_DATA_CONCEPT_SCHEMA_UPDATE: 'ontology-data:concept:schema:update',
  ONTOLOGY_DATA_CONCEPT_DELETE: 'ontology-data:concept:delete',
  ONTOLOGY_DATA_RELATION_INSTANCE_LIST: 'ontology-data:relation:instance:list',
  ONTOLOGY_DATA_RELATION_CONCEPT_LIST: 'ontology-data:relation:concept:list',
  ONTOLOGY_DATA_RELATION_CONCEPT_CREATE: 'ontology-data:relation:concept:create',
  ONTOLOGY_DATA_RELATION_CONCEPT_DELETE: 'ontology-data:relation:concept:delete',
  ONTOLOGY_DATA_RELATION_INSTANCE_CREATE: 'ontology-data:relation:instance:create',
  ONTOLOGY_DATA_RELATION_INSTANCE_DELETE: 'ontology-data:relation:instance:delete',
  COLLAB_TOPOLOGY_GET: 'collaboration:topology:get',
  COLLAB_SESSION_LIST: 'collaboration:session:list',
  COLLAB_SESSION_CREATE: 'collaboration:session:create',
  COLLAB_SESSION_GET: 'collaboration:session:get',
  COLLAB_SESSION_ABORT: 'collaboration:session:abort',
  COLLAB_SESSION_EXECUTE: 'collaboration:session:execute',
  COLLAB_SESSION_MESSAGE_POST: 'collaboration:session:message:post',
  COLLAB_BLACKBOARD_GET: 'collaboration:blackboard:get',
  COLLAB_HUMAN_REVIEW: 'collaboration:human-review',
  COLLAB_EVENT: 'collaboration:event',
  TASTE_DETECTION_START: 'taste:detection:start',
  TASTE_DETECTION_MESSAGE: 'taste:detection:message',
  TASTE_DETECTION_ANALYZE: 'taste:detection:analyze',
  TASTE_DETECTION_DRAFT: 'taste:detection:draft',
  SANDBOX_APP_LIST: 'sandbox:app:list',
  DOCK_SHOW: 'dock:show',
  DOCK_HIDE: 'dock:hide',
  DOCK_ACTION: 'dock:action',
  DOCK_SYNC_APPS: 'dock:sync-apps',
  DOCK_SET_MOUSE_IGNORE: 'dock:set-mouse-ignore',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface WorkspaceUploadFileInput {
  name: string;
  content: ArrayBuffer | string;
  encoding?: 'arrayBuffer' | 'base64';
}

export interface WorkspaceUploadRequest {
  basePath: string;
  files: WorkspaceUploadFileInput[];
}

export interface WorkspaceUploadedFile {
  name: string;
  path: string;
  size: number;
}

export interface WorkspaceUploadResponse {
  files: WorkspaceUploadedFile[];
}

export type ExportableEntryType = 'skill' | 'agent' | 'role-agent';

export interface EntryExportRequest {
  entryType: ExportableEntryType;
  entryId: string;
}

export interface EntryExportResponse {
  zipPath: string;
}

export type {
  SkillEvolutionRequest,
  EvolutionResult as SkillEvolutionResult,
} from '../pi-agent/skill-evolution';

export type {
  SkillContentRequest,
  SkillContentResponse,
  SkillExecutionCompleteRequest,
  SkillExecutionCompleteResponse,
  SkillExecutionMessageRequest,
  SkillExecutionMessageResponse,
  SkillExecutionStartRequest,
  SkillExecutionStartResponse,
  SkillExecutionStreamEvent,
  SkillExecutionStreamRequest,
  SkillExecutionTimelineRequest,
  SkillExecutionTimelineResponse,
  SkillListRequest,
  SkillListResponse,
  SkillSessionsRequest,
  SkillSessionsResponse,
} from '../../features/skills/service';

export type {
  Project,
  ProjectListItem,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectQuery,
} from '../../../types/project';

export type {
  OntologyEntity,
  OntologyRelation,
} from '../../../types/ontology';

export type {
  UserAgent,
  UserSkill,
} from '../../features/user-registry';

// ── Project Agent IPC Types ──────────────────────────────────────────

export interface AgentProjectStartRequest {
  projectId: string;
  sessionId?: string;
  llmConfig?: import('../pi-agent/llm-config').RuntimeLLMConfig;
}

export interface AgentProjectStartResponse {
  status: unknown;
}

export interface AgentProjectMessageRequest {
  projectId: string;
  content: string;
  sessionId?: string;
  llmConfig?: import('../pi-agent/llm-config').RuntimeLLMConfig;
}

export interface AgentProjectMessageResponse {
  started: boolean;
}

export interface AgentProjectStopRequest {
  projectId: string;
}

export interface AgentProjectStopResponse {
  stopped: boolean;
}

export interface AgentProjectAbortRequest {
  projectId: string;
}

export interface AgentProjectAbortResponse {
  aborted: boolean;
}

export interface AgentProjectStreamEvent {
  projectId: string;
  type: 'user_message' | 'text_delta' | 'assistant_message' | 'tool_start' | 'tool_end' | 'done' | 'error';
  data: unknown;
}
