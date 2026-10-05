/**
 * Electron Integration Facade
 *
 * Public API for the Electron integration surface. Aggregates the most
 * consumed symbols from env / ipc-protocol / window / local-fs /
 * local-agent. Explicit re-exports only (no `export *`
 * of whole directories); implementation files stay the source of truth.
 *
 * workspace-paths 不进入本门面：其顶层 `node:path` / `node:fs` 导入一旦被
 * 门面连带打包进浏览器 bundle，会在客户端以 `require is not defined` 崩溃
 * （dev electron 混合渲染场景）。消费方一律走深路径
 * `@originos/core/lib/integrations/electron/workspace-paths`。
 *
 * Consumers may still use deep-path entries (e.g.
 * `@originos/core/lib/integrations/electron/ipc-protocol`) — those remain
 * explicit exports entries as a transitional state (AG.11 will continue
 * consolidating deep paths into facades).
 */

export { isElectron, getElectronBridge, getIpcRenderer } from './env';
export type { ElectronBridge } from './env';

export {
  IPC_CHANNELS,
} from './ipc-protocol';
export type {
  IpcChannel,
  IpcResponse,
  WorkspaceUploadFileInput,
  WorkspaceUploadRequest,
  WorkspaceUploadedFile,
  WorkspaceUploadResponse,
  ExportableEntryType,
  EntryExportRequest,
  EntryExportResponse,
  AgentProjectStartRequest,
  AgentProjectStartResponse,
  AgentProjectMessageRequest,
  AgentProjectMessageResponse,
  AgentProjectStopRequest,
  AgentProjectStopResponse,
  AgentProjectAbortRequest,
  AgentProjectAbortResponse,
  AgentProjectStreamEvent,
} from './ipc-protocol';
export type {
  SkillEvolutionRequest,
  SkillEvolutionResult,
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
} from './ipc-protocol';
export type {
  Project,
  ProjectListItem,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectQuery,
} from './ipc-protocol';
export type {
  OntologyEntity,
  OntologyRelation,
} from './ipc-protocol';
export type {
  UserAgent,
  UserSkill,
} from './ipc-protocol';

export {
  createNativeWindow,
  closeNativeWindow,
  focusNativeWindow,
  minimizeNativeWindow,
  maximizeNativeWindow,
  subscribeToNativeWindowClosed,
  sendDockAction,
  syncDockApps,
  onDockAppsSync,
} from './window';
export type { NativeWindowConfig } from './window';

export {
  readLocalFile,
  writeLocalFile,
  listLocalFiles,
  deleteLocalFile,
  watchLocalPath,
  unwatchLocalPath,
  subscribeToLocalFsChanges,
} from './local-fs';
export type { ElectronFileEntry, ElectronReadFileResult } from './local-fs';

export {
  startLocalAgent,
  stopLocalAgent,
  sendLocalAgentMessage,
  abortLocalAgent,
  subscribeToLocalAgentEvents,
} from './local-agent';
export type { LocalAgentConfig, LocalAgentEventEnvelope } from './local-agent';
