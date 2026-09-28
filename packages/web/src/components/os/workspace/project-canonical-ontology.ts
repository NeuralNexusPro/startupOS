import {
  AUTHORING_REVISION_METADATA_KEY,
  CANONICAL_ONTOLOGY_AUTHOR_PERMISSION,
  type CanonicalOntologyAuthoringBase,
  type CanonicalOntologyAuthoringCommand,
  type CanonicalOntologyAuthoringResult,
} from '@originos/core/lib/features/ontology/authoring-types';
import type {
  CanonicalOntology,
  CanonicalValidationIssue,
} from '@originos/core/lib/features/ontology/types';

import type { ProjectOntologyEntryResult } from '@originos/core/lib/features/project';
import type { OntologyModel } from '@originos/core/types';

export type CanonicalDisplayNode = OntologyModel['nodes'][number] & {
  semanticKind?: CanonicalOntology['concepts'][number]['semanticKind'];
  sourceConceptId?: string;
  targetConceptId?: string;
  relationName?: string;
  ruleIds?: string[];
};

export type CanonicalDisplayOntologyModel = Omit<OntologyModel, 'nodes'> & {
  nodes: CanonicalDisplayNode[];
  /**
   * Display-only behaviour contract projection.  The canonical ontology remains
   * the source of truth; this shape deliberately contains no mutation helpers.
   */
  behaviorContracts: CanonicalBehaviorContractDisplay;
};

export interface CanonicalRuleDisplay {
  id: string;
  name: string;
  kind: CanonicalOntology['rules'][number]['kind'];
  severity: CanonicalOntology['rules'][number]['severity'];
  description?: string;
  expression: unknown;
}

export interface CanonicalActionDisplay {
  id: string;
  name: string;
  objectName: string;
  inputFactTypes: string[];
  outputFactTypes: string[];
  beforeStates: string[];
  afterState?: string;
  ruleIds: string[];
  permissions: string[];
}

export interface CanonicalTransitionDisplay {
  id: string;
  name: string;
  objectName: string;
  fromState: string;
  toState: string;
  actionName?: string;
  ruleIds: string[];
}

export interface CanonicalBehaviorContractDisplay {
  rules: CanonicalRuleDisplay[];
  actions: CanonicalActionDisplay[];
  transitions: CanonicalTransitionDisplay[];
  relationRuleIds: Record<string, string[]>;
}

/** Read-only DTO for the later interview draft service and its review surface. */
export interface BehaviorDraftReviewDto {
  id: string;
  status: 'collecting' | 'ready' | 'needs_review' | 'published' | 'discarded';
  summary: string;
  candidateCount: number;
  confirmation?: {
    status: 'required' | 'confirmed' | 'not_required';
    confirmedAt?: string;
  };
  error?: string;
}

export interface ProjectCanonicalOntologyResponse {
  entry: ProjectOntologyEntryResult;
  ontology?: CanonicalOntology;
}

interface ApiEnvelope {
  success: boolean;
  data?: ProjectCanonicalOntologyResponse;
  error?: { message?: string };
}

interface AuthoringApiEnvelope {
  success: boolean;
  data?: CanonicalOntologyAuthoringResult;
  error?: {
    code?: string;
    message?: string;
    details?: CanonicalValidationIssue[];
  };
}

export type ProjectCanonicalOntologyMutation =
  CanonicalOntologyAuthoringCommand extends infer Command
    ? Command extends CanonicalOntologyAuthoringBase
      ? Omit<Command, keyof CanonicalOntologyAuthoringBase>
      : never
    : never;

export type ProjectCanonicalOntologyMutationOutcome =
  | { status: 'accepted'; ontology: CanonicalOntology }
  | {
      status: 'conflict';
      snapshot: ProjectCanonicalOntologyResponse;
      issues: CanonicalValidationIssue[];
    }
  | { status: 'rejected'; issues: CanonicalValidationIssue[] };

export async function loadProjectCanonicalOntology(
  projectId: string
): Promise<ProjectCanonicalOntologyResponse> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/ontology`
  );
  const payload = (await response.json()) as ApiEnvelope;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message ?? '无法读取项目本体。');
  }
  return payload.data;
}

export function canonicalAuthoringRevision(
  ontology: CanonicalOntology
): number {
  const value = ontology.metadata?.[AUTHORING_REVISION_METADATA_KEY];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function operationId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `ontology-authoring-${crypto.randomUUID()}`;
  }
  return `ontology-authoring-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Execute one canonical structure edit and recover the authoritative snapshot on CAS conflict. */
export async function mutateProjectCanonicalOntology(input: {
  projectId: string;
  ontology: CanonicalOntology;
  mutation: ProjectCanonicalOntologyMutation;
  operationId?: string;
}): Promise<ProjectCanonicalOntologyMutationOutcome> {
  const command: CanonicalOntologyAuthoringCommand = {
    projectId: input.projectId,
    ontologyId: input.ontology.id,
    ontologyVersion: input.ontology.version,
    expectedRevision: canonicalAuthoringRevision(input.ontology),
    operationId: input.operationId ?? operationId(),
    permissions: [CANONICAL_ONTOLOGY_AUTHOR_PERMISSION],
    ...input.mutation,
  } as CanonicalOntologyAuthoringCommand;
  const response = await fetch(
    `/api/projects/${encodeURIComponent(input.projectId)}/ontology`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }
  );
  const payload = (await response.json()) as AuthoringApiEnvelope;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message ?? '无法更新项目本体。');
  }
  if (payload.data.ok) {
    return { status: 'accepted', ontology: payload.data.ontology };
  }
  if (payload.data.issues.some(({ code }) => code === 'REVISION_CONFLICT')) {
    return {
      status: 'conflict',
      snapshot: await loadProjectCanonicalOntology(input.projectId),
      issues: payload.data.issues,
    };
  }
  return { status: 'rejected', issues: payload.data.issues };
}

export function describeCanonicalAuthoringIssues(
  issues: readonly CanonicalValidationIssue[]
): string {
  const first = issues[0];
  if (!first) {
    return '本体更新失败，请重试。';
  }
  if (first.code === 'REVISION_CONFLICT') {
    return '本体已被其他操作更新，已刷新为最新内容，请重新提交。';
  }
  if (first.code === 'PERMISSION_DENIED') {
    return '当前账号没有本体编辑权限。';
  }
  if (first.code === 'MISSING_REFERENCE') {
    return `仍有内容引用此结构：${first.path ?? first.message}`;
  }
  if (first.code === 'DUPLICATE_ID') {
    return '存在重复的本体标识，请修改后重试。';
  }
  return first.path ? `${first.message}（${first.path}）` : first.message;
}

export function canonicalConceptFields(
  ontology: CanonicalOntology,
  conceptId: string
): Array<{
  id: string;
  name: string;
  required: boolean;
  valueType: string;
  description?: string;
}> {
  return ontology.properties
    .filter((property) => property.conceptId === conceptId)
    .map((property) => ({
      id: property.id,
      name: property.name,
      required: property.required,
      valueType: property.valueType,
      description: property.description,
    }));
}

export function canonicalToOntologyModel(
  ontology: CanonicalOntology
): CanonicalDisplayOntologyModel {
  const properties = new Map<string, typeof ontology.properties>();
  for (const property of ontology.properties) {
    properties.set(property.conceptId, [
      ...(properties.get(property.conceptId) ?? []),
      property,
    ]);
  }
  const conceptsById = new Map(ontology.concepts.map((concept) => [concept.id, concept]));
  const factTypesById = new Map(ontology.factTypes.map((factType) => [factType.id, factType]));
  const statesById = new Map(ontology.businessStates.map((state) => [state.id, state]));
  const actionsById = new Map(ontology.actions.map((action) => [action.id, action]));
  const relationNodes = ontology.relations.flatMap((relation) => {
    const source = conceptsById.get(relation.sourceConceptId);
    const target = conceptsById.get(relation.targetConceptId);
    if (!source || !target) return [];
    return [{
      id: relation.id,
      name: `${source.name} → ${target.name}`,
      type: 'relationship' as const,
      sourceConceptId: relation.sourceConceptId,
      targetConceptId: relation.targetConceptId,
      relationName: relation.name,
      ruleIds: relation.ruleIds ?? [],
      description: relation.description
        ? `${relation.name}（${relation.description}）`
        : relation.name,
    }];
  });

  return {
    id: ontology.id,
    name: ontology.name,
    description: ontology.domains
      .map((domain) => domain.description)
      .filter(Boolean)
      .join('\n'),
    nodes: [
      ...ontology.concepts.map((concept) => ({
        id: concept.id,
        name: concept.name,
        type: concept.type === 'class' ? 'class' as const : 'entity' as const,
        semanticKind: concept.semanticKind ?? 'unclassified',
        description: concept.description,
        children: (properties.get(concept.id) ?? []).map((property) => ({
          id: property.id,
          name: property.name,
          type: 'property' as const,
          description: property.description,
        })),
      })),
      ...relationNodes,
    ],
    behaviorContracts: {
      rules: ontology.rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        kind: rule.kind,
        severity: rule.severity,
        description: rule.description,
        expression: rule.expression,
      })),
      actions: ontology.actions.map((action) => ({
        id: action.id,
        name: action.name,
        objectName: conceptsById.get(action.conceptId)?.name ?? action.conceptId,
        inputFactTypes: action.inputFactTypeIds.map((id) => factTypesById.get(id)?.name ?? id),
        outputFactTypes: action.outputFactTypeIds.map((id) => factTypesById.get(id)?.name ?? id),
        beforeStates: (action.fromStateIds ?? []).map((id) => statesById.get(id)?.name ?? id),
        afterState: action.toStateId ? (statesById.get(action.toStateId)?.name ?? action.toStateId) : undefined,
        ruleIds: action.ruleIds ?? [],
        permissions: action.permissions ?? [],
      })),
      transitions: ontology.transitions.map((transition) => ({
        id: transition.id,
        name: transition.name,
        objectName: conceptsById.get(transition.conceptId)?.name ?? transition.conceptId,
        fromState: statesById.get(transition.fromStateId)?.name ?? transition.fromStateId,
        toState: statesById.get(transition.toStateId)?.name ?? transition.toStateId,
        actionName: transition.actionId ? actionsById.get(transition.actionId)?.name ?? transition.actionId : undefined,
        ruleIds: transition.ruleIds ?? [],
      })),
      relationRuleIds: Object.fromEntries(ontology.relations.map((relation) => [relation.id, relation.ruleIds ?? []])),
    },
    createdAt: new Date(ontology.createdAt).getTime(),
  };
}
