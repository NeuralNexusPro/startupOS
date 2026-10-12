import { createHash } from 'crypto';

import { CanonicalOntologyStore } from './canonical-ontology-store';
import {
  AUTHORING_REVISION_METADATA_KEY,
  CANONICAL_ONTOLOGY_AUTHOR_PERMISSION,
  type CanonicalOntologyAuthoringCommand,
  type CanonicalOntologyAuthoringMutation,
  type CanonicalOntologyAuthoringResult,
} from './authoring-types';
import type {
  CanonicalInstance,
  CanonicalOntology,
  CanonicalValidationIssue,
} from './types';
import { validateCanonicalOntology } from './validator';

function issue(
  code: string,
  path: string,
  message: string
): CanonicalValidationIssue {
  return { code, message, path, severity: 'error' };
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

export function hashCanonicalOntologyAuthoringCommand(
  command: CanonicalOntologyAuthoringCommand
): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(command)))
    .digest('hex');
}

type CollectionMutation<T> =
  { ok: true; items: T[] } | { ok: false; issues: CanonicalValidationIssue[] };

function updateById<T extends { id: string }>(
  items: readonly T[],
  id: string,
  patch: Partial<Omit<T, 'id'>>,
  path: string
): CollectionMutation<T> {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0)
    return {
      ok: false,
      issues: [
        issue(
          'AUTHORING_TARGET_NOT_FOUND',
          path,
          `Unknown authoring target: ${id}`
        ),
      ],
    };
  return {
    ok: true,
    items: items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    ),
  };
}

function deleteById<T extends { id: string }>(
  items: readonly T[],
  id: string,
  path: string
): CollectionMutation<T> {
  if (!items.some((item) => item.id === id)) {
    return {
      ok: false,
      issues: [
        issue(
          'AUTHORING_TARGET_NOT_FOUND',
          path,
          `Unknown authoring target: ${id}`
        ),
      ],
    };
  }
  return { ok: true, items: items.filter((item) => item.id !== id) };
}

function create<T extends { id: string }>(
  items: readonly T[],
  value: T,
  path: string
): CollectionMutation<T> {
  if (items.some((item) => item.id === value.id)) {
    return {
      ok: false,
      issues: [
        issue(
          'DUPLICATE_ID',
          path,
          `Duplicate authoring target id: ${value.id}`
        ),
      ],
    };
  }
  return { ok: true, items: [...items, value] };
}

const IMMUTABLE_INSTANCE_PATCH_KEYS = [
  'conceptId',
  'id',
  'createdAt',
  'updatedAt',
] as const;

/**
 * D2: an instance update may only replace `data` wholesale or adjust the
 * optional `stateId` / `sourceRefs`; structural identity keys are rejected.
 */
function patchInstance(
  items: readonly CanonicalInstance[],
  instanceId: string,
  patch: Record<string, unknown>,
  path: string
): CollectionMutation<CanonicalInstance> {
  const index = items.findIndex((item) => item.id === instanceId);
  if (index < 0) {
    return {
      ok: false,
      issues: [
        issue(
          'AUTHORING_TARGET_NOT_FOUND',
          path,
          `Unknown authoring target: ${instanceId}`
        ),
      ],
    };
  }
  const immutableKey = IMMUTABLE_INSTANCE_PATCH_KEYS.find(
    (key) => key in patch && patch[key] !== undefined
  );
  if (immutableKey) {
    return {
      ok: false,
      issues: [
        issue(
          'IMMUTABLE_FIELD',
          `${path}.${immutableKey}`,
          `Instance ${immutableKey} is immutable and cannot be patched`
        ),
      ],
    };
  }
  if ('data' in patch && patch['data'] !== undefined) {
    const data = patch['data'];
    if (
      data === null ||
      typeof data !== 'object' ||
      Array.isArray(data)
    ) {
      return {
        ok: false,
        issues: [
          issue(
            'INVALID_INSTANCE_DATA',
            `${path}.data`,
            'Instance data must be an object'
          ),
        ],
      };
    }
  }
  return {
    ok: true,
    items: items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const { data, stateId, sourceRefs } = patch as {
        data?: Record<string, unknown>;
        stateId?: CanonicalInstance['stateId'];
        sourceRefs?: CanonicalInstance['sourceRefs'];
      };
      return {
        ...item,
        ...(data !== undefined ? { data } : {}),
        ...(stateId !== undefined ? { stateId } : {}),
        ...(sourceRefs !== undefined ? { sourceRefs } : {}),
      };
    }),
  };
}

/**
 * Instance-level relation records. Canonical ontology does not yet carry a
 * dedicated instance relation collection, so relations referenced by the
 * authoring contract (`CanonicalInstanceRelation` in the ONT.9 spec) are read
 * defensively from instance payloads; any record exposing `sourceInstanceId` /
 * `targetInstanceId` participates in delete integrity checks.
 */
function instanceRelationRecords(ontology: CanonicalOntology): Array<{
  sourceInstanceId: unknown;
  targetInstanceId: unknown;
}> {
  const records: Array<{ sourceInstanceId: unknown; targetInstanceId: unknown }> =
    [];
  for (const instance of ontology.instances) {
    const payload = instance.data as Record<string, unknown> | undefined;
    const candidates: unknown[] = [
      (instance as unknown as Record<string, unknown>)['relations'],
      payload?.['relations'],
    ];
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) continue;
      for (const entry of candidate) {
        if (entry && typeof entry === 'object') {
          records.push(entry as { sourceInstanceId: unknown; targetInstanceId: unknown });
        }
      }
    }
  }
  return records;
}

/** Instance deletion is blocked while any instance-level relation still references the instance. */
function deleteInstance(
  ontology: CanonicalOntology,
  items: readonly CanonicalInstance[],
  instanceId: string,
  path: string
): CollectionMutation<CanonicalInstance> {
  if (!items.some((item) => item.id === instanceId)) {
    return {
      ok: false,
      issues: [
        issue(
          'AUTHORING_TARGET_NOT_FOUND',
          path,
          `Unknown authoring target: ${instanceId}`
        ),
      ],
    };
  }
  const referencedBy = instanceRelationRecords(ontology).filter(
    (relation) =>
      relation['sourceInstanceId'] === instanceId ||
      relation['targetInstanceId'] === instanceId
  );
  if (referencedBy.length > 0) {
    return {
      ok: false,
      issues: [
        issue(
          'INSTANCE_REFERENCED',
          path,
          `Instance ${instanceId} is still referenced by ${referencedBy.length} instance relation(s)`
        ),
      ],
    };
  }
  return { ok: true, items: items.filter((item) => item.id !== instanceId) };
}

/** Instance creation payload must bind an existing concept and carry object data. */
function createInstance(
  ontology: CanonicalOntology,
  value: CanonicalInstance,
  path: string
): CollectionMutation<CanonicalInstance> {
  if (
    value.data === null ||
    typeof value.data !== 'object' ||
    Array.isArray(value.data)
  ) {
    return {
      ok: false,
      issues: [
        issue(
          'INVALID_INSTANCE_DATA',
          `${path}.data`,
          'Instance data must be an object'
        ),
      ],
    };
  }
  if (!ontology.concepts.some((concept) => concept.id === value.conceptId)) {
    return {
      ok: false,
      issues: [
        issue(
          'MISSING_REFERENCE',
          `${path}.conceptId`,
          `Unknown concept: ${value.conceptId}`
        ),
      ],
    };
  }
  return create(ontology.instances, value, `${path}.id`);
}

function mutateSingleOntology(
  ontology: CanonicalOntology,
  command: CanonicalOntologyAuthoringMutation
): { ontology?: CanonicalOntology; issues?: CanonicalValidationIssue[] } {
  const now = new Date();
  let next: CanonicalOntology = { ...ontology, updatedAt: now };
  let mutationIssues: CanonicalValidationIssue[] | undefined;
  const apply = <T>(
    result: CollectionMutation<T>,
    assign: (items: T[]) => void
  ): void => {
    if (result.ok === false) {
      mutationIssues = result.issues;
      return;
    }
    assign(result.items);
  };

  switch (command.type) {
    case 'domain.create':
      apply(create(ontology.domains, command.value, 'value.id'), (items) => {
        next = { ...next, domains: items };
      });
      break;
    case 'domain.update':
      apply(
        updateById(
          ontology.domains,
          command.domainId,
          { ...command.patch, updatedAt: now },
          'domainId'
        ),
        (items) => {
          next = { ...next, domains: items };
        }
      );
      break;
    case 'domain.delete':
      apply(
        deleteById(ontology.domains, command.domainId, 'domainId'),
        (items) => {
          next = { ...next, domains: items };
        }
      );
      break;
    case 'concept.create':
      apply(create(ontology.concepts, command.value, 'value.id'), (items) => {
        next = { ...next, concepts: items };
      });
      break;
    case 'concept.update':
      apply(
        updateById(
          ontology.concepts,
          command.conceptId,
          { ...command.patch, updatedAt: now },
          'conceptId'
        ),
        (items) => {
          next = { ...next, concepts: items };
        }
      );
      break;
    case 'concept.delete':
      apply(
        deleteById(ontology.concepts, command.conceptId, 'conceptId'),
        (items) => {
          next = { ...next, concepts: items };
        }
      );
      break;
    case 'property.create':
      apply(create(ontology.properties, command.value, 'value.id'), (items) => {
        next = { ...next, properties: items };
      });
      break;
    case 'property.update':
      apply(
        updateById(
          ontology.properties,
          command.propertyId,
          command.patch,
          'propertyId'
        ),
        (items) => {
          next = { ...next, properties: items };
        }
      );
      break;
    case 'property.delete':
      apply(
        deleteById(ontology.properties, command.propertyId, 'propertyId'),
        (items) => {
          next = { ...next, properties: items };
        }
      );
      break;
    case 'relation.create':
      apply(create(ontology.relations, command.value, 'value.id'), (items) => {
        next = { ...next, relations: items };
      });
      break;
    case 'relation.update':
      apply(
        updateById(
          ontology.relations,
          command.relationId,
          command.patch,
          'relationId'
        ),
        (items) => {
          next = { ...next, relations: items };
        }
      );
      break;
    case 'relation.delete':
      apply(
        deleteById(ontology.relations, command.relationId, 'relationId'),
        (items) => {
          next = { ...next, relations: items };
        }
      );
      break;
    case 'factType.create':
      apply(create(ontology.factTypes, command.value, 'value.id'), (items) => {
        next = { ...next, factTypes: items };
      });
      break;
    case 'factType.update':
      apply(
        updateById(
          ontology.factTypes,
          command.factTypeId,
          command.patch,
          'factTypeId'
        ),
        (items) => {
          next = { ...next, factTypes: items };
        }
      );
      break;
    case 'factType.delete':
      apply(
        deleteById(ontology.factTypes, command.factTypeId, 'factTypeId'),
        (items) => {
          next = { ...next, factTypes: items };
        }
      );
      break;
    case 'rule.create':
      apply(create(ontology.rules, command.value, 'value.id'), (items) => {
        next = { ...next, rules: items };
      });
      break;
    case 'rule.update':
      apply(
        updateById(ontology.rules, command.ruleId, command.patch, 'ruleId'),
        (items) => {
          next = { ...next, rules: items };
        }
      );
      break;
    case 'rule.delete':
      apply(deleteById(ontology.rules, command.ruleId, 'ruleId'), (items) => {
        next = { ...next, rules: items };
      });
      break;
    case 'transition.create':
      apply(create(ontology.transitions, command.value, 'value.id'), (items) => {
        next = { ...next, transitions: items };
      });
      break;
    case 'transition.update':
      apply(
        updateById(
          ontology.transitions,
          command.transitionId,
          command.patch,
          'transitionId'
        ),
        (items) => {
          next = { ...next, transitions: items };
        }
      );
      break;
    case 'transition.delete':
      apply(
        deleteById(ontology.transitions, command.transitionId, 'transitionId'),
        (items) => {
          next = { ...next, transitions: items };
        }
      );
      break;
    case 'businessState.create':
      apply(
        create(ontology.businessStates, command.value, 'value.id'),
        (items) => {
          next = { ...next, businessStates: items };
        }
      );
      break;
    case 'businessState.update':
      apply(
        updateById(
          ontology.businessStates,
          command.businessStateId,
          command.patch,
          'businessStateId'
        ),
        (items) => {
          next = { ...next, businessStates: items };
        }
      );
      break;
    case 'businessState.delete':
      apply(
        deleteById(
          ontology.businessStates,
          command.businessStateId,
          'businessStateId'
        ),
        (items) => {
          next = { ...next, businessStates: items };
        }
      );
      break;
    case 'action.create':
      apply(create(ontology.actions, command.value, 'value.id'), (items) => {
        next = { ...next, actions: items };
      });
      break;
    case 'action.update':
      apply(
        updateById(
          ontology.actions,
          command.actionId,
          command.patch,
          'actionId'
        ),
        (items) => {
          next = { ...next, actions: items };
        }
      );
      break;
    case 'action.delete':
      apply(
        deleteById(ontology.actions, command.actionId, 'actionId'),
        (items) => {
          next = { ...next, actions: items };
        }
      );
      break;
    case 'instance.create': {
      const created = createInstance(ontology, command.value, 'value');
      if (created.ok === false) {
        mutationIssues = created.issues;
        break;
      }
      next = {
        ...next,
        instances: created.items.map((item) =>
          item.id === command.value.id ? { ...item, updatedAt: now } : item
        ),
      };
      break;
    }
    case 'instance.update': {
      const patched = patchInstance(
        ontology.instances,
        command.instanceId,
        command.patch as Record<string, unknown>,
        'instanceId'
      );
      if (patched.ok === false) {
        mutationIssues = patched.issues;
        break;
      }
      next = {
        ...next,
        instances: patched.items.map((item) =>
          item.id === command.instanceId ? { ...item, updatedAt: now } : item
        ),
      };
      break;
    }
    case 'instance.delete':
      apply(
        deleteInstance(
          ontology,
          ontology.instances,
          command.instanceId,
          'instanceId'
        ),
        (items) => {
          next = { ...next, instances: items };
        }
      );
      break;
  }

  return mutationIssues ? { issues: mutationIssues } : { ontology: next };
}

function mutateOntology(
  ontology: CanonicalOntology,
  command: CanonicalOntologyAuthoringCommand
): { ontology?: CanonicalOntology; issues?: CanonicalValidationIssue[] } {
  if (command.type === 'batch' && command.commands.length > 100) {
    return {
      issues: [
        issue(
          'AUTHORING_BATCH_TOO_LARGE',
          'commands',
          'An authoring batch can contain at most 100 commands'
        ),
      ],
    };
  }
  let next = ontology;
  const commands: readonly CanonicalOntologyAuthoringMutation[] =
    command.type === 'batch' ? command.commands : [command];
  for (const mutation of commands) {
    const result = mutateSingleOntology(next, mutation);
    if (!result.ontology || result.issues?.length) return result;
    next = result.ontology;
  }
  const validation = validateCanonicalOntology(next);
  return validation.valid ? { ontology: next } : { issues: validation.issues };
}

export function getCanonicalOntologyAuthoringRevision(
  ontology: CanonicalOntology
): number {
  const revision = ontology.metadata?.[AUTHORING_REVISION_METADATA_KEY];
  return typeof revision === 'number' &&
    Number.isSafeInteger(revision) &&
    revision >= 0
    ? revision
    : 0;
}

export class CanonicalOntologyAuthoringService {
  constructor(private readonly store = new CanonicalOntologyStore()) {}

  async execute(
    command: CanonicalOntologyAuthoringCommand
  ): Promise<CanonicalOntologyAuthoringResult> {
    if (!command.permissions.includes(CANONICAL_ONTOLOGY_AUTHOR_PERMISSION)) {
      return {
        ok: false,
        issues: [
          issue(
            'PERMISSION_DENIED',
            'permissions',
            `Missing permission: ${CANONICAL_ONTOLOGY_AUTHOR_PERMISSION}`
          ),
        ],
      };
    }
    if (
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 0
    ) {
      return {
        ok: false,
        issues: [
          issue(
            'INVALID_REVISION',
            'expectedRevision',
            'expectedRevision must be a non-negative safe integer'
          ),
        ],
      };
    }
    if (!command.operationId.trim()) {
      return {
        ok: false,
        issues: [
          issue(
            'INVALID_OPERATION_ID',
            'operationId',
            'operationId is required'
          ),
        ],
      };
    }

    return this.store.compareAndSwapAuthoring({
      projectId: command.projectId,
      ontologyId: command.ontologyId,
      ontologyVersion: command.ontologyVersion,
      expectedRevision: command.expectedRevision,
      operationId: command.operationId,
      commandType: command.type,
      commandHash: hashCanonicalOntologyAuthoringCommand(command),
      audit: command.audit,
      mutate: (ontology) => mutateOntology(ontology, command),
    });
  }
}
