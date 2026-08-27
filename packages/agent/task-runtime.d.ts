export type PiTaskToolName =
  | 'task_plan'
  | 'task_checkpoint'
  | 'task_decompose'
  | 'task_update'
  | 'task_evidence'
  | 'task_decision'
  | 'task_complete';

export type PiTaskReadOnlyToolName =
  | 'task_next'
  | 'task_focus'
  | 'task_resume'
  | 'task_granularity_check'
  | 'task_list';

export type PiTaskAgentToolName = PiTaskToolName | PiTaskReadOnlyToolName;

export interface PiTaskExecutionScope {
  sessionId: string;
  expectedCursor: string | null;
  expectedRevision: number;
  bridgeEpoch: number;
}

export interface PiTaskCommand {
  version: 1;
  requestId: string;
  toolName: PiTaskToolName;
  scope: PiTaskExecutionScope;
  input: Record<string, unknown>;
}

export interface NormalizedPiTaskCommand extends PiTaskCommand {
  inputHash: string;
}

export interface PiTaskCompatibilityDescriptor {
  adapterContractVersion: number;
  runtimePackage: string;
  runtimeVersion: string;
  runtimeHostInvokeContractVersion: number;
  runtimePatchHash: string;
  taskExtensionPackage: string;
  taskExtensionVersion: string;
  taskExtensionContractVersion: number;
  taskExtensionFingerprint: string;
  taskLedgerEventVersion: number;
  taskStateEventVersion: number;
}

export interface PiTaskRuntimeError {
  version: 1;
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export interface PiTaskCompatibilityResult {
  compatible: boolean;
  mismatches: string[];
  error?: PiTaskRuntimeError;
}

export interface PiTaskSnapshot {
  version: 1;
  scope: unknown;
  stateHash: string;
  state: unknown;
  mutation?: unknown;
  truncation?: {
    originalSanitizedBytes: number;
    maxSnapshotBytes: number;
  };
}

export interface PiTaskBranchEntry {
  id: string;
  parentId: string | null;
  type: string;
  customType?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface PiTaskSessionScope {
  sessionId: string;
  cursor: string | null;
  revision: number;
  bridgeEpoch: number;
}

export interface PiTaskToolResult {
  content?: unknown;
  details?: unknown;
  isError?: boolean;
}

export interface PiTaskAgentToolDescriptor {
  readonly name: PiTaskAgentToolName;
  readonly label: string;
  readonly description: string;
  readonly promptSnippet?: string;
  readonly promptGuidelines?: readonly string[];
  readonly parameters: unknown;
  readonly mutation: boolean;
  execute(
    toolCallId: string,
    input: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
  ): Promise<PiTaskToolResult>;
}

export interface PiTaskSessionHostState {
  version: 1;
  reason: 'restore' | 'mutation' | 'compaction';
  scope: PiTaskSessionScope;
  snapshot: PiTaskSnapshot;
}

export interface PiTaskSessionPersistenceContext {
  reason: 'mutation' | 'compaction';
  scope: PiTaskSessionScope;
  appendedEntries: readonly PiTaskBranchEntry[];
}

export interface PiTaskSessionEntryIdContext {
  sessionId: string;
  bridgeEpoch: number;
  sequence: number;
  parentId: string | null;
  customType: string;
  data: unknown;
}

export interface PiTaskSessionHostOptions {
  sessionId: string;
  bridgeEpoch?: number;
  entries?: readonly PiTaskBranchEntry[];
  expectedCompatibility?: PiTaskCompatibilityDescriptor;
  getCompatibility?():
    | PiTaskCompatibilityDescriptor
    | Promise<PiTaskCompatibilityDescriptor>;
  createEntryId?(context: PiTaskSessionEntryIdContext): string;
  persistEntries(
    entries: readonly PiTaskBranchEntry[],
    context: PiTaskSessionPersistenceContext,
  ): void | Promise<void>;
  onDiagnostic?(diagnostic: {
    level: 'info' | 'warning' | 'error';
    code: string;
    message: string;
  }): void;
  stateEventTimeoutMs?: number;
  sanitizeLimits?: Record<string, number>;
}

export interface PiTaskSessionCheckpointOptions {
  expectedScope?: PiTaskExecutionScope;
  reason?: string;
}

export interface PiTaskSessionHost {
  restore(entries: readonly PiTaskBranchEntry[]): Promise<PiTaskSessionHostState>;
  getSnapshot(): PiTaskSnapshot;
  getScope(): PiTaskSessionScope;
  getAgentTools(): readonly PiTaskAgentToolDescriptor[];
  invoke(command: PiTaskCommand): Promise<PiTaskCommandResult>;
  subscribeState(listener: (state: PiTaskSessionHostState) => void): () => void;
  checkpoint(options?: PiTaskSessionCheckpointOptions): Promise<PiTaskSessionHostState>;
  invalidate(): void;
}

export interface RegisteredTaskToolInvocationRequest {
  toolCallId: string;
  toolName: PiTaskToolName;
  input: Record<string, unknown>;
}

export interface RegisteredTaskToolInvocationResult {
  toolCallId: string;
  toolName: string;
  result: {
    content?: unknown;
    details?: unknown;
    isError?: boolean;
  };
  isError: boolean;
}

export interface PiTaskCommandResult {
  version: 1;
  requestId: string;
  toolCallId: string;
  taskId?: string;
  revisionBefore: number;
  revisionAfter: number;
  cursorBefore: string | null;
  cursorAfter: string;
  eventId: string;
  stateHash: string;
  replayed: boolean;
  snapshot: PiTaskSnapshot;
  isError: false;
}

export interface PiTaskRuntimeBridgeOptions {
  expectedCompatibility: PiTaskCompatibilityDescriptor;
  sessionId: string;
  bridgeEpoch?: number;
  stateEventTimeoutMs?: number;
  sanitizeLimits?: Record<string, number>;
  getCompatibility(): PiTaskCompatibilityDescriptor | Promise<PiTaskCompatibilityDescriptor>;
  getCurrentScope():
    | { sessionId: string; cursor: string | null }
    | Promise<{ sessionId: string; cursor: string | null }>;
  abortHostInvocation(): void | Promise<void>;
  isCursorOnCurrentBranch(cursor: string | null): boolean;
  invokeRegisteredTool(
    request: RegisteredTaskToolInvocationRequest,
  ): RegisteredTaskToolInvocationResult | Promise<RegisteredTaskToolInvocationResult>;
}

export interface PiTaskRuntimeBridge {
  readonly bridgeEpoch: number;
  extension(pi: {
    on(event: string, handler: (payload: unknown) => unknown): unknown;
    events: {
      on(channel: string, handler: (payload: unknown) => void): () => void;
    };
  }): void;
  gateway: {
    readonly bridgeEpoch: number;
    invoke(command: PiTaskCommand): Promise<PiTaskCommandResult>;
  };
  invalidate(): void;
}

export const DEFAULT_SANITIZE_LIMITS: Readonly<{
  maxArrayItems: number;
  maxDepth: number;
  maxObjectKeys: number;
  maxSnapshotBytes: number;
  maxStringLength: number;
}>;
export const PI_TASK_COMPATIBILITY_REQUIREMENTS: Readonly<Record<string, string | number>>;
export const PI_TASK_CONTRACT_VERSION: 1;
export const PI_TASK_SNAPSHOT_VERSION: 1;
export const PI_TASK_STATE_EVENT_NAME: 'pi-tasks:state';
export const PI_TASK_STATE_EVENT_VERSION: 2;
export const PI_TASK_AGENT_TOOL_NAMES: readonly PiTaskAgentToolName[];
export const PI_TASK_READ_ONLY_TOOL_NAMES: readonly PiTaskReadOnlyToolName[];
export const PI_TASK_SESSION_HOST_COMPATIBILITY: Readonly<PiTaskCompatibilityDescriptor>;
export const PI_TASK_TOOL_NAMES: readonly PiTaskToolName[];

export function isAllowedPiTaskTool(value: unknown): value is PiTaskToolName;
export function assertAllowedPiTaskTool(value: unknown): PiTaskToolName;
export function normalizePiTaskCommand(command: PiTaskCommand): NormalizedPiTaskCommand;
export function evaluatePiTaskCompatibility(
  actual: PiTaskCompatibilityDescriptor,
  expected: PiTaskCompatibilityDescriptor,
): PiTaskCompatibilityResult;
export function assertPiTaskCompatibility(
  actual: PiTaskCompatibilityDescriptor,
  expected: PiTaskCompatibilityDescriptor,
): PiTaskCompatibilityDescriptor;
export function createPiTaskCompatibilityGuard(expected: PiTaskCompatibilityDescriptor): {
  readonly expected: Readonly<PiTaskCompatibilityDescriptor>;
  evaluate(actual: PiTaskCompatibilityDescriptor): PiTaskCompatibilityResult;
  assert(actual: PiTaskCompatibilityDescriptor): PiTaskCompatibilityDescriptor;
};
export function createPiTaskRuntimeBridge(options: PiTaskRuntimeBridgeOptions): PiTaskRuntimeBridge;
export function createPiTaskSessionHost(
  options: PiTaskSessionHostOptions,
): Promise<PiTaskSessionHost>;
export function mapPiTaskRuntimeError(error: unknown, fallbackCode?: string): PiTaskRuntimeError;
export function sanitizeTaskRuntimeValue(value: unknown, options?: Record<string, number>): unknown;
export function createBoundedPiTaskSnapshot(
  snapshot: Record<string, unknown>,
  options?: Record<string, number>,
): PiTaskSnapshot;
export function stableJsonStringify(value: unknown): string;
export function stableJsonHash(value: unknown): string;
