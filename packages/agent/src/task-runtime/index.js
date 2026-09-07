'use strict';

const { stableJsonHash, stableJsonStringify } = require('./canonical-json');
const {
  DEFAULT_SANITIZE_LIMITS,
  createBoundedPiTaskSnapshot,
  sanitizeTaskRuntimeValue,
} = require('./sanitize');

const PI_TASK_CONTRACT_VERSION = 1;
const PI_TASK_SNAPSHOT_VERSION = 1;
const PI_TASK_STATE_EVENT_VERSION = 2;
const PI_TASK_STATE_EVENT_NAME = 'pi-tasks:state';
const DEFAULT_STATE_EVENT_TIMEOUT_MS = 5000;

const PI_TASK_TOOL_NAMES = Object.freeze([
  'task_plan',
  'task_checkpoint',
  'task_decompose',
  'task_update',
  'task_evidence',
  'task_decision',
  'task_complete',
]);

const PI_TASK_TOOL_ALLOWLIST = new Set(PI_TASK_TOOL_NAMES);

const PI_TASK_COMPATIBILITY_REQUIREMENTS = Object.freeze({
  adapterContractVersion: 1,
  runtimePackage: '@earendil-works/pi-coding-agent',
  runtimeVersion: '0.80.10',
  runtimeHostInvokeContractVersion: 1,
  taskExtensionPackage: '@originos/pi-tasks',
  taskExtensionVersion: '0.2.0-originos.1',
  taskExtensionContractVersion: 2,
  taskLedgerEventVersion: 2,
  taskStateEventVersion: 2,
});

const ERROR_CODE_ALIASES = Object.freeze({
  ABORT_ERR: 'ABORTED',
  ABORTED: 'ABORTED',
  BRANCH_CONFLICT: 'BRANCH_CONFLICT',
  BRANCH_STATE_STALE: 'BRANCH_CONFLICT',
  BRIDGE_EPOCH_STALE: 'BRIDGE_EPOCH_STALE',
  CONTRACT_VIOLATION: 'CONTRACT_VIOLATION',
  DUPLICATE_REQUEST_CONFLICT: 'DUPLICATE_REQUEST_CONFLICT',
  INCOMPATIBLE_RUNTIME: 'INCOMPATIBLE_RUNTIME',
  INVALID_COMMAND: 'INVALID_COMMAND',
  INVALID_BRANCH_ENTRY: 'INVALID_BRANCH_ENTRY',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  REVISION_CONFLICT: 'REVISION_CONFLICT',
  RESTORE_FAILED: 'RESTORE_FAILED',
  SESSION_BUSY: 'SESSION_BUSY',
  SESSION_MISMATCH: 'SESSION_MISMATCH',
  STATE_EVENT_TIMEOUT: 'STATE_EVENT_TIMEOUT',
  TOOL_NOT_ALLOWED: 'TOOL_NOT_ALLOWED',
  TOOL_NOT_ACTIVE: 'TOOL_NOT_ALLOWED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
});

function createTaskRuntimeError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function isAllowedPiTaskTool(value) {
  return typeof value === 'string' && PI_TASK_TOOL_ALLOWLIST.has(value);
}

function assertAllowedPiTaskTool(value) {
  if (!isAllowedPiTaskTool(value)) {
    const error = new Error('Task tool is not allowed by the adapter contract');
    error.code = 'TOOL_NOT_ALLOWED';
    throw error;
  }
  return value;
}

function normalizeText(value, field, maxLength = 256) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    const error = new TypeError(`${field} must be a non-empty string up to ${maxLength} characters`);
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  return value;
}

function normalizePiTaskCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    const error = new TypeError('Task command must be an object');
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  if (command.version !== PI_TASK_CONTRACT_VERSION) {
    const error = new TypeError('Unsupported task command version');
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  const toolName = assertAllowedPiTaskTool(command.toolName);
  const scope = command.scope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    const error = new TypeError('Task command scope must be an object');
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  if (!Number.isSafeInteger(scope.expectedRevision) || scope.expectedRevision < 0) {
    const error = new TypeError('expectedRevision must be a non-negative safe integer');
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  if (scope.expectedCursor !== null && typeof scope.expectedCursor !== 'string') {
    const error = new TypeError('expectedCursor must be a string or null');
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  if (!Number.isSafeInteger(scope.bridgeEpoch) || scope.bridgeEpoch < 0) {
    const error = new TypeError('bridgeEpoch must be a non-negative safe integer');
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  if (!command.input || typeof command.input !== 'object' || Array.isArray(command.input)) {
    const error = new TypeError('Task command input must be a JSON object');
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  if (Object.prototype.hasOwnProperty.call(command.input, 'originos_command')) {
    const error = new TypeError('originos_command is reserved for the Task Runtime adapter');
    error.code = 'INVALID_COMMAND';
    throw error;
  }

  const normalized = {
    version: PI_TASK_CONTRACT_VERSION,
    requestId: normalizeText(command.requestId, 'requestId'),
    toolName,
    scope: {
      sessionId: normalizeText(scope.sessionId, 'scope.sessionId'),
      expectedCursor:
        scope.expectedCursor === null
          ? null
          : normalizeText(scope.expectedCursor, 'scope.expectedCursor', 512),
      expectedRevision: scope.expectedRevision,
      bridgeEpoch: scope.bridgeEpoch,
    },
    input: command.input,
  };
  try {
    normalized.inputHash = stableJsonHash({ toolName, input: command.input });
  } catch (cause) {
    const error = new TypeError('Task command input must contain canonical JSON values', { cause });
    error.code = 'INVALID_COMMAND';
    throw error;
  }
  return normalized;
}

function validateCompatibilityDescriptor(descriptor, label) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new TypeError(`${label} compatibility descriptor must be an object`);
  }
  for (const key of Object.keys(PI_TASK_COMPATIBILITY_REQUIREMENTS)) {
    if (!(key in descriptor)) {
      throw new TypeError(`${label} compatibility descriptor is missing ${key}`);
    }
  }
  if (typeof descriptor.runtimePatchHash !== 'string' || !/^[a-f0-9]{64}$/.test(descriptor.runtimePatchHash)) {
    throw new TypeError(`${label} runtimePatchHash must be a SHA-256 hex digest`);
  }
  if (
    typeof descriptor.taskExtensionFingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(descriptor.taskExtensionFingerprint)
  ) {
    throw new TypeError(`${label} taskExtensionFingerprint must be a SHA-256 hex digest`);
  }
}

function evaluatePiTaskCompatibility(actual, expected) {
  try {
    validateCompatibilityDescriptor(expected, 'Expected');
    validateCompatibilityDescriptor(actual, 'Actual');
  } catch (error) {
    return {
      compatible: false,
      error: mapPiTaskRuntimeError(error, 'INCOMPATIBLE_RUNTIME'),
      mismatches: ['MATRIX_INCOMPLETE'],
    };
  }

  const keys = [
    ...Object.keys(PI_TASK_COMPATIBILITY_REQUIREMENTS),
    'runtimePatchHash',
    'taskExtensionFingerprint',
  ];
  const mismatches = keys.filter((key) => actual[key] !== expected[key]);
  if (mismatches.length > 0) {
    return {
      compatible: false,
      error: {
        version: 1,
        code: 'INCOMPATIBLE_RUNTIME',
        message: 'Task Runtime compatibility check failed',
        retryable: false,
        details: { mismatches },
      },
      mismatches,
    };
  }
  return { compatible: true, mismatches: [] };
}

function assertPiTaskCompatibility(actual, expected) {
  const result = evaluatePiTaskCompatibility(actual, expected);
  if (!result.compatible) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }
  return actual;
}

function createPiTaskCompatibilityGuard(expected) {
  validateCompatibilityDescriptor(expected, 'Expected');
  return Object.freeze({
    expected: Object.freeze({ ...expected }),
    evaluate(actual) {
      return evaluatePiTaskCompatibility(actual, expected);
    },
    assert(actual) {
      return assertPiTaskCompatibility(actual, expected);
    },
  });
}

function createPiTaskRuntimeBridge(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Task Runtime bridge options must be an object');
  }
  if (typeof options.getCompatibility !== 'function') {
    throw new TypeError('getCompatibility must be a function');
  }
  if (typeof options.invokeRegisteredTool !== 'function') {
    throw new TypeError('invokeRegisteredTool must be a function');
  }
  if (typeof options.getCurrentScope !== 'function') {
    throw new TypeError('getCurrentScope must be a function');
  }
  if (typeof options.abortHostInvocation !== 'function') {
    throw new TypeError('abortHostInvocation must be a function');
  }
  if (typeof options.isCursorOnCurrentBranch !== 'function') {
    throw new TypeError('isCursorOnCurrentBranch must be a function');
  }
  const sessionId = normalizeText(options.sessionId, 'sessionId');
  const stateEventTimeoutMs = options.stateEventTimeoutMs === undefined
    ? DEFAULT_STATE_EVENT_TIMEOUT_MS
    : options.stateEventTimeoutMs;
  if (!Number.isSafeInteger(stateEventTimeoutMs) || stateEventTimeoutMs < 1) {
    throw new TypeError('stateEventTimeoutMs must be a positive safe integer');
  }

  const compatibilityGuard = createPiTaskCompatibilityGuard(options.expectedCompatibility);
  const bridgeEpoch = Number.isSafeInteger(options.bridgeEpoch) && options.bridgeEpoch >= 0
    ? options.bridgeEpoch
    : 0;
  let active = true;
  let eventUnsubscribe;
  let extensionInstalled = false;
  const pendingStateEvents = new Set();
  const pendingCancellations = new Set();

  function assertActive(commandEpoch) {
    if (!active || commandEpoch !== bridgeEpoch) {
      throw createTaskRuntimeError(
        'BRIDGE_EPOCH_STALE',
        'Task Runtime bridge epoch is stale',
        { bridgeEpoch, commandEpoch },
      );
    }
  }

  async function assertCurrentScope(expectedCursor, phase, mismatchCode = 'BRANCH_CONFLICT') {
    const scope = await options.getCurrentScope();
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
      throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Current Session scope is unavailable');
    }
    if (scope.sessionId !== sessionId) {
      throw createTaskRuntimeError(
        'SESSION_MISMATCH',
        `Task Runtime Session changed during ${phase}`,
      );
    }
    if (scope.cursor !== expectedCursor) {
      throw createTaskRuntimeError(
        mismatchCode,
        `Task Runtime branch changed during ${phase}`,
        { expectedCursor, actualCursor: scope.cursor },
      );
    }
  }

  function rejectPending(error) {
    for (const waiter of pendingStateEvents) waiter.reject(error);
    pendingStateEvents.clear();
  }

  function createInvocationCancellation() {
    let rejectPromise;
    let settled = false;
    const promise = new Promise((_resolve, reject) => {
      rejectPromise = reject;
    });
    promise.catch(() => {});
    const cancellation = {
      promise,
      reject(error) {
        if (settled) return;
        settled = true;
        pendingCancellations.delete(cancellation);
        rejectPromise(error);
      },
      dispose() {
        if (settled) return;
        settled = true;
        pendingCancellations.delete(cancellation);
      },
    };
    pendingCancellations.add(cancellation);
    return cancellation;
  }

  function createStateEventWaiter() {
    const buffered = [];
    let matcher;
    let timer;
    let settled = false;
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    promise.catch(() => {});

    function cleanup() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      pendingStateEvents.delete(waiter);
    }

    function settle(outcome) {
      if (settled || !outcome || outcome.kind === 'ignore') return;
      settled = true;
      cleanup();
      if (outcome.kind === 'match') resolvePromise(outcome.event);
      else rejectPromise(outcome.error);
    }

    const waiter = {
      push(event) {
        if (settled) return;
        if (matcher) {
          settle(matcher(event));
          return;
        }
        if (buffered.length >= 16) buffered.shift();
        buffered.push(event);
      },
      wait(nextMatcher) {
        matcher = nextMatcher;
        for (const event of buffered.splice(0)) {
          const outcome = matcher(event);
          if (outcome.kind !== 'ignore') {
            settle(outcome);
            break;
          }
        }
        if (!settled) {
          timer = setTimeout(() => {
            settle({
              kind: 'reject',
              error: createTaskRuntimeError(
                'STATE_EVENT_TIMEOUT',
                'Timed out waiting for the public pi-tasks state event',
                { sessionId, stateEventTimeoutMs },
              ),
            });
          }, stateEventTimeoutMs);
        }
        return promise;
      },
      reject(error) {
        settle({ kind: 'reject', error });
      },
      dispose() {
        if (settled) return;
        settled = true;
        cleanup();
      },
    };
    pendingStateEvents.add(waiter);
    return waiter;
  }

  function extension(pi) {
    if (!pi || typeof pi.on !== 'function') {
      throw new TypeError('Task Runtime extension requires pi.on()');
    }
    if (!pi.events || typeof pi.events.on !== 'function') {
      throw new TypeError('Task Runtime extension requires public pi.events.on()');
    }
    if (extensionInstalled) {
      throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Task Runtime extension is already installed');
    }
    const unsubscribe = pi.events.on(PI_TASK_STATE_EVENT_NAME, (event) => {
      for (const waiter of pendingStateEvents) waiter.push(event);
    });
    try {
      pi.on('tool_call', (event) => {
        const toolName = event && typeof event === 'object'
          ? event.toolName ?? event.name
          : undefined;
        if (typeof toolName !== 'string' || !toolName.startsWith('task_')) return undefined;
        if (!isAllowedPiTaskTool(toolName)) {
          return {
            block: true,
            reason: 'Task tool is not allowed by the OriginOS Task Runtime contract',
          };
        }
        return undefined;
      });
      eventUnsubscribe = unsubscribe;
      extensionInstalled = true;
    } catch (error) {
      unsubscribe();
      eventUnsubscribe = undefined;
      extensionInstalled = false;
      throw error;
    }
  }

  function validateReceipt(normalized, hostResult) {
    if (!hostResult || typeof hostResult !== 'object') {
      throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Runtime host invocation returned no result');
    }
    if (hostResult.toolCallId !== normalized.requestId || hostResult.toolName !== normalized.toolName) {
      throw createTaskRuntimeError(
        'CONTRACT_VIOLATION',
        'Runtime host invocation identity does not match the task command',
      );
    }
    const toolResult = hostResult.result;
    if (!toolResult || typeof toolResult !== 'object') {
      throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Task tool returned no structured result');
    }
    if (hostResult.isError || toolResult.isError) {
      const details = toolResult.details;
      const mapped = mapPiTaskRuntimeError(
        {
          code: details && typeof details === 'object' && typeof details.code === 'string'
            ? details.code
            : 'HOST_INVOCATION_FAILED',
          details,
        },
        'HOST_INVOCATION_FAILED',
      );
      throw createTaskRuntimeError(mapped.code, mapped.message, mapped.details);
    }
    const receipt = toolResult.details?.mutationReceipt;
    if (!receipt || typeof receipt !== 'object') {
      throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Task tool returned no mutation receipt');
    }
    const requiredStrings = ['requestId', 'command', 'cursorAfter', 'eventId', 'stateHash', 'payloadHash'];
    if (requiredStrings.some((key) => typeof receipt[key] !== 'string' || receipt[key].length === 0)) {
      throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Task mutation receipt is incomplete');
    }
    if (
      !Number.isSafeInteger(receipt.revisionBefore) || receipt.revisionBefore < 0 ||
      !Number.isSafeInteger(receipt.revisionAfter) || receipt.revisionAfter !== receipt.revisionBefore + 1 ||
      (receipt.cursorBefore !== null && typeof receipt.cursorBefore !== 'string') ||
      typeof receipt.replayed !== 'boolean'
    ) {
      throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Task mutation receipt has invalid scope fields');
    }
    if (
      receipt.requestId !== normalized.requestId ||
      receipt.command !== normalized.toolName ||
      receipt.payloadHash !== normalized.inputHash
    ) {
      throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Task mutation receipt does not match the command');
    }
    if (!receipt.replayed && (
      receipt.revisionBefore !== normalized.scope.expectedRevision ||
      receipt.cursorBefore !== normalized.scope.expectedCursor
    )) {
      throw createTaskRuntimeError('BRANCH_CONFLICT', 'Task mutation receipt does not match expected scope');
    }
    return receipt;
  }

  function matchStateEvent(normalized, receipt, event) {
    if (!event || typeof event !== 'object' || event.reason !== 'task_mutation') {
      return { kind: 'ignore' };
    }
    const mutationRequestId = event.mutation?.requestId;
    if (mutationRequestId && mutationRequestId !== normalized.requestId) {
      return { kind: 'ignore' };
    }
    if (event.version !== PI_TASK_STATE_EVENT_VERSION || event.widgetId !== 'pi-tasks') {
      return {
        kind: 'reject',
        error: createTaskRuntimeError('CONTRACT_VIOLATION', 'Unsupported pi-tasks state event contract'),
      };
    }
    if (!event.scope || event.scope.sessionId !== sessionId) {
      return {
        kind: 'reject',
        error: createTaskRuntimeError('SESSION_MISMATCH', 'Task state event belongs to another Session'),
      };
    }
    if (!options.isCursorOnCurrentBranch(event.scope.cursor)) {
      return { kind: 'ignore' };
    }
    if (receipt.replayed && event.mutation !== undefined) return { kind: 'ignore' };
    if (receipt.replayed && event.scope.revision < normalized.scope.expectedRevision) {
      return { kind: 'ignore' };
    }
    if (!receipt.replayed && event.scope.revision < receipt.revisionAfter) {
      return { kind: 'ignore' };
    }
    const replayScopeInvalid = receipt.replayed && (
      !Number.isSafeInteger(event.scope.revision) ||
      event.scope.revision !== normalized.scope.expectedRevision ||
      (event.scope.cursor !== null && typeof event.scope.cursor !== 'string') ||
      typeof event.stateHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(event.stateHash)
    );
    const mutationScopeInvalid = !receipt.replayed && (
      event.scope.revision !== receipt.revisionAfter ||
      event.scope.cursor !== receipt.cursorAfter ||
      event.stateHash !== receipt.stateHash
    );
    if (replayScopeInvalid || mutationScopeInvalid) {
      return {
        kind: 'reject',
        error: createTaskRuntimeError('CONTRACT_VIOLATION', 'Task state event does not match mutation receipt'),
      };
    }
    if (!receipt.replayed && (
      !event.mutation ||
      event.mutation.requestId !== receipt.requestId ||
      event.mutation.command !== receipt.command ||
      event.mutation.eventId !== receipt.eventId
    )) {
      return {
        kind: 'reject',
        error: createTaskRuntimeError('CONTRACT_VIOLATION', 'Task state event mutation identity is invalid'),
      };
    }
    return { kind: 'match', event };
  }

  const gateway = Object.freeze({
    get bridgeEpoch() {
      return bridgeEpoch;
    },
    async invoke(command) {
      const normalized = normalizePiTaskCommand(command);
      assertActive(normalized.scope.bridgeEpoch);
      if (normalized.scope.sessionId !== sessionId) {
        throw createTaskRuntimeError('SESSION_MISMATCH', 'Task command belongs to another Session');
      }
      if (!extensionInstalled) {
        throw createTaskRuntimeError('CONTRACT_VIOLATION', 'Task Runtime extension is not installed');
      }
      const actualCompatibility = await options.getCompatibility();
      compatibilityGuard.assert(actualCompatibility);
      assertActive(normalized.scope.bridgeEpoch);
      await assertCurrentScope(normalized.scope.expectedCursor, 'preflight');
      assertActive(normalized.scope.bridgeEpoch);

      const waiter = createStateEventWaiter();
      const cancellation = createInvocationCancellation();
      let hostResult;
      try {
        const hostInvocation = Promise.resolve().then(() => options.invokeRegisteredTool({
          toolCallId: normalized.requestId,
          toolName: normalized.toolName,
          input: {
            ...normalized.input,
            originos_command: {
              version: 1,
              request_id: normalized.requestId,
              expected_revision: normalized.scope.expectedRevision,
              expected_cursor: normalized.scope.expectedCursor,
            },
          },
        }));
        hostInvocation.catch(() => {});
        hostResult = await Promise.race([hostInvocation, cancellation.promise]);
        cancellation.dispose();
        assertActive(normalized.scope.bridgeEpoch);
        const receipt = validateReceipt(normalized, hostResult);
        const stateEvent = await waiter.wait((event) => matchStateEvent(normalized, receipt, event));
        assertActive(normalized.scope.bridgeEpoch);
        await assertCurrentScope(
          receipt.replayed ? normalized.scope.expectedCursor : receipt.cursorAfter,
          'commit confirmation',
          'CONTRACT_VIOLATION',
        );
        assertActive(normalized.scope.bridgeEpoch);
        const snapshot = createBoundedPiTaskSnapshot(stateEvent, options.sanitizeLimits);
        return Object.freeze({
          version: 1,
          requestId: normalized.requestId,
          toolCallId: hostResult.toolCallId,
          ...(typeof receipt.taskId === 'string' ? { taskId: receipt.taskId } : {}),
          revisionBefore: receipt.revisionBefore,
          revisionAfter: receipt.revisionAfter,
          cursorBefore: receipt.cursorBefore,
          cursorAfter: receipt.cursorAfter,
          eventId: receipt.eventId,
          stateHash: receipt.stateHash,
          replayed: receipt.replayed,
          snapshot,
          isError: false,
        });
      } catch (error) {
        cancellation.dispose();
        waiter.dispose();
        throw error;
      }
    },
  });

  return Object.freeze({
    bridgeEpoch,
    extension,
    gateway,
    invalidate() {
      active = false;
      if (typeof eventUnsubscribe === 'function') eventUnsubscribe();
      eventUnsubscribe = undefined;
      const staleError = createTaskRuntimeError(
        'BRIDGE_EPOCH_STALE',
        'Task Runtime bridge was invalidated',
        { bridgeEpoch },
      );
      rejectPending(staleError);
      const hadPendingInvocation = pendingCancellations.size > 0;
      for (const cancellation of pendingCancellations) cancellation.reject(staleError);
      pendingCancellations.clear();
      if (hadPendingInvocation) {
        Promise.resolve()
          .then(() => options.abortHostInvocation())
          .catch(() => {});
      }
    },
  });
}

function inferErrorCode(error, fallbackCode) {
  const explicitCode = error && typeof error === 'object' ? error.code : undefined;
  if (typeof explicitCode === 'string' && ERROR_CODE_ALIASES[explicitCode]) {
    return ERROR_CODE_ALIASES[explicitCode];
  }
  const message = error instanceof Error ? error.message : String(error || '');
  if (/schema|validation|invalid argument/i.test(message)) return 'VALIDATION_FAILED';
  if (/permission|denied|forbidden/i.test(message)) return 'PERMISSION_DENIED';
  if (/abort/i.test(message)) return 'ABORTED';
  if (/timeout/i.test(message)) return 'STATE_EVENT_TIMEOUT';
  return fallbackCode;
}

function mapPiTaskRuntimeError(error, fallbackCode = 'HOST_INVOCATION_FAILED') {
  const code = inferErrorCode(error, fallbackCode);
  const retryable = ['SESSION_BUSY', 'STATE_EVENT_TIMEOUT'].includes(code);
  const sourceDetails = error && typeof error === 'object' ? error.details : undefined;
  const details = sourceDetails ? sanitizeTaskRuntimeValue(sourceDetails) : undefined;
  // Keep the user-facing error deliberately generic, but retain a bounded,
  // sanitized diagnostic in the main-process log so host failures can be
  // distinguished from model or renderer failures.
  console.error('[TaskRuntime] host invocation failed', {
    code,
    retryable,
    errorCode: error && typeof error === 'object' ? error.code : undefined,
    reason: details && typeof details.reason === 'string'
      ? details.reason.slice(0, 500)
      : error instanceof Error ? error.message.slice(0, 500) : String(error || '').slice(0, 500),
    details,
  });
  const reason = details && typeof details.reason === 'string' ? details.reason.slice(0, 500) : undefined;
  return {
    version: 1,
    code,
    message: code === 'HOST_INVOCATION_FAILED'
      ? `Task Runtime host invocation failed${reason ? `: ${reason}` : ''}`
      : `Task Runtime error: ${code}`,
    retryable,
    ...(details === undefined ? {} : { details }),
  };
}

module.exports = {
  DEFAULT_SANITIZE_LIMITS,
  PI_TASK_COMPATIBILITY_REQUIREMENTS,
  PI_TASK_CONTRACT_VERSION,
  PI_TASK_SNAPSHOT_VERSION,
  PI_TASK_STATE_EVENT_NAME,
  PI_TASK_STATE_EVENT_VERSION,
  PI_TASK_TOOL_NAMES,
  assertAllowedPiTaskTool,
  assertPiTaskCompatibility,
  createBoundedPiTaskSnapshot,
  createPiTaskCompatibilityGuard,
  createPiTaskRuntimeBridge,
  evaluatePiTaskCompatibility,
  isAllowedPiTaskTool,
  mapPiTaskRuntimeError,
  normalizePiTaskCommand,
  sanitizeTaskRuntimeValue,
  stableJsonHash,
  stableJsonStringify,
};

Object.assign(module.exports, require('./session-host'));
