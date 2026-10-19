import type { CanonicalOntology } from '@originos/core/lib/features/ontology/types';

/**
 * Derive interview completion only from the persisted canonical contract.
 * Model text and draft status are deliberately excluded from this decision.
 */
export function isCanonicalInterviewComplete(
  ontology: CanonicalOntology | null | undefined
): boolean {
  if (!ontology) return false;
  if (
    ontology.concepts.length === 0 ||
    ontology.relations.length === 0 ||
    ontology.factTypes.length === 0 ||
    ontology.actions.length === 0 ||
    ontology.rules.length === 0
  ) {
    return false;
  }

  const conceptsWithFactTypes = new Set(
    ontology.factTypes.map((factType) => factType.conceptId)
  );
  if (ontology.concepts.some((concept) => !conceptsWithFactTypes.has(concept.id))) {
    return false;
  }

  const properties = new Map(
    ontology.properties.map((property) => [property.id, property])
  );
  return ontology.concepts
    .filter((concept) => concept.semanticKind === 'document')
    .every((concept) => {
      if (!concept.propertyIds || concept.propertyIds.length === 0) {
        return false;
      }
      return concept.propertyIds.every(
        (propertyId) => properties.get(propertyId)?.conceptId === concept.id
      );
    });
}

/**
 * Concepts and relations exist, while executable behavior has not been published yet.
 * Keep this derived from the same canonical snapshot as interview completion so the
 * right-hand review prompt cannot remain visible after the completion handoff appears.
 */
export function isInterviewBehaviorModelingRequired(
  ontology: CanonicalOntology | null | undefined
): boolean {
  if (!ontology) return false;

  const conceptsWithFactTypes = new Set(
    ontology.factTypes.map((factType) => factType.conceptId)
  );
  return ontology.concepts.length > 0
    && ontology.relations.length > 0
    && (ontology.actions.length === 0
      || ontology.rules.length === 0
      || ontology.concepts.some((concept) => !conceptsWithFactTypes.has(concept.id)));
}
