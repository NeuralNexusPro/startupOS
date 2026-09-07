import originosPiTasks, {
  ORIGINOS_PI_TASKS_VERSION,
  PI_TASK_SCHEMA_FINGERPRINT,
  PI_TASK_STATE_EVENT_VERSION as CONTROLLED_STATE_EVENT_VERSION,
  TASK_STATE_EVENT,
} from '@originos/pi-tasks';
import {
  PI_TASK_COMPATIBILITY_REQUIREMENTS,
  PI_TASK_STATE_EVENT_NAME,
  createPiTaskRuntimeBridge,
  stableJsonHash,
  type PiTaskCommandResult,
  type PiTaskRuntimeBridge,
  type PiTaskToolName,
  type RegisteredTaskToolInvocationResult,
} from '@originos/pi-agent-adapter/task-runtime';

type JsonObject = Record<string, unknown>;

interface PublicSchema extends JsonObject {
  additionalProperties?: boolean;
  anyOf?: PublicSchema[];
  const?: unknown;
  enum?: unknown[];
  items?: PublicSchema;
  minimum?: number;
  minLength?: number;
  not?: PublicSchema;
  oneOf?: PublicSchema[];
  properties?: Record<string, PublicSchema>;
  required?: string[];
  type?: string | string[];
}

interface PublicToolResult {
  content?: Array<{ type?: string; text?: string }>;
  details?: JsonObject;
  isError?: boolean;
}

interface PublicToolDefinition {
  name: string;
  parameters: PublicSchema;
  execute(
    toolCallId: string,
    params: JsonObject,
    signal: AbortSignal | undefined,
    onUpdate: (update: unknown) => void,
    context: PublicExtensionContext,
  ): Promise<PublicToolResult>;
}

export interface PublicBranchEntry {
  id: string;
  parentId: string | null;
  type: 'custom' | 'message';
  customType?: string;
  data?: unknown;
  role?: string;
}

interface PublicTaskStateEvent {
  version: 2;
  reason: 'session_start' | 'session_tree' | 'task_mutation' | 'compaction';
  widgetId: 'pi-tasks';
  scope: {
    sessionId: string;
    cursor: string | null;
    revision: number;
  };
  mutation?: {
    requestId: string;
    command: string;
    eventId: string;
    receipt?: JsonObject;
  };
  stateHash: string;
  state: {
    tasks?: Record<string, JsonObject>;
    [key: string]: unknown;
  };
}

interface PublicExtensionContext {
  mode: 'rpc';
  sessionManager: {
    getBranch(): PublicBranchEntry[];
    getSessionId(): string;
  };
  ui: {
    notify(message: string, level?: string): void;
    setStatus(key: string, value: string | undefined): void;
    setWidget(key: string, value: unknown, options?: unknown): void;
  };
}

type LifecycleHandler = (
  event: JsonObject,
  context: PublicExtensionContext,
) => Promise<unknown> | unknown;

interface PublicExtensionApi {
  appendEntry(customType: string, data: unknown): void;
  events: PublicEventBus;
  on(name: string, handler: LifecycleHandler): void;
  registerCommand(name: string, command: unknown): void;
  registerTool(tool: PublicToolDefinition): void;
}

interface PublicTaskCommand {
  version: 1;
  requestId: string;
  toolName: string;
  scope: {
    sessionId: string;
    expectedCursor: string | null;
    expectedRevision: number;
    bridgeEpoch: number;
  };
  input: JsonObject;
}

interface HarnessOptions {
  appendMessageAfterTool?: boolean;
  bridgeEpoch?: number;
  denyToolName?: string;
  hostNeverSettles?: boolean;
  incompatibleRuntimeVersion?: string;
  initialBranch?: PublicBranchEntry[];
  muteTaskStateEvents?: boolean;
  sessionId?: string;
  stateEventTimeoutMs?: number;
}

interface PublicEventBus {
  emit(channel: string, payload: unknown): void;
  on(channel: string, handler: (payload: unknown) => void): () => void;
}

interface MutableEventBus extends PublicEventBus {
  listenerCount(channel: string): number;
  setMuted(channel: string, muted: boolean): void;
}

interface RuntimeEvent {
  type: string;
  toolCallId: string;
  toolName: string;
  result?: PublicToolResult;
}

export const A02_CONTRACT_CASE_MATRIX = Object.freeze([
  { id: 'TC-C1', coverage: 'public command pipeline, schema, permission, receipt/state' },
  { id: 'TC-C2', coverage: 'current-branch replay, isolation, restart, compaction' },
  { id: 'A02-SCOPE', coverage: 'Session, branch, busy, and commit scope guards' },
  { id: 'A02-EVENT', coverage: 'bounded public state event confirmation' },
  { id: 'A02-IDEMPOTENCY', coverage: 'request replay and payload conflict' },
  { id: 'A02-EVIDENCE-GATE', coverage: 'missing/forced evidence and valid completion' },
  { id: 'A02-EPOCH', coverage: 'reload invalidation and host abort' },
  { id: 'A02-HISTORY', coverage: 'no orphan conversation messages' },
  { id: 'A02-COMPATIBILITY', coverage: 'version mismatch fails closed' },
  { id: 'A02-STATIC-BOUNDARY', coverage: 'public imports only' },
]);

export const TASK_PLAN_INPUT: JsonObject = {
  title: 'A-02 Core public contract',
  objective: 'Verify controlled task mutation in the current Pi Session branch',
  acceptance_criteria: ['A public state event confirms the controlled mutation'],
  plan_steps: [{
    text: 'Exercise the public command contract',
    expectedOutput: 'A correlated receipt and state event',
    allowedActions: ['invoke public task command'],
    evidenceRequired: true,
    decompositionStatus: 'atomic',
    granularityCheck: {
      isAtomic: true,
      reason: 'One command has one observable state transition',
      canBeDoneInOneAgentAction: true,
      hasSingleObservableOutput: true,
      hasSingleVerificationMethod: true,
      hasNoHiddenSubtasks: true,
    },
  }],
  activate: true,
};

export const TASK_EVIDENCE_INPUT: JsonObject = {
  task_id: 'T1',
  type: 'test',
  level: 'unit_test',
  summary: 'The A-02 public Core contract suite passed',
  passed: 'true',
  references: ['contract://a02/core-public-boundary'],
  criterion_ids: ['T1-AC1'],
  step_ids: ['T1-S1'],
  quality: {
    source: 'core-vitest-contract',
    reproducible: true,
    verifier: 'tool',
    artifactRefs: ['contract://a02/core-public-boundary'],
    observedOutput: 'Receipt and state event are correlated',
  },
};

export function stepDoneInput(evidenceId: string): JsonObject {
  return {
    task_id: 'T1',
    step_id: 'T1-S1',
    step_status: 'done',
    step_evidence_ids: [evidenceId],
    progress: 99,
    next_action: 'Complete the evidence-gated task',
  };
}

export function completeInput(evidenceIds: string[]): JsonObject {
  return {
    task_id: 'T1',
    summary: 'A-02 public contract is complete',
    evidence_ids: evidenceIds,
    criterion_results: [{
      criterionId: 'T1-AC1',
      status: 'satisfied',
      evidenceIds,
    }],
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isObject(value);
  if (type === 'integer') return Number.isSafeInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function validateSchema(value: unknown, schema: PublicSchema, at = '$'): string[] {
  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    return [`${at} must equal the schema constant`];
  }
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    return [`${at} is outside the allowed enum`];
  }
  if (schema.anyOf && !schema.anyOf.some((candidate) => validateSchema(value, candidate, at).length === 0)) {
    return [`${at} does not match any allowed schema`];
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (candidate) => validateSchema(value, candidate, at).length === 0,
    );
    if (matches.length !== 1) return [`${at} does not match exactly one schema`];
  }
  if (schema.not && validateSchema(value, schema.not, at).length === 0) {
    return [`${at} matches a forbidden schema`];
  }
  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowedTypes.some((type) => matchesType(value, type))) {
      return [`${at} must be ${allowedTypes.join(' or ')}`];
    }
  }
  if (typeof value === 'string' && schema.minLength !== undefined && value.length < schema.minLength) {
    return [`${at} is shorter than ${schema.minLength}`];
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    return [`${at} is less than ${schema.minimum}`];
  }
  if (Array.isArray(value) && schema.items) {
    return value.flatMap((item, index) => validateSchema(item, schema.items!, `${at}[${index}]`));
  }
  if (isObject(value) && schema.properties) {
    const issues: string[] = [];
    for (const required of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) {
        issues.push(`${at}.${required} is required`);
      }
    }
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = schema.properties[key];
      if (!propertySchema) {
        if (schema.additionalProperties === false) issues.push(`${at}.${key} is not allowed`);
        continue;
      }
      issues.push(...validateSchema(propertyValue, propertySchema, `${at}.${key}`));
    }
    return issues;
  }
  return [];
}

function createEventBus(
  onPayload: (channel: string, payload: unknown) => void,
): MutableEventBus {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const muted = new Set<string>();
  return {
    emit(channel, payload) {
      if (muted.has(channel)) return;
      onPayload(channel, payload);
      for (const handler of handlers.get(channel) ?? []) handler(payload);
    },
    on(channel, handler) {
      const channelHandlers = handlers.get(channel) ?? new Set();
      channelHandlers.add(handler);
      handlers.set(channel, channelHandlers);
      return () => {
        channelHandlers.delete(handler);
        if (channelHandlers.size === 0) handlers.delete(channel);
      };
    },
    listenerCount(channel) {
      return handlers.get(channel)?.size ?? 0;
    },
    setMuted(channel, value) {
      if (value) muted.add(channel);
      else muted.delete(channel);
    },
  };
}

function compatibility(runtimeVersion?: string): JsonObject {
  return {
    ...PI_TASK_COMPATIBILITY_REQUIREMENTS,
    runtimeVersion: runtimeVersion ?? PI_TASK_COMPATIBILITY_REQUIREMENTS.runtimeVersion,
    runtimePatchHash: 'a'.repeat(64),
    taskExtensionVersion: ORIGINOS_PI_TASKS_VERSION,
    taskExtensionFingerprint: stableJsonHash(PI_TASK_SCHEMA_FINGERPRINT),
    taskStateEventVersion: CONTROLLED_STATE_EVENT_VERSION,
  };
}

function errorResult(
  toolCallId: string,
  toolName: string,
  code: string,
  details: JsonObject = {},
): RegisteredTaskToolInvocationResult {
  return {
    toolCallId,
    toolName,
    isError: true,
    result: {
      content: [],
      details: { code, ...details },
      isError: true,
    },
  };
}

export class ControlledPiTaskHarness {
  readonly commands = new Map<string, unknown>();
  readonly hookCalls: string[] = [];
  readonly messages: unknown[] = [];
  readonly runtimeEvents: RuntimeEvent[] = [];
  readonly sessionId: string;
  readonly tools = new Map<string, PublicToolDefinition>();

  private abortCallCount = 0;
  private branch: PublicBranchEntry[];
  private bridge: PiTaskRuntimeBridge;
  private busy = false;
  private cursorSequence: number;
  private disposed = false;
  private lastReceipt?: JsonObject;
  private latestStateEvent?: PublicTaskStateEvent;
  private executedToolCount = 0;
  private readonly lifecycle = new Map<string, LifecycleHandler[]>();
  private readonly options: HarnessOptions;
  private readonly context: PublicExtensionContext;
  private readonly events: MutableEventBus;

  private constructor(options: HarnessOptions) {
    this.options = options;
    this.sessionId = options.sessionId ?? 'a02-core-contract-session';
    this.branch = clone(options.initialBranch ?? []);
    this.cursorSequence = this.branch.length;
    this.events = createEventBus((channel, payload) => {
      if (channel === TASK_STATE_EVENT && isObject(payload)) {
        this.latestStateEvent = clone(payload as unknown as PublicTaskStateEvent);
      }
    });
    this.events.setMuted(TASK_STATE_EVENT, options.muteTaskStateEvents === true);
    this.context = {
      mode: 'rpc',
      sessionManager: {
        getBranch: () => this.branch,
        getSessionId: () => this.sessionId,
      },
      ui: {
        notify: () => undefined,
        setStatus: () => undefined,
        setWidget: () => undefined,
      },
    };

    const api: PublicExtensionApi = {
      appendEntry: (customType, data) => {
        this.cursorSequence += 1;
        this.branch.push({
          id: `contract-cursor-${this.cursorSequence}`,
          parentId: this.currentCursor,
          type: 'custom',
          customType,
          data: clone(data),
        });
      },
      events: this.events,
      on: (name, handler) => {
        const handlers = this.lifecycle.get(name) ?? [];
        handlers.push(handler);
        this.lifecycle.set(name, handlers);
      },
      registerCommand: (name, command) => this.commands.set(name, command),
      registerTool: (tool) => this.tools.set(tool.name, tool),
    };

    originosPiTasks(api as never);
    const expectedCompatibility = compatibility();
    this.bridge = createPiTaskRuntimeBridge({
      sessionId: this.sessionId,
      bridgeEpoch: options.bridgeEpoch ?? 7,
      stateEventTimeoutMs: options.stateEventTimeoutMs ?? 50,
      expectedCompatibility: expectedCompatibility as never,
      getCompatibility: () => compatibility(options.incompatibleRuntimeVersion) as never,
      getCurrentScope: () => ({
        sessionId: this.sessionId,
        cursor: this.currentCursor,
      }),
      abortHostInvocation: () => {
        this.abortCallCount += 1;
      },
      isCursorOnCurrentBranch: (cursor) => (
        cursor === null
          ? this.branch.length === 0
          : this.branch.some((entry) => entry.id === cursor)
      ),
      invokeRegisteredTool: (request) => this.invokeRegisteredTool(request),
    });
    this.bridge.extension(api as never);
  }

  static async create(options: HarnessOptions = {}): Promise<ControlledPiTaskHarness> {
    const harness = new ControlledPiTaskHarness(options);
    await harness.emitLifecycle('session_start');
    return harness;
  }

  get abortCalls(): number {
    return this.abortCallCount;
  }

  get branchEntries(): PublicBranchEntry[] {
    return clone(this.branch);
  }

  get currentCursor(): string | null {
    return this.branch.at(-1)?.id ?? null;
  }

  get currentRevision(): number {
    const eventRevision = this.latestStateEvent?.scope.revision ?? 0;
    const receiptRevision = this.lastReceipt?.revisionAfter;
    return typeof receiptRevision === 'number'
      ? Math.max(eventRevision, receiptRevision)
      : eventRevision;
  }

  get currentScope(): PublicTaskCommand['scope'] {
    return {
      sessionId: this.sessionId,
      expectedCursor: this.currentCursor,
      expectedRevision: this.currentRevision,
      bridgeEpoch: this.bridge.bridgeEpoch,
    };
  }

  get latestState(): PublicTaskStateEvent | undefined {
    return this.latestStateEvent ? clone(this.latestStateEvent) : undefined;
  }

  get publicStateListenerCount(): number {
    return this.events.listenerCount(PI_TASK_STATE_EVENT_NAME);
  }

  get runtimeEventTypes(): string[] {
    return this.runtimeEvents.map(({ type }) => type);
  }

  get stateHash(): string | undefined {
    const receiptHash = this.lastReceipt?.stateHash;
    return typeof receiptHash === 'string' ? receiptHash : this.latestStateEvent?.stateHash;
  }

  get toolExecutions(): number {
    return this.executedToolCount;
  }

  command(
    toolName: PiTaskToolName,
    input: JsonObject,
    requestId: string,
  ): PublicTaskCommand {
    return {
      version: 1,
      requestId,
      toolName,
      scope: this.currentScope,
      input: clone(input),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bridge.invalidate();
  }

  async emitLifecycle(name: string): Promise<void> {
    for (const handler of this.lifecycle.get(name) ?? []) {
      await handler({}, this.context);
    }
  }

  invalidate(): void {
    this.bridge.invalidate();
  }

  async invoke(
    toolName: PiTaskToolName,
    input: JsonObject,
    requestId: string,
  ): Promise<PiTaskCommandResult & { snapshot: PublicTaskStateEvent }> {
    return this.invokeCommand(this.command(toolName, input, requestId));
  }

  async invokeCommand(
    command: PublicTaskCommand,
  ): Promise<PiTaskCommandResult & { snapshot: PublicTaskStateEvent }> {
    return this.bridge.gateway.invoke(command as never) as Promise<
      PiTaskCommandResult & { snapshot: PublicTaskStateEvent }
    >;
  }

  async invokeReadOnly(
    toolName: string,
    input: JsonObject,
    toolCallId: string,
  ): Promise<RegisteredTaskToolInvocationResult> {
    return this.invokeRegisteredTool({ toolCallId, toolName, input } as never);
  }

  muteTaskStateEvents(muted: boolean): void {
    this.events.setMuted(TASK_STATE_EVENT, muted);
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
  }

  task(taskId: string): JsonObject | undefined {
    const task = this.latestStateEvent?.state.tasks?.[taskId];
    return task ? clone(task) : undefined;
  }

  private async invokeRegisteredTool(request: {
    toolCallId: string;
    toolName: string;
    input: JsonObject;
  }): Promise<RegisteredTaskToolInvocationResult> {
    if (this.busy) {
      const error = new Error('AgentSession is busy') as Error & { code?: string };
      error.code = 'SESSION_BUSY';
      throw error;
    }
    if (this.options.hostNeverSettles) return new Promise(() => undefined);

    const tool = this.tools.get(request.toolName);
    if (!tool) {
      const error = new Error('Registered tool is not active') as Error & { code?: string };
      error.code = 'TOOL_NOT_ACTIVE';
      throw error;
    }

    this.runtimeEvents.push({
      type: 'tool_execution_start',
      toolCallId: request.toolCallId,
      toolName: request.toolName,
    });
    const finish = (
      result: PublicToolResult,
    ): RegisteredTaskToolInvocationResult => {
      this.runtimeEvents.push({
        type: 'tool_execution_end',
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        result,
      });
      return {
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        result,
        isError: result.isError === true,
      };
    };

    const schemaIssues = validateSchema(request.input, tool.parameters);
    if (schemaIssues.length > 0) {
      return finish(errorResult(
        request.toolCallId,
        request.toolName,
        'VALIDATION_FAILED',
        { issues: schemaIssues.slice(0, 8) },
      ).result as PublicToolResult);
    }

    this.hookCalls.push(`before:${request.toolName}`);
    for (const handler of this.lifecycle.get('tool_call') ?? []) {
      const decision = await handler({
        toolName: request.toolName,
        input: request.input,
      }, this.context);
      if (isObject(decision) && decision.block === true) {
        return finish(errorResult(
          request.toolCallId,
          request.toolName,
          'PERMISSION_DENIED',
        ).result as PublicToolResult);
      }
    }
    if (this.options.denyToolName === request.toolName) {
      return finish(errorResult(
        request.toolCallId,
        request.toolName,
        'PERMISSION_DENIED',
      ).result as PublicToolResult);
    }

    this.executedToolCount += 1;
    const result = await tool.execute(
      request.toolCallId,
      request.input,
      new AbortController().signal,
      () => undefined,
      this.context,
    );
    if (isObject(result.details?.mutationReceipt)) {
      this.lastReceipt = clone(result.details.mutationReceipt);
    }
    if (this.options.appendMessageAfterTool) {
      this.cursorSequence += 1;
      this.branch.push({
        id: `contract-cursor-${this.cursorSequence}`,
        parentId: this.currentCursor,
        type: 'message',
        role: 'user',
      });
    }
    this.hookCalls.push(`after:${request.toolName}`);
    return finish(result);
  }
}
