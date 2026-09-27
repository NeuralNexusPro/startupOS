import { createHash } from 'crypto';

import { CanonicalOntologyStore } from './canonical-ontology-store';
import {
  AUTHORING_REVISION_METADATA_KEY,
  CANONICAL_ONTOLOGY_AUTHOR_PERMISSION,
  type CanonicalOntologyAuthoringCommand,
  type CanonicalOntologyAuthoringResult,
} from './authoring-types';
import type { CanonicalOntology, CanonicalValidationIssue } from './types';
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

function mutateOntology(
  ontology: CanonicalOntology,
  command: CanonicalOntologyAuthoringCommand
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
  }

  if (mutationIssues) return { issues: mutationIssues };
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
