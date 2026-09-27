import type { CanonicalOntology } from '@originos/core/lib/features/ontology';
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

export async function loadProjectCanonicalOntology(projectId: string): Promise<ProjectCanonicalOntologyResponse> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ontology`);
  const payload = await response.json() as ApiEnvelope;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message ?? '无法读取项目本体。');
  }
  return payload.data;
}

export function canonicalConceptFields(ontology: CanonicalOntology, conceptId: string): Array<{
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

export function canonicalToOntologyModel(ontology: CanonicalOntology): OntologyModel {
  const properties = new Map<string, typeof ontology.properties>();
  for (const property of ontology.properties) {
    properties.set(property.conceptId, [...(properties.get(property.conceptId) ?? []), property]);
  }
  return {
    id: ontology.id,
    name: ontology.name,
    description: ontology.domains.map((domain) => domain.description).filter(Boolean).join('\n'),
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
