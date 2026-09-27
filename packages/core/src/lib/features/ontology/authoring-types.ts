import type {
  CanonicalAction,
  CanonicalBusinessState,
  CanonicalConcept,
  CanonicalDomain,
  CanonicalOntology,
  CanonicalProperty,
  CanonicalRelation,
  CanonicalValidationIssue,
} from './types';

export const CANONICAL_ONTOLOGY_AUTHOR_PERMISSION = 'ontology:author' as const;
export const AUTHORING_REVISION_METADATA_KEY =
  'originos.authoringRevision' as const;
export const LAST_AUTHORING_OPERATION_METADATA_KEY =
  'originos.lastAuthoringOperationId' as const;
export const LAST_AUTHORING_COMMAND_HASH_METADATA_KEY =
  'originos.lastAuthoringCommandHash' as const;

export interface CanonicalOntologyAuthoringBase {
  projectId: string;
  ontologyId: string;
  ontologyVersion: string;
  expectedRevision: number;
  operationId: string;
  permissions: readonly string[];
  audit?: Record<string, unknown>;
}

type TimedPatch<T extends { id: string; createdAt: Date; updatedAt: Date }> =
  Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;
type PlainPatch<T extends { id: string }> = Partial<Omit<T, 'id'>>;

export type CanonicalOntologyAuthoringCommand = CanonicalOntologyAuthoringBase &
  (
    | { type: 'domain.create'; value: CanonicalDomain }
    | {
        type: 'domain.update';
        domainId: string;
        patch: TimedPatch<CanonicalDomain>;
      }
    | { type: 'domain.delete'; domainId: string }
    | { type: 'concept.create'; value: CanonicalConcept }
    | {
        type: 'concept.update';
        conceptId: string;
        patch: TimedPatch<CanonicalConcept>;
      }
    | { type: 'concept.delete'; conceptId: string }
    | { type: 'property.create'; value: CanonicalProperty }
    | {
        type: 'property.update';
        propertyId: string;
        patch: PlainPatch<CanonicalProperty>;
      }
    | { type: 'property.delete'; propertyId: string }
    | { type: 'relation.create'; value: CanonicalRelation }
    | {
        type: 'relation.update';
        relationId: string;
        patch: PlainPatch<CanonicalRelation>;
      }
    | { type: 'relation.delete'; relationId: string }
    | { type: 'businessState.create'; value: CanonicalBusinessState }
    | {
        type: 'businessState.update';
        businessStateId: string;
        patch: PlainPatch<CanonicalBusinessState>;
      }
    | { type: 'businessState.delete'; businessStateId: string }
    | { type: 'action.create'; value: CanonicalAction }
    | {
        type: 'action.update';
        actionId: string;
        patch: PlainPatch<CanonicalAction>;
      }
    | { type: 'action.delete'; actionId: string }
  );

export interface CanonicalOntologyAuthoringSummary {
  ontologyId: string;
  ontologyVersion: string;
  projectId: string;
  revision: number;
  updatedAt: Date;
}

export interface CanonicalOntologyAuthoringReceipt {
  operationId: string;
  commandHash: string;
  commandType: CanonicalOntologyAuthoringCommand['type'];
  status: 'accepted';
  beforeRevision: number;
  afterRevision: number;
  recordedAt: Date;
  summary: CanonicalOntologyAuthoringSummary;
  audit?: Record<string, unknown>;
}

export type CanonicalOntologyAuthoringResult =
  | {
      ok: true;
      receipt: CanonicalOntologyAuthoringReceipt;
      ontology: CanonicalOntology;
    }
  | { ok: false; issues: CanonicalValidationIssue[] };

export interface CanonicalOntologyAuthoringMutationResult {
  ontology?: CanonicalOntology;
  issues?: CanonicalValidationIssue[];
}
