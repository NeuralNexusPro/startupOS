import { z } from 'zod';

import type {
  CanonicalOntologyAuthoringCommand,
} from './authoring-types';
import type { CanonicalValidationIssue } from './types';

const identifier = z.string().trim().min(1);
const date = z.coerce.date();
const stringArray = z.array(identifier);
const metadata = z.record(z.unknown());
const sourceReference = z.object({
  sourceType: z.enum(['interview', 'manual', 'import', 'runtime']),
  sourceId: identifier,
  sourceVersion: z.string().optional(),
  locator: z.string().optional(),
}).strict();
const semanticKind = z.enum([
  'role',
  'organization',
  'object',
  'activity',
  'document',
  'standard',
  'unclassified',
]);
const classificationSource = z.object({
  sourceRef: sourceReference.optional(),
  classifiedBy: z.enum(['agent', 'user']),
  userConfirmed: z.boolean(),
}).strict();

const domain = z.object({
  id: identifier,
  name: identifier,
  description: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  createdAt: date,
  updatedAt: date,
}).strict();

const concept = z.object({
  id: identifier,
  domainId: identifier,
  name: identifier,
  type: identifier,
  semanticKind: semanticKind.optional(),
  classificationSource: classificationSource.optional(),
  attributes: metadata,
  description: z.string().optional(),
  propertyIds: stringArray.optional(),
  sourceRefs: z.array(sourceReference).optional(),
  createdAt: date,
  updatedAt: date,
}).strict();

const property = z.object({
  id: identifier,
  conceptId: identifier,
  name: identifier,
  valueType: z.enum(['string', 'number', 'boolean', 'date', 'object', 'array', 'reference']),
  required: z.boolean(),
  description: z.string().optional(),
  referenceConceptId: identifier.optional(),
  metadata: metadata.optional(),
}).strict();

const relation = z.object({
  id: identifier,
  name: identifier,
  sourceConceptId: identifier,
  targetConceptId: identifier,
  cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many']),
  description: z.string().optional(),
  metadata: metadata.optional(),
}).strict();

const businessState = z.object({
  id: identifier,
  conceptId: identifier,
  name: identifier,
  initial: z.boolean().optional(),
  terminal: z.boolean().optional(),
  description: z.string().optional(),
}).strict();

const action = z.object({
  id: identifier,
  name: identifier,
  conceptId: identifier,
  inputFactTypeIds: stringArray,
  outputFactTypeIds: stringArray,
  fromStateIds: stringArray.optional(),
  toStateId: identifier.optional(),
  ruleIds: stringArray.optional(),
  permissions: stringArray.optional(),
  metadata: metadata.optional(),
}).strict();

const base = {
  projectId: identifier,
  ontologyId: identifier,
  ontologyVersion: identifier,
  expectedRevision: z.number().int().nonnegative().safe(),
  operationId: identifier,
  permissions: stringArray,
  audit: metadata.optional(),
};

const commandSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('domain.create'), value: domain }).strict(),
  z.object({ ...base, type: z.literal('domain.update'), domainId: identifier, patch: domain.omit({ id: true, createdAt: true, updatedAt: true }).partial().strict() }).strict(),
  z.object({ ...base, type: z.literal('domain.delete'), domainId: identifier }).strict(),
  z.object({ ...base, type: z.literal('concept.create'), value: concept }).strict(),
  z.object({ ...base, type: z.literal('concept.update'), conceptId: identifier, patch: concept.omit({ id: true, createdAt: true, updatedAt: true }).partial().strict() }).strict(),
  z.object({ ...base, type: z.literal('concept.delete'), conceptId: identifier }).strict(),
  z.object({ ...base, type: z.literal('property.create'), value: property }).strict(),
  z.object({ ...base, type: z.literal('property.update'), propertyId: identifier, patch: property.omit({ id: true }).partial().strict() }).strict(),
  z.object({ ...base, type: z.literal('property.delete'), propertyId: identifier }).strict(),
  z.object({ ...base, type: z.literal('relation.create'), value: relation }).strict(),
  z.object({ ...base, type: z.literal('relation.update'), relationId: identifier, patch: relation.omit({ id: true }).partial().strict() }).strict(),
  z.object({ ...base, type: z.literal('relation.delete'), relationId: identifier }).strict(),
  z.object({ ...base, type: z.literal('businessState.create'), value: businessState }).strict(),
  z.object({ ...base, type: z.literal('businessState.update'), businessStateId: identifier, patch: businessState.omit({ id: true }).partial().strict() }).strict(),
  z.object({ ...base, type: z.literal('businessState.delete'), businessStateId: identifier }).strict(),
  z.object({ ...base, type: z.literal('action.create'), value: action }).strict(),
  z.object({ ...base, type: z.literal('action.update'), actionId: identifier, patch: action.omit({ id: true }).partial().strict() }).strict(),
  z.object({ ...base, type: z.literal('action.delete'), actionId: identifier }).strict(),
]);

export type CanonicalOntologyAuthoringCommandParseResult =
  | { ok: true; command: CanonicalOntologyAuthoringCommand }
  | { ok: false; issues: CanonicalValidationIssue[] };

/** Parse the JSON/IPC representation before it reaches the authoring transaction. */
export function parseCanonicalOntologyAuthoringCommand(
  input: unknown
): CanonicalOntologyAuthoringCommandParseResult {
  const parsed = commandSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, command: parsed.data as CanonicalOntologyAuthoringCommand };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((entry) => ({
      code: 'INVALID_AUTHORING_COMMAND',
      message: entry.message,
      path: entry.path.join('.') || 'command',
      severity: 'error',
    })),
  };
}
