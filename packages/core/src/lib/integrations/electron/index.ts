/**
 * Electron Integration Facade
 *
 * Public API for the Electron integration surface. Aggregates the most
 * consumed symbols from env / ipc-protocol / window / local-fs /
 * local-agent / workspace-paths. Explicit re-exports only (no `export *`
 * of whole directories); implementation files stay the source of truth.
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

export {
  resolveWorkspaceBasePath,
  isPathWithin,
  assertSafeWorkspaceFileName,
  assertRealPathWithin,
  assertWorkspacePathCanBeCreated,
  writeWorkspaceUploadFile,
} from './workspace-paths';
