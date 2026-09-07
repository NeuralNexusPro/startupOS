'use strict';

const { stableJsonHash } = require('./canonical-json');

const DEFAULT_SANITIZE_LIMITS = Object.freeze({
  maxArrayItems: 100,
  maxDepth: 8,
  maxObjectKeys: 100,
  maxSnapshotBytes: 64 * 1024,
  maxStringLength: 4096,
});

const SENSITIVE_KEY = /(?:authorization|cookie|credential|secret|token|api[_-]?key|password|passphrase|prompt|workingdirectory|filepath|homedir|homepath|\bcwd\b)/i;

function mergeLimits(options = {}) {
  const limits = { ...DEFAULT_SANITIZE_LIMITS, ...options };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
  return limits;
}

function truncateString(value, maxLength) {
  if (value.length <= maxLength) return value;
  const suffix = `...[truncated:${value.length - maxLength}]`;
  return `${value.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
}

function sanitizeTaskRuntimeValue(value, options = {}, depth = 0, seen = new Set()) {
  const limits = mergeLimits(options);

  function visit(current, currentDepth) {
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'string') return truncateString(current, limits.maxStringLength);
    if (typeof current === 'number') return Number.isFinite(current) ? current : '[NON_FINITE_NUMBER]';
    if (typeof current !== 'object') return `[UNSUPPORTED:${typeof current}]`;
    if (currentDepth >= limits.maxDepth) return '[MAX_DEPTH]';
    if (seen.has(current)) return '[CIRCULAR]';

    seen.add(current);
    try {
      if (Array.isArray(current)) {
        const items = current
          .slice(0, limits.maxArrayItems)
          .map((item) => visit(item, currentDepth + 1));
        if (current.length > limits.maxArrayItems) {
          items.push(`[TRUNCATED_ITEMS:${current.length - limits.maxArrayItems}]`);
        }
        return items;
      }

      const output = {};
      const keys = Object.keys(current).sort();
      for (const key of keys.slice(0, limits.maxObjectKeys)) {
        output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : visit(current[key], currentDepth + 1);
      }
      if (keys.length > limits.maxObjectKeys) {
        output.__truncatedKeys = keys.length - limits.maxObjectKeys;
      }
      return output;
    } finally {
      seen.delete(current);
    }
  }

  return visit(value, depth);
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function createBoundedPiTaskSnapshot(snapshot, options = {}) {
  const limits = mergeLimits(options);
  const bounded = {
    version: 1,
    scope: sanitizeTaskRuntimeValue(snapshot.scope, limits),
    stateHash: truncateString(String(snapshot.stateHash || ''), 128),
    state: sanitizeTaskRuntimeValue(snapshot.state, limits),
  };

  if (snapshot.mutation) {
    bounded.mutation = sanitizeTaskRuntimeValue(snapshot.mutation, limits);
  }

  const snapshotBytes = byteLength(bounded);
  if (snapshotBytes <= limits.maxSnapshotBytes) {
    return bounded;
  }

  const stateHash = stableJsonHash(bounded.state);
  bounded.state = {
    truncated: true,
    reason: 'SNAPSHOT_SIZE_LIMIT',
    sanitizedStateHash: stateHash,
  };
  bounded.truncation = {
    originalSanitizedBytes: snapshotBytes,
    maxSnapshotBytes: limits.maxSnapshotBytes,
  };

  if (byteLength(bounded) > limits.maxSnapshotBytes) {
    throw new RangeError('Snapshot metadata exceeds maxSnapshotBytes');
  }
  return bounded;
}

module.exports = {
  DEFAULT_SANITIZE_LIMITS,
  createBoundedPiTaskSnapshot,
  sanitizeTaskRuntimeValue,
};
