'use strict';

const {
  createBoundedPiTaskSnapshot,
  createPiTaskCompatibilityGuard,
  createPiTaskRuntimeBridge,
  mapPiTaskRuntimeError,
  stableJsonHash,
} = require('./index');

const PI_TASK_READ_ONLY_TOOL_NAMES = Object.freeze([
  'task_next',
  'task_focus',
  'task_resume',
  'task_granularity_check',
  'task_list',
]);

const PI_TASK_AGENT_TOOL_NAMES = Object.freeze([
  'task_plan',
  ...PI_TASK_READ_ONLY_TOOL_NAMES,
  'task_checkpoint',
  'task_decompose',
  'task_update',
  'task_evidence',
  'task_decision',
  'task_complete',
]);

const PI_TASK_AGENT_TOOL_NAME_SET = new Set(PI_TASK_AGENT_TOOL_NAMES);
const PI_TASK_MUTATION_TOOL_NAME_SET = new Set([
  'task_plan',
  'task_checkpoint',
  'task_decompose',
  'task_update',
  'task_evidence',
  'task_decision',
  'task_complete',
]);

const CONTROLLED_RUNTIME_PATCH_HASH =
  '213b1f2db610720ca0dde1853abbe02975185ad37c95eb517031844631371674';
const CONTROLLED_TASK_EXTENSION_FINGERPRINT =
  'c900eb1fc776fd0c2ed28d076374a0253d6cb01963590f0930591725b9bb99e0';

const PI_TASK_SESSION_HOST_COMPATIBILITY = Object.freeze({
  adapterContractVersion: 1,
  runtimePackage: '@earendil-works/pi-coding-agent',
  runtimeVersion: '0.80.10',
  runtimeHostInvokeContractVersion: 1,
  runtimePatchHash: CONTROLLED_RUNTIME_PATCH_HASH,
  taskExtensionPackage: '@originos/pi-tasks',
  taskExtensionVersion: '0.2.0-originos.1',
  taskExtensionContractVersion: 2,
  taskExtensionFingerprint: CONTROLLED_TASK_EXTENSION_FINGERPRINT,
  taskLedgerEventVersion: 2,
  taskStateEventVersion: 2,
});

function createSessionHostError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch (cause) {
    throw createSessionHostError(
      'INVALID_BRANCH_ENTRY',
      `${label} must contain structured-clone compatible values`,
      { cause: cause instanceof Error ? cause.name : 'CloneError' },
    );
  }
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function normalizeNonEmptyString(value, field, maxLength = 512) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw createSessionHostError(
      'INVALID_SESSION_HOST_OPTIONS',
      `${field} must be a non-empty string up to ${maxLength} characters`,
    );
  }
  return value;
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    throw createSessionHostError('INVALID_BRANCH_ENTRY', 'Task Session entries must be an array');
  }
  const ids = new Set();
  return entries.map((source, index) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw createSessionHostError(
        'INVALID_BRANCH_ENTRY',
        `Task Session entry ${index} must be an object`,
      );
    }
    const entry = clone(source, `Task Session entry ${index}`);
    normalizeNonEmptyString(entry.id, `entries[${index}].id`);
    normalizeNonEmptyString(entry.type, `entries[${index}].type`);
    if (entry.parentId !== null && typeof entry.parentId !== 'string') {
      throw createSessionHostError(
        'INVALID_BRANCH_ENTRY',
        `entries[${index}].parentId must be a string or null`,
      );
    }
    if (ids.has(entry.id)) {
      throw createSessionHostError(
        'INVALID_BRANCH_ENTRY',
        `Task Session entry id is duplicated: ${entry.id}`,
      );
    }
    ids.add(entry.id);
    return entry;
  });
}

function branchLeaf(entries) {
  return entries.length === 0 ? null : entries.at(-1).id;
}

function createEventBus() {
  const handlers = new Map();
  return Object.freeze({
    emit(channel, payload) {
      for (const handler of handlers.get(channel) ?? []) handler(payload);
    },
    on(channel, handler) {
      if (typeof handler !== 'function') {
        throw new TypeError('Task Session event handler must be a function');
      }
      const channelHandlers = handlers.get(channel) ?? new Set();
      channelHandlers.add(handler);
      handlers.set(channel, channelHandlers);
      return () => {
        channelHandlers.delete(handler);
        if (channelHandlers.size === 0) handlers.delete(channel);
      };
    },
  });
}

function mapStateReason(reason) {
  if (reason === 'task_mutation') return 'mutation';
  if (reason === 'compaction') return 'compaction';
  return 'restore';
}

function validateExpectedScope(expectedScope, actualScope) {
  if (expectedScope === undefined) return;
  if (!expectedScope || typeof expectedScope !== 'object' || Array.isArray(expectedScope)) {
    throw createSessionHostError('INVALID_COMMAND', 'Expected checkpoint scope must be an object');
  }
  if (expectedScope.sessionId !== actualScope.sessionId) {
    throw createSessionHostError('SESSION_MISMATCH', 'Checkpoint belongs to another Session');
  }
  if (expectedScope.bridgeEpoch !== actualScope.bridgeEpoch) {
    throw createSessionHostError('BRIDGE_EPOCH_STALE', 'Checkpoint bridge epoch is stale');
  }
  if (expectedScope.expectedCursor !== actualScope.cursor) {
    throw createSessionHostError('BRANCH_CONFLICT', 'Checkpoint branch cursor is stale');
  }
  if (expectedScope.expectedRevision !== actualScope.revision) {
    throw createSessionHostError('REVISION_CONFLICT', 'Checkpoint revision is stale');
  }
}

function toolErrorResult(error) {
  const mapped = mapPiTaskRuntimeError(error);
  const reason = mapped.details && typeof mapped.details.reason === 'string'
    ? mapped.details.reason.slice(0, 500)
    : undefined;
  return {
    isError: true,
    content: [{
      type: 'text',
      text: reason ? `${mapped.message}: ${reason}` : mapped.message,
    }],
    details: mapped,
  };
}

function normalizeRuntimeSchema(value) {
  if (Array.isArray(value)) return value.map(normalizeRuntimeSchema);
  if (!value || typeof value !== 'object') return value;
  const normalized = {};
  for (const [key, child] of Object.entries(value)) {
    normalized[key] = normalizeRuntimeSchema(child);
  }
  if (
    Array.isArray(value.type) &&
    value.type.includes('string') &&
    value.type.includes('null') &&
    Number.isSafeInteger(value.minLength)
  ) {
    const { type: _type, minLength, maxLength, ...metadata } = normalized;
    return {
      ...metadata,
      anyOf: [
        {
          type: 'string',
          minLength,
          ...(Number.isSafeInteger(maxLength) ? { maxLength } : {}),
        },
        { type: 'null' },
      ],
    };
  }
  return normalized;
}

function mutationToolResult(result) {
  return {
    isError: false,
    content: [{
      type: 'text',
      text: [
        `${result.requestId} committed at task revision ${result.revisionAfter}.`,
        'Use task_focus or task_resume to inspect the canonical execution contract.',
      ].join('\n'),
    }],
    details: {
      taskRuntime: result,
    },
  };
}

async function loadPublicRuntimeContracts() {
  const [runtime, taskExtension] = await Promise.all([
    import('@earendil-works/pi-agent-core'),
    import('@originos/pi-tasks'),
  ]);
  if (typeof runtime.invokeRegisteredToolCall !== 'function') {
    throw createSessionHostError(
      'INCOMPATIBLE_RUNTIME',
      'Pi Runtime does not expose the public registered-tool invocation contract',
    );
  }
  if (typeof taskExtension.default !== 'function') {
    throw createSessionHostError(
      'INCOMPATIBLE_RUNTIME',
      'The controlled pi-tasks package does not expose a public extension entry',
    );
  }
  return { runtime, taskExtension };
}

function deriveCompatibility(runtime, taskExtension) {
  const runtimeContractAvailable = typeof runtime.invokeRegisteredToolCall === 'function';
  const schemaMatches = taskExtension.PI_TASK_SCHEMA_FINGERPRINT ===
    'originos-pi-tasks/v1:event-v2:cas:receipt:evidence-gate-no-force';
  return {
    adapterContractVersion: 1,
    runtimePackage: '@earendil-works/pi-coding-agent',
    runtimeVersion: '0.80.10',
    runtimeHostInvokeContractVersion: runtimeContractAvailable ? 1 : 0,
    runtimePatchHash: runtimeContractAvailable
      ? CONTROLLED_RUNTIME_PATCH_HASH
      : '0'.repeat(64),
    taskExtensionPackage: '@originos/pi-tasks',
    taskExtensionVersion: taskExtension.ORIGINOS_PI_TASKS_VERSION ?? 'unknown',
    taskExtensionContractVersion: taskExtension.PI_TASK_EVENT_VERSION ?? 0,
    taskExtensionFingerprint: schemaMatches
      ? CONTROLLED_TASK_EXTENSION_FINGERPRINT
      : stableJsonHash({ schema: taskExtension.PI_TASK_SCHEMA_FINGERPRINT ?? null }),
    taskLedgerEventVersion: taskExtension.PI_TASK_EVENT_VERSION ?? 0,
    taskStateEventVersion: taskExtension.PI_TASK_STATE_EVENT_VERSION ?? 0,
  };
}

async function createPiTaskSessionHost(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Task Session host options must be an object');
  }
  const sessionId = normalizeNonEmptyString(options.sessionId, 'sessionId');
  if (typeof options.persistEntries !== 'function') {
    throw new TypeError('persistEntries must be a function');
  }
  if (options.createEntryId !== undefined && typeof options.createEntryId !== 'function') {
    throw new TypeError('createEntryId must be a function');
  }
  if (options.onDiagnostic !== undefined && typeof options.onDiagnostic !== 'function') {
    throw new TypeError('onDiagnostic must be a function');
  }

  const { runtime, taskExtension } = await loadPublicRuntimeContracts();
  const expectedCompatibility = options.expectedCompatibility ??
    PI_TASK_SESSION_HOST_COMPATIBILITY;
  const compatibilityGuard = createPiTaskCompatibilityGuard(expectedCompatibility);
  const defaultCompatibility = deriveCompatibility(runtime, taskExtension);
  const getCompatibility = options.getCompatibility ?? (() => defaultCompatibility);
  compatibilityGuard.assert(await getCompatibility());

  const listeners = new Set();
  let active = true;
  let currentEpoch = Number.isSafeInteger(options.bridgeEpoch) && options.bridgeEpoch >= 0
    ? options.bridgeEpoch
    : 0;
  let generation;
  let initialized = false;
  let operationTail = Promise.resolve();

  function emitDiagnostic(level, code, message) {
    try {
      options.onDiagnostic?.({ level, code, message });
    } catch {
      // Diagnostics must not change Task Runtime behavior.
    }
  }

  function assertHostActive() {
    if (!active || !generation || generation.invalid) {
      throw createSessionHostError(
        'BRIDGE_EPOCH_STALE',
        'Task Session host is inactive and must be restored',
        { bridgeEpoch: generation?.epoch ?? currentEpoch },
      );
    }
  }

  function serialize(operation) {
    const scheduled = operationTail.then(operation, operation);
    operationTail = scheduled.catch(() => {});
    return scheduled;
  }

  function notifySubscribers(state) {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        emitDiagnostic('warning', 'STATE_LISTENER_FAILED', 'A Task Runtime state listener failed');
      }
    }
  }

  function createScope(target = generation) {
    const eventScope = target.latestSnapshot?.scope;
    return Object.freeze({
      sessionId,
      cursor: branchLeaf(target.branch),
      revision: Number.isSafeInteger(eventScope?.revision) ? eventScope.revision : 0,
      bridgeEpoch: target.epoch,
    });
  }

  function createHostState(target, reason) {
    if (!target.latestSnapshot) {
      throw createSessionHostError(
        'RESTORE_FAILED',
        'pi-tasks did not emit a canonical state snapshot during replay',
      );
    }
    return Object.freeze({
      version: 1,
      reason,
      scope: createScope(target),
      snapshot: target.latestSnapshot,
    });
  }

  function createDefaultEntryId(context, target) {
    const fingerprint = stableJsonHash({
      sessionId,
      parentId: context.parentId,
      customType: context.customType,
      data: context.data,
      sequence: context.sequence,
      bridgeEpoch: context.bridgeEpoch,
    }).slice(0, 16);
    let candidate = `pi-task-${context.bridgeEpoch}-${context.sequence}-${fingerprint}`;
    let collision = 0;
    const ids = new Set(target.branch.map((entry) => entry.id));
    while (ids.has(candidate)) {
      collision += 1;
      candidate = `pi-task-${context.bridgeEpoch}-${context.sequence}-${fingerprint}-${collision}`;
    }
    return candidate;
  }

  async function runLifecycle(target, name, payload, reason) {
    const handlers = target.lifecycleHandlers.get(name) ?? [];
    return runExtensionAction(target, reason, async () => {
      for (const handler of handlers) await handler(payload, target.context);
    });
  }

  async function persistOperation(target, operation, reason) {
    if (operation.appendedEntries.length === 0) return;
    const entries = Object.freeze(target.branch.map((entry) => Object.freeze(clone(entry, 'branch entry'))));
    const appendedEntries = Object.freeze(
      operation.appendedEntries.map((entry) => Object.freeze(clone(entry, 'appended entry'))),
    );
    try {
      await options.persistEntries(entries, Object.freeze({
        reason,
        scope: createScope(target),
        appendedEntries,
      }));
    } catch (cause) {
      target.invalid = true;
      throw createSessionHostError(
        'PERSISTENCE_FAILED',
        'Task Session canonical entries could not be persisted; restore is required',
        { cause: cause instanceof Error ? cause.name : 'PersistenceError' },
      );
    }
  }

  async function runExtensionAction(target, reason, action) {
    if (target.activeOperation) {
      throw createSessionHostError(
        'SESSION_BUSY',
        'Task Session host does not allow nested extension operations',
      );
    }
    const operation = {
      appendedEntries: [],
      stagedState: undefined,
      stateError: undefined,
    };
    target.activeOperation = operation;
    let result;
    let actionError;
    try {
      result = await action();
    } catch (error) {
      actionError = error;
    }
    try {
      await persistOperation(target, operation, reason);
    } finally {
      target.activeOperation = undefined;
    }
    if (operation.stateError) throw operation.stateError;
    if (operation.stagedState && target.publishEnabled) {
      notifySubscribers(operation.stagedState);
    }
    if (actionError) throw actionError;
    return result;
  }

  async function invokeRegisteredTool(target, request, signal, onUpdate) {
    const tool = target.tools.get(request.toolName);
    if (!tool || !PI_TASK_AGENT_TOOL_NAME_SET.has(request.toolName)) {
      throw createSessionHostError('TOOL_NOT_ALLOWED', 'Registered task tool is not active');
    }
    const controller = new AbortController();
    target.invocationController = controller;
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    try {
      return await runtime.invokeRegisteredToolCall(
        {
          systemPrompt: 'OriginOS controlled pi-tasks Session host',
          messages: [],
          tools: [...target.tools.values()].map((registeredTool) => ({
            ...registeredTool,
            parameters: normalizeRuntimeSchema(registeredTool.parameters),
            execute(toolCallId, input, executionSignal, update) {
              return registeredTool.execute(
                toolCallId,
                input,
                executionSignal,
                update,
                target.context,
              );
            },
          })),
        },
        request,
        {
          beforeToolCall: async ({ toolCallId, toolName, args }) => {
            for (const handler of target.lifecycleHandlers.get('tool_call') ?? []) {
              const decision = await handler({
                toolCallId,
                toolName,
                input: args,
              }, target.context);
              if (decision?.block) return decision;
            }
            return undefined;
          },
          toolExecution: 'sequential',
        },
        controller.signal,
        async (event) => {
          if (event?.type === 'tool_execution_update' && typeof onUpdate === 'function') {
            onUpdate(event.update ?? event.result ?? event);
          }
        },
      );
    } finally {
      signal?.removeEventListener('abort', abortFromCaller);
      if (target.invocationController === controller) target.invocationController = undefined;
    }
  }

  async function invokeMutationFromBridge(target, request) {
    const result = await runExtensionAction(target, 'mutation', () =>
      invokeRegisteredTool(target, request, target.commandSignal));
    if (target.commandSignal?.aborted) {
      throw createSessionHostError('ABORTED', 'Task Session tool invocation was aborted');
    }
    return result;
  }

  function invokeCommand(command, signal) {
    return serialize(async () => {
      assertHostActive();
      if (signal?.aborted) {
        throw createSessionHostError('ABORTED', 'Task Session command was aborted');
      }
      const target = generation;
      target.commandSignal = signal;
      try {
        return await target.bridge.gateway.invoke(command);
      } finally {
        if (target.commandSignal === signal) target.commandSignal = undefined;
      }
    });
  }

  function createAgentToolDescriptor(registeredTool) {
    const mutation = PI_TASK_MUTATION_TOOL_NAME_SET.has(registeredTool.name);
    return Object.freeze({
      name: registeredTool.name,
      label: registeredTool.label,
      description: registeredTool.description,
      ...(typeof registeredTool.promptSnippet === 'string'
        ? { promptSnippet: registeredTool.promptSnippet }
        : {}),
      ...(Array.isArray(registeredTool.promptGuidelines)
        ? { promptGuidelines: Object.freeze([...registeredTool.promptGuidelines]) }
        : {}),
      parameters: normalizeRuntimeSchema(
        clone(registeredTool.parameters, `${registeredTool.name} parameters`),
      ),
      mutation,
      async execute(toolCallId, input, signal, onUpdate) {
        try {
          if (mutation) {
            const scope = host.getScope();
            return mutationToolResult(await invokeCommand({
              version: 1,
              requestId: toolCallId,
              toolName: registeredTool.name,
              scope: {
                sessionId: scope.sessionId,
                expectedCursor: scope.cursor,
                expectedRevision: scope.revision,
                bridgeEpoch: scope.bridgeEpoch,
              },
              input,
            }, signal));
          }
          return await serialize(async () => {
            assertHostActive();
            const receipt = await invokeRegisteredTool(generation, {
              toolCallId,
              toolName: registeredTool.name,
              input,
            }, signal, onUpdate);
            return receipt.result;
          });
        } catch (error) {
          return toolErrorResult(error);
        }
      },
    });
  }

  async function buildGeneration(entries, epoch) {
    compatibilityGuard.assert(await getCompatibility());
    const target = {
      epoch,
      branch: normalizeEntries(entries),
      sequence: entries.length,
      tools: new Map(),
      commands: new Map(),
      lifecycleHandlers: new Map(),
      events: createEventBus(),
      latestSnapshot: undefined,
      activeOperation: undefined,
      invocationController: undefined,
      commandSignal: undefined,
      invalid: false,
      publishEnabled: false,
    };

    target.context = Object.freeze({
      mode: 'rpc',
      sessionManager: Object.freeze({
        getBranch: () => target.branch,
        getSessionId: () => sessionId,
      }),
      ui: Object.freeze({
        notify(message, type = 'info') {
          emitDiagnostic(type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info',
            'PI_TASKS_NOTIFICATION', String(message));
        },
        setStatus() {},
        setWidget() {},
      }),
    });

    const pi = {
      events: target.events,
      registerTool(tool) {
        if (!tool || typeof tool !== 'object' || !PI_TASK_AGENT_TOOL_NAME_SET.has(tool.name)) {
          throw createSessionHostError(
            'INCOMPATIBLE_RUNTIME',
            `Controlled pi-tasks registered an unsupported tool: ${String(tool?.name)}`,
          );
        }
        if (target.tools.has(tool.name)) {
          throw createSessionHostError(
            'CONTRACT_VIOLATION',
            `Controlled pi-tasks registered duplicate tool ${tool.name}`,
          );
        }
        target.tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        target.commands.set(name, command);
      },
      on(name, handler) {
        const handlers = target.lifecycleHandlers.get(name) ?? [];
        handlers.push(handler);
        target.lifecycleHandlers.set(name, handlers);
      },
      appendEntry(customType, data) {
        if (!target.activeOperation) {
          throw createSessionHostError(
            'CONTRACT_VIOLATION',
            'pi-tasks attempted to append outside a controlled host operation',
          );
        }
        normalizeNonEmptyString(customType, 'customType');
        target.sequence += 1;
        const parentId = branchLeaf(target.branch);
        const idContext = Object.freeze({
          sessionId,
          bridgeEpoch: target.epoch,
          sequence: target.sequence,
          parentId,
          customType,
          data,
        });
        const entryId = options.createEntryId
          ? options.createEntryId(idContext)
          : createDefaultEntryId(idContext, target);
        normalizeNonEmptyString(entryId, 'created entry id');
        if (target.branch.some((entry) => entry.id === entryId)) {
          throw createSessionHostError(
            'CONTRACT_VIOLATION',
            `Task Session entry id already exists: ${entryId}`,
          );
        }
        const entry = Object.freeze({
          id: entryId,
          parentId,
          type: 'custom',
          customType,
          data: clone(data, 'Task Session entry data'),
        });
        target.branch.push(entry);
        target.activeOperation.appendedEntries.push(entry);
      },
    };

    target.events.on('pi-tasks:state', (event) => {
      try {
        if (!event || typeof event !== 'object' || event.version !== 2 ||
            event.widgetId !== 'pi-tasks' || event.scope?.sessionId !== sessionId) {
          throw createSessionHostError(
            'CONTRACT_VIOLATION',
            'Controlled pi-tasks emitted an invalid public state event',
          );
        }
        const snapshot = deepFreeze(
          createBoundedPiTaskSnapshot(event, options.sanitizeLimits),
        );
        target.latestSnapshot = snapshot;
        const state = createHostState(target, mapStateReason(event.reason));
        if (target.activeOperation) target.activeOperation.stagedState = state;
        else if (target.publishEnabled) notifySubscribers(state);
      } catch (error) {
        if (target.activeOperation) target.activeOperation.stateError = error;
        else target.invalid = true;
      }
    });

    taskExtension.default(pi);
    const missingTools = PI_TASK_AGENT_TOOL_NAMES.filter((name) => !target.tools.has(name));
    if (missingTools.length > 0) {
      throw createSessionHostError(
        'INCOMPATIBLE_RUNTIME',
        'Controlled pi-tasks did not register the expected public tools',
        { missingTools },
      );
    }

    target.bridge = createPiTaskRuntimeBridge({
      sessionId,
      bridgeEpoch: target.epoch,
      expectedCompatibility,
      stateEventTimeoutMs: options.stateEventTimeoutMs,
      sanitizeLimits: options.sanitizeLimits,
      getCompatibility,
      getCurrentScope: () => ({ sessionId, cursor: branchLeaf(target.branch) }),
      abortHostInvocation: () => target.invocationController?.abort(),
      isCursorOnCurrentBranch: (cursor) =>
        cursor === null || target.branch.some((entry) => entry.id === cursor),
      invokeRegisteredTool: (request) => invokeMutationFromBridge(target, request),
    });
    target.bridge.extension(pi);
    target.agentTools = Object.freeze(
      PI_TASK_AGENT_TOOL_NAMES.map((name) => createAgentToolDescriptor(target.tools.get(name))),
    );
    await runLifecycle(target, 'session_start', {}, 'restore');
    return target;
  }

  async function replaceGeneration(entries, bumpEpoch) {
    if (!active) {
      throw createSessionHostError('BRIDGE_EPOCH_STALE', 'Task Session host was invalidated');
    }
    const previous = generation;
    if (bumpEpoch) currentEpoch += 1;
    const next = await buildGeneration(entries, currentEpoch);
    generation = next;
    next.publishEnabled = true;
    previous?.bridge.invalidate();
    previous?.invocationController?.abort();
    return createHostState(next, 'restore');
  }

  const host = Object.freeze({
    restore(entries) {
      return serialize(async () => {
        const state = await replaceGeneration(entries, initialized);
        initialized = true;
        notifySubscribers(state);
        return state;
      });
    },
    getSnapshot() {
      assertHostActive();
      return generation.latestSnapshot;
    },
    getScope() {
      assertHostActive();
      return createScope();
    },
    getAgentTools() {
      assertHostActive();
      return generation.agentTools;
    },
    invoke(command) {
      return invokeCommand(command);
    },
    subscribeState(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('Task Session state listener must be a function');
      }
      if (!active) {
        throw createSessionHostError('BRIDGE_EPOCH_STALE', 'Task Session host was invalidated');
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    checkpoint(checkpointOptions = {}) {
      return serialize(async () => {
        assertHostActive();
        const before = createScope();
        validateExpectedScope(checkpointOptions.expectedScope, before);
        await runLifecycle(generation, 'session_before_compact', {
          reason: checkpointOptions.reason,
        }, 'compaction');
        assertHostActive();
        return createHostState(generation, 'compaction');
      });
    },
    invalidate() {
      if (!active) return;
      active = false;
      listeners.clear();
      generation?.bridge.invalidate();
      generation?.invocationController?.abort();
      if (generation) generation.invalid = true;
    },
  });

  await host.restore(options.entries ?? []);
  return host;
}

module.exports = {
  PI_TASK_AGENT_TOOL_NAMES,
  PI_TASK_READ_ONLY_TOOL_NAMES,
  PI_TASK_SESSION_HOST_COMPATIBILITY,
  createPiTaskSessionHost,
};
