import {
  AUTHORING_REVISION_METADATA_KEY,
  CANONICAL_ONTOLOGY_AUTHOR_PERMISSION,
  type CanonicalOntology,
  type CanonicalOntologyAuthoringBase,
  type CanonicalOntologyAuthoringCommand,
  type CanonicalOntologyAuthoringResult,
  type CanonicalValidationIssue,
} from '@originos/core/lib/features/ontology';

import type { ProjectOntologyEntryResult } from '@originos/core/lib/features/project';
import type { OntologyModel } from '@originos/core/types';

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
): OntologyModel {
  const properties = new Map<string, typeof ontology.properties>();
  for (const property of ontology.properties) {
    properties.set(property.conceptId, [
      ...(properties.get(property.conceptId) ?? []),
      property,
    ]);
  }
  return {
    id: ontology.id,
    name: ontology.name,
    description: ontology.domains
      .map((domain) => domain.description)
      .filter(Boolean)
      .join('\n'),
    nodes: ontology.concepts.map((concept) => ({
      id: concept.id,
      name: concept.name,
      type: concept.type === 'class' ? 'class' : 'entity',
      description: concept.description,
      children: (properties.get(concept.id) ?? []).map((property) => ({
        id: property.id,
        name: property.name,
        type: 'property' as const,
        description: property.description,
      })),
    })),
    createdAt: new Date(ontology.createdAt).getTime(),
  };
}
