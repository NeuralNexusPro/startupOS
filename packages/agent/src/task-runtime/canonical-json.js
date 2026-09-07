'use strict';

const { createHash } = require('node:crypto');

function canonicalizeJson(value, path = '$', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number at ${path}`);
    }
    return JSON.stringify(value);
  }

  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported JSON value at ${path}`);
  }

  if (seen.has(value)) {
    throw new TypeError(`Circular JSON value at ${path}`);
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((item, index) => canonicalizeJson(item, `${path}[${index}]`, seen))
        .join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Non-plain object at ${path}`);
    }

    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key], `${path}.${key}`, seen)}`);
    return `{${entries.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function stableJsonStringify(value) {
  return canonicalizeJson(value);
}

function stableJsonHash(value) {
  return createHash('sha256').update(stableJsonStringify(value), 'utf8').digest('hex');
}

module.exports = {
  stableJsonHash,
  stableJsonStringify,
};
