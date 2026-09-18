import type {
  CanonicalActionValidationInput,
  CanonicalOntology,
  CanonicalValidationIssue,
  CanonicalValidationResult,
} from './types';

type Identified = { id: string };

function result(issues: CanonicalValidationIssue[]): CanonicalValidationResult {
  return { valid: issues.length === 0, issues };
}

function issue(code: string, path: string, message: string): CanonicalValidationIssue {
  return { code, message, path, severity: 'error' };
}

function indexCollection<T extends Identified>(
  items: readonly T[],
  path: string,
  issues: CanonicalValidationIssue[],
): Map<string, T> {
  const index = new Map<string, T>();
  items.forEach((item, itemIndex) => {
    if (index.has(item.id)) {
      issues.push(issue('DUPLICATE_ID', `${path}[${itemIndex}].id`, `Duplicate ${path} id: ${item.id}`));
    } else {
      index.set(item.id, item);
    }
  });
  return index;
}

function requireReference(
  index: ReadonlyMap<string, Identified>,
  id: string,
  path: string,
  kind: string,
  issues: CanonicalValidationIssue[],
): boolean {
  if (index.has(id)) return true;
  issues.push(issue('MISSING_REFERENCE', path, `Unknown ${kind}: ${id}`));
  return false;
}

function requireConceptBinding(
  item: { conceptId: string } | undefined,
  conceptId: string,
  path: string,
  kind: string,
  issues: CanonicalValidationIssue[],
  code = 'INVALID_CONCEPT_BINDING',
): void {
  if (item && item.conceptId !== conceptId) {
    issues.push(issue(code, path, `${kind} belongs to concept ${item.conceptId}, not ${conceptId}`));
  }
}

export function validateCanonicalOntology(ontology: CanonicalOntology): CanonicalValidationResult {
  const issues: CanonicalValidationIssue[] = [];
  const domains = indexCollection(ontology.domains, 'domains', issues);
  const concepts = indexCollection(ontology.concepts, 'concepts', issues);
  indexCollection(ontology.instances, 'instances', issues);
  const properties = indexCollection(ontology.properties, 'properties', issues);
  indexCollection(ontology.relations, 'relations', issues);
  const states = indexCollection(ontology.businessStates, 'businessStates', issues);
  indexCollection(ontology.transitions, 'transitions', issues);
  const factTypes = indexCollection(ontology.factTypes, 'factTypes', issues);
  const rules = indexCollection(ontology.rules, 'rules', issues);
  const actions = indexCollection(ontology.actions, 'actions', issues);
  indexCollection(ontology.events, 'events', issues);
  indexCollection(ontology.projections, 'projections', issues);

  ontology.concepts.forEach((concept, index) => {
    requireReference(domains, concept.domainId, `concepts[${index}].domainId`, 'domain', issues);
    concept.propertyIds?.forEach((propertyId, propertyIndex) => {
      const path = `concepts[${index}].propertyIds[${propertyIndex}]`;
      if (requireReference(properties, propertyId, path, 'property', issues)) {
        requireConceptBinding(properties.get(propertyId), concept.id, path, 'Property', issues);
      }
    });
  });

  ontology.instances.forEach((instance, index) => {
    requireReference(concepts, instance.conceptId, `instances[${index}].conceptId`, 'concept', issues);
    if (instance.stateId) {
      const path = `instances[${index}].stateId`;
      if (requireReference(states, instance.stateId, path, 'business state', issues)) {
        requireConceptBinding(states.get(instance.stateId), instance.conceptId, path, 'Business state', issues, 'INVALID_STATE_BINDING');
      }
    }
  });

  ontology.properties.forEach((property, index) => {
    requireReference(concepts, property.conceptId, `properties[${index}].conceptId`, 'concept', issues);
    if (property.referenceConceptId) {
      requireReference(concepts, property.referenceConceptId, `properties[${index}].referenceConceptId`, 'concept', issues);
    }
  });

  ontology.relations.forEach((relation, index) => {
    requireReference(concepts, relation.sourceConceptId, `relations[${index}].sourceConceptId`, 'concept', issues);
    requireReference(concepts, relation.targetConceptId, `relations[${index}].targetConceptId`, 'concept', issues);
  });

  ontology.businessStates.forEach((state, index) => {
    requireReference(concepts, state.conceptId, `businessStates[${index}].conceptId`, 'concept', issues);
  });

  ontology.transitions.forEach((transition, index) => {
    requireReference(concepts, transition.conceptId, `transitions[${index}].conceptId`, 'concept', issues);
    for (const [field, stateId] of [['fromStateId', transition.fromStateId], ['toStateId', transition.toStateId]] as const) {
      const path = `transitions[${index}].${field}`;
      if (requireReference(states, stateId, path, 'business state', issues)) {
        requireConceptBinding(states.get(stateId), transition.conceptId, path, 'Business state', issues, 'INVALID_STATE_BINDING');
      }
    }
    if (transition.actionId) {
      const path = `transitions[${index}].actionId`;
      if (requireReference(actions, transition.actionId, path, 'action', issues)) {
        requireConceptBinding(actions.get(transition.actionId), transition.conceptId, path, 'Action', issues);
      }
    }
    transition.ruleIds?.forEach((ruleId, ruleIndex) => {
      requireReference(rules, ruleId, `transitions[${index}].ruleIds[${ruleIndex}]`, 'rule', issues);
    });
  });

  ontology.factTypes.forEach((factType, index) => {
    requireReference(concepts, factType.conceptId, `factTypes[${index}].conceptId`, 'concept', issues);
    factType.propertyIds.forEach((propertyId, propertyIndex) => {
      const path = `factTypes[${index}].propertyIds[${propertyIndex}]`;
      if (requireReference(properties, propertyId, path, 'property', issues)) {
        requireConceptBinding(properties.get(propertyId), factType.conceptId, path, 'Property', issues);
      }
    });
  });

  ontology.actions.forEach((action, index) => {
    requireReference(concepts, action.conceptId, `actions[${index}].conceptId`, 'concept', issues);
    for (const field of ['inputFactTypeIds', 'outputFactTypeIds'] as const) {
      action[field].forEach((factTypeId, factTypeIndex) => {
        const path = `actions[${index}].${field}[${factTypeIndex}]`;
        requireReference(factTypes, factTypeId, path, 'fact type', issues);
      });
    }
    action.fromStateIds?.forEach((stateId, stateIndex) => {
      const path = `actions[${index}].fromStateIds[${stateIndex}]`;
      if (requireReference(states, stateId, path, 'business state', issues)) {
        requireConceptBinding(states.get(stateId), action.conceptId, path, 'Business state', issues, 'INVALID_STATE_BINDING');
      }
    });
    if (action.toStateId) {
      const path = `actions[${index}].toStateId`;
      if (requireReference(states, action.toStateId, path, 'business state', issues)) {
        requireConceptBinding(states.get(action.toStateId), action.conceptId, path, 'Business state', issues, 'INVALID_STATE_BINDING');
      }
    }
    action.ruleIds?.forEach((ruleId, ruleIndex) => {
      requireReference(rules, ruleId, `actions[${index}].ruleIds[${ruleIndex}]`, 'rule', issues);
    });
  });

  ontology.events.forEach((event, index) => {
    requireReference(concepts, event.conceptId, `events[${index}].conceptId`, 'concept', issues);
    const factPath = `events[${index}].factTypeId`;
    if (requireReference(factTypes, event.factTypeId, factPath, 'fact type', issues)) {
      requireConceptBinding(factTypes.get(event.factTypeId), event.conceptId, factPath, 'Fact type', issues);
    }
    if (event.actionId) {
      const actionPath = `events[${index}].actionId`;
      if (requireReference(actions, event.actionId, actionPath, 'action', issues)) {
        requireConceptBinding(actions.get(event.actionId), event.conceptId, actionPath, 'Action', issues);
      }
    }
  });

  ontology.projections.forEach((projection, index) => {
    requireReference(concepts, projection.targetConceptId, `projections[${index}].targetConceptId`, 'concept', issues);
    projection.sourceFactTypeIds.forEach((factTypeId, factTypeIndex) => {
      requireReference(factTypes, factTypeId, `projections[${index}].sourceFactTypeIds[${factTypeIndex}]`, 'fact type', issues);
    });
  });

  return result(issues);
}

export function validateCanonicalAction(input: CanonicalActionValidationInput): CanonicalValidationResult {
  const ontologyResult = validateCanonicalOntology(input.ontology);
  if (!ontologyResult.valid) return ontologyResult;

  const issues: CanonicalValidationIssue[] = [];
  if (input.ontologyId !== input.ontology.id) {
    issues.push(issue('ONTOLOGY_ID_MISMATCH', 'ontologyId', `Expected ontology ${input.ontology.id}`));
  }
  if (input.ontologyVersion !== input.ontology.version) {
    issues.push(issue('ONTOLOGY_VERSION_MISMATCH', 'ontologyVersion', `Expected ontology version ${input.ontology.version}`));
  }

  const action = input.ontology.actions.find(({ id }) => id === input.actionId);
  if (!action) {
    issues.push(issue('ACTION_NOT_FOUND', 'actionId', `Unknown action: ${input.actionId}`));
    return result(issues);
  }
  if (action.conceptId !== input.conceptId) {
    issues.push(issue('ACTION_CONCEPT_MISMATCH', 'conceptId', `Action ${action.id} belongs to concept ${action.conceptId}`));
  }

  if (action.fromStateIds?.length) {
    if (!input.currentStateId) {
      issues.push(issue('STATE_REQUIRED', 'currentStateId', `Action ${action.id} requires a current state`));
    } else {
      const state = input.ontology.businessStates.find(({ id }) => id === input.currentStateId);
      if (!state) {
        issues.push(issue('MISSING_REFERENCE', 'currentStateId', `Unknown business state: ${input.currentStateId}`));
      } else if (state.conceptId !== action.conceptId) {
        issues.push(issue('INVALID_STATE_BINDING', 'currentStateId', `Business state belongs to concept ${state.conceptId}, not ${action.conceptId}`));
      } else if (!action.fromStateIds.includes(input.currentStateId)) {
        issues.push(issue('STATE_NOT_ALLOWED', 'currentStateId', `State ${input.currentStateId} is not allowed for action ${action.id}`));
      }
    }
  }

  const permissions = new Set(input.permissions);
  action.permissions?.forEach((permission, index) => {
    if (!permissions.has(permission)) {
      issues.push(issue('PERMISSION_DENIED', `permissions[${index}]`, `Missing permission: ${permission}`));
    }
  });
  return result(issues);
}
