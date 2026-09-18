import type {
  CanonicalActionBinding,
  CanonicalAction,
  CanonicalConceptReference,
  CanonicalContract,
  CanonicalContractFlow,
  CanonicalFactType,
  CanonicalOntology,
  CanonicalValidationIssue,
  CanonicalValidationResult,
} from './types';
import { validateCanonicalOntology } from './validator';

type FactTypeReference = CanonicalConceptReference & { factTypeId: string };
type OntologyIndexes = {
  concepts: ReadonlySet<string>;
  factTypes: ReadonlyMap<string, CanonicalFactType>;
  actions: ReadonlyMap<string, CanonicalAction>;
};

function issue(code: string, path: string, message: string): CanonicalValidationIssue {
  return { code, message, path, severity: 'error' };
}

function result(issues: CanonicalValidationIssue[]): CanonicalValidationResult {
  return { valid: issues.length === 0, issues };
}

function referenceKey(reference: FactTypeReference): string {
  return JSON.stringify([
    reference.ontologyId,
    reference.ontologyVersion,
    reference.conceptId,
    reference.factTypeId,
  ]);
}

function indexOntology(ontology: CanonicalOntology): OntologyIndexes {
  return {
    concepts: new Set(ontology.concepts.map(({ id }) => id)),
    factTypes: new Map(ontology.factTypes.map((factType) => [factType.id, factType])),
    actions: new Map(ontology.actions.map((action) => [action.id, action])),
  };
}

function validateOntologyReference(
  ontology: CanonicalOntology,
  indexes: OntologyIndexes,
  reference: CanonicalConceptReference,
  path: string,
  issues: CanonicalValidationIssue[],
): boolean {
  let valid = true;
  if (reference.ontologyId !== ontology.id) {
    issues.push(issue('ONTOLOGY_ID_MISMATCH', `${path}.ontologyId`, `Expected ontology ${ontology.id}`));
    valid = false;
  }
  if (reference.ontologyVersion !== ontology.version) {
    issues.push(issue('ONTOLOGY_VERSION_MISMATCH', `${path}.ontologyVersion`, `Expected ontology version ${ontology.version}`));
    valid = false;
  }
  if (!indexes.concepts.has(reference.conceptId)) {
    issues.push(issue('MISSING_REFERENCE', `${path}.conceptId`, `Unknown concept: ${reference.conceptId}`));
    valid = false;
  }
  return valid;
}

function validateFactTypeReference(
  ontology: CanonicalOntology,
  indexes: OntologyIndexes,
  reference: FactTypeReference,
  path: string,
  issues: CanonicalValidationIssue[],
): boolean {
  let valid = validateOntologyReference(ontology, indexes, reference, path, issues);
  const factType = indexes.factTypes.get(reference.factTypeId);
  if (!factType) {
    issues.push(issue('MISSING_REFERENCE', `${path}.factTypeId`, `Unknown fact type: ${reference.factTypeId}`));
    return false;
  }
  if (factType.conceptId !== reference.conceptId) {
    issues.push(issue(
      'INVALID_CONCEPT_BINDING',
      `${path}.conceptId`,
      `Fact type ${factType.id} belongs to concept ${factType.conceptId}, not ${reference.conceptId}`,
    ));
    valid = false;
  }
  return valid;
}

function validateActionBinding(
  ontology: CanonicalOntology,
  indexes: OntologyIndexes,
  binding: CanonicalActionBinding,
  path: string,
  permissionsPath: string,
  permissions: ReadonlySet<string>,
  issues: CanonicalValidationIssue[],
): void {
  validateOntologyReference(ontology, indexes, binding.concept, `${path}.concept`, issues);
  const action = indexes.actions.get(binding.actionId);
  if (!action) {
    issues.push(issue('ACTION_NOT_FOUND', `${path}.actionId`, `Unknown action: ${binding.actionId}`));
    return;
  }
  if (action.conceptId !== binding.concept.conceptId) {
    issues.push(issue(
      'ACTION_CONCEPT_MISMATCH',
      `${path}.concept.conceptId`,
      `Action ${action.id} belongs to concept ${action.conceptId}`,
    ));
  }
  action.permissions?.forEach((permission) => {
    if (!permissions.has(permission)) {
      issues.push(issue('PERMISSION_DENIED', permissionsPath, `Missing permission for action ${action.id}: ${permission}`));
    }
  });
}

function validateContract(
  ontology: CanonicalOntology,
  indexes: OntologyIndexes,
  contract: CanonicalContract,
  basePath: string,
): CanonicalValidationIssue[] {
  const issues: CanonicalValidationIssue[] = [];
  if (contract.ontology.ontologyId !== ontology.id) {
    issues.push(issue('ONTOLOGY_ID_MISMATCH', `${basePath}ontology.ontologyId`, `Expected ontology ${ontology.id}`));
  }
  if (contract.ontology.ontologyVersion !== ontology.version) {
    issues.push(issue('ONTOLOGY_VERSION_MISMATCH', `${basePath}ontology.ontologyVersion`, `Expected ontology version ${ontology.version}`));
  }

  for (const field of ['inputs', 'outputs'] as const) {
    const seen = new Set<string>();
    contract[field].forEach(({ factType }, index) => {
      const path = `${basePath}${field}[${index}].factType`;
      const key = referenceKey(factType);
      if (seen.has(key)) {
        issues.push(issue('DUPLICATE_REFERENCE', path, `Duplicate ${field} fact type: ${factType.factTypeId}`));
      } else {
        seen.add(key);
      }
      validateFactTypeReference(ontology, indexes, factType, path, issues);
    });
  }

  const seenActions = new Set<string>();
  const permissions = new Set(contract.permissions);
  contract.actions.forEach((binding, index) => {
    const path = `${basePath}actions[${index}]`;
    const key = JSON.stringify([
      binding.concept.ontologyId,
      binding.concept.ontologyVersion,
      binding.concept.conceptId,
      binding.actionId,
    ]);
    if (seenActions.has(key)) {
      issues.push(issue('DUPLICATE_REFERENCE', path, `Duplicate action binding: ${binding.actionId}`));
    } else {
      seenActions.add(key);
    }
    validateActionBinding(ontology, indexes, binding, path, `${basePath}permissions`, permissions, issues);
  });
  return issues;
}

export function validateCanonicalContract(
  ontology: CanonicalOntology,
  contract: CanonicalContract,
): CanonicalValidationResult {
  const ontologyResult = validateCanonicalOntology(ontology);
  return ontologyResult.valid
    ? result(validateContract(ontology, indexOntology(ontology), contract, ''))
    : ontologyResult;
}

export function validateCanonicalContractFlow(
  ontology: CanonicalOntology,
  flow: CanonicalContractFlow,
): CanonicalValidationResult {
  const ontologyResult = validateCanonicalOntology(ontology);
  if (!ontologyResult.valid) return ontologyResult;

  const issues: CanonicalValidationIssue[] = [];
  const indexes = indexOntology(ontology);
  const nodes = new Map<string, CanonicalContractFlow['nodes'][number]>();
  flow.nodes.forEach((node, index) => {
    if (nodes.has(node.id)) {
      issues.push(issue('DUPLICATE_ID', `nodes[${index}].id`, `Duplicate nodes id: ${node.id}`));
    } else {
      nodes.set(node.id, node);
    }
    issues.push(...validateContract(ontology, indexes, node.contract, `nodes[${index}].contract.`));
  });

  const externalInputs = new Set<string>();
  flow.externalInputs.forEach((reference, index) => {
    if (validateFactTypeReference(ontology, indexes, reference, `externalInputs[${index}]`, issues)) {
      externalInputs.add(referenceKey(reference));
    }
  });

  const suppliedInputs = new Map<string, Set<string>>();
  flow.edges.forEach((edge, index) => {
    const path = `edges[${index}]`;
    const from = nodes.get(edge.fromNodeId);
    const to = nodes.get(edge.toNodeId);
    if (!from) issues.push(issue('MISSING_REFERENCE', `${path}.fromNodeId`, `Unknown node: ${edge.fromNodeId}`));
    if (!to) issues.push(issue('MISSING_REFERENCE', `${path}.toNodeId`, `Unknown node: ${edge.toNodeId}`));

    const validFactType = validateFactTypeReference(ontology, indexes, edge.factType, `${path}.factType`, issues);
    const key = referenceKey(edge.factType);
    const produced = from?.contract.outputs.some(({ factType }) => referenceKey(factType) === key) ?? false;
    const consumed = to?.contract.inputs.some(({ factType }) => referenceKey(factType) === key) ?? false;
    if (from && !produced) {
      issues.push(issue('OUTPUT_NOT_PRODUCED', `${path}.factType`, `Node ${from.id} does not produce ${edge.factType.factTypeId}`));
    }
    if (to && !consumed) {
      issues.push(issue('INPUT_NOT_CONSUMED', `${path}.factType`, `Node ${to.id} does not consume ${edge.factType.factTypeId}`));
    }
    if (validFactType && from && to && produced && consumed) {
      const supplied = suppliedInputs.get(to.id) ?? new Set<string>();
      supplied.add(key);
      suppliedInputs.set(to.id, supplied);
    }
  });

  flow.nodes.forEach((node, nodeIndex) => {
    node.contract.inputs.forEach((input, inputIndex) => {
      const key = referenceKey(input.factType);
      if (input.required && !externalInputs.has(key) && !suppliedInputs.get(node.id)?.has(key)) {
        issues.push(issue(
          'REQUIRED_INPUT_UNBOUND',
          `nodes[${nodeIndex}].contract.inputs[${inputIndex}]`,
          `Required input ${input.factType.factTypeId} has no source`,
        ));
      }
    });
  });
  return result(issues);
}
