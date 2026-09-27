import { createHash, timingSafeEqual } from 'node:crypto';

import {
  validateCanonicalContractFlow,
  type CanonicalContractFlow,
  type CanonicalOntology,
  type CanonicalValidationIssue,
} from '../ontology';
import {
  SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION,
  type ContractIntegrityResult,
  type DesignGap,
  type DesignValidationResult,
  type SolutionExecutionContract,
  type SolutionExecutionContractBody,
  type SolutionContractCompilationResult,
} from './types';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function freeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  Object.values(value as Record<string, unknown>).forEach(freeze);
  return value;
}

function gap(
  code: string,
  scope: DesignGap['scope'],
  path: string,
  message: string,
  remediation: string,
  refId?: string
): DesignGap {
  return {
    code,
    severity: 'error',
    scope,
    path,
    message,
    remediation,
    ...(refId ? { refId } : {}),
  };
}

function ontologyGap(issue: CanonicalValidationIssue): DesignGap {
  const path = issue.path ?? '';
  const match = /^nodes\[(\d+)]/.exec(path);
  return {
    code: issue.code,
    severity: issue.severity,
    scope: path.startsWith('edges[') ? 'edge' : match ? 'node' : 'contract',
    path,
    message: issue.message,
    remediation: 'Correct the referenced ontology contract before publishing.',
  };
}

function duplicates(values: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  values.forEach((value) =>
    seen.has(value) ? repeated.add(value) : seen.add(value)
  );
  return repeated;
}

function hasCycle(
  nodes: readonly string[],
  edges: readonly { fromNodeId: string; toNodeId: string }[]
): boolean {
  const incoming = new Map(nodes.map((id) => [id, 0]));
  const outgoing = new Map(nodes.map((id) => [id, [] as string[]]));
  edges.forEach(({ fromNodeId, toNodeId }) => {
    if (!incoming.has(fromNodeId) || !incoming.has(toNodeId)) return;
    incoming.set(toNodeId, incoming.get(toNodeId)! + 1);
    outgoing.get(fromNodeId)!.push(toNodeId);
  });
  const ready = nodes.filter((id) => incoming.get(id) === 0);
  let visited = 0;
  for (let index = 0; index < ready.length; index += 1) {
    const id = ready[index]!;
    visited += 1;
    outgoing.get(id)!.forEach((target) => {
      const count = incoming.get(target)! - 1;
      incoming.set(target, count);
      if (count === 0) ready.push(target);
    });
  }
  return visited !== nodes.length;
}

function contractFlow(
  body: SolutionExecutionContractBody
): CanonicalContractFlow {
  const agents = new Map(
    body.agents.map((contract) => [contract.agentId, contract])
  );
  const skills = new Map(
    body.skills.map((contract) => [contract.skillId, contract])
  );
  return {
    nodes: body.topology.nodes.flatMap((node) => {
      const contract =
        node.kind === 'agent'
          ? agents.get(node.contractRef)
          : skills.get(node.contractRef);
      return contract
        ? [
            {
              id: node.id,
              kind: node.kind,
              contract,
            } as CanonicalContractFlow['nodes'][number],
          ]
        : [];
    }),
    edges: [...body.topology.edges],
    externalInputs: [...body.topology.externalInputs],
  };
}

export function hashSolutionExecutionContract(
  body: SolutionExecutionContractBody
): string {
  return `sha256:${createHash('sha256').update(stableJson(body)).digest('hex')}`;
}

export function validateSolutionExecutionContract(
  ontology: CanonicalOntology,
  body: SolutionExecutionContractBody
): DesignValidationResult {
  const gaps: DesignGap[] = [];
  const nodes = body.topology.nodes;
  const nodeIds = nodes.map(({ id }) => id);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const agentIds = body.agents.map(({ agentId }) => agentId);
  const skillIds = body.skills.map(({ skillId }) => skillId);

  if (body.schemaVersion !== SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION) {
    gaps.push(
      gap(
        'SCHEMA_MISMATCH',
        'contract',
        'schemaVersion',
        'Unsupported execution contract schema.',
        'Use the current public schema version.'
      )
    );
  }
  for (const [path, value] of Object.entries({
    contractId: body.contractId,
    projectId: body.projectId,
    solutionId: body.solutionId,
    solutionVersion: body.solutionVersion,
  })) {
    if (!value.trim())
      gaps.push(
        gap(
          'REQUIRED_FIELD',
          'contract',
          path,
          `${path} is required.`,
          `Provide ${path}.`
        )
      );
  }
  if (!nodes.length)
    gaps.push(
      gap(
        'EMPTY_TOPOLOGY',
        'solution',
        'topology.nodes',
        'Topology must contain at least one node.',
        'Add a design node.'
      )
    );
  duplicates(nodeIds).forEach((id) =>
    gaps.push(
      gap(
        'DUPLICATE_ID',
        'node',
        'topology.nodes',
        `Duplicate node id: ${id}`,
        'Use a unique node id.',
        id
      )
    )
  );
  duplicates(agentIds).forEach((id) =>
    gaps.push(
      gap(
        'DUPLICATE_ID',
        'contract',
        'agents',
        `Duplicate agent id: ${id}`,
        'Publish one contract per agent.',
        id
      )
    )
  );
  duplicates(skillIds).forEach((id) =>
    gaps.push(
      gap(
        'DUPLICATE_ID',
        'contract',
        'skills',
        `Duplicate skill id: ${id}`,
        'Publish one contract per skill.',
        id
      )
    )
  );

  const agentSet = new Set(agentIds);
  const skillSet = new Set(skillIds);
  nodes.forEach((node, index) => {
    const known =
      node.kind === 'agent'
        ? agentSet.has(node.contractRef)
        : skillSet.has(node.contractRef);
    if (!known)
      gaps.push(
        gap(
          'MISSING_CONTRACT',
          'node',
          `topology.nodes[${index}].contractRef`,
          `Unknown ${node.kind} contract: ${node.contractRef}`,
          'Reference a published node contract.',
          node.id
        )
      );
    if (
      node.hitlPolicyId &&
      !body.hitl.some(({ id }) => id === node.hitlPolicyId)
    ) {
      gaps.push(
        gap(
          'MISSING_HITL_POLICY',
          'node',
          `topology.nodes[${index}].hitlPolicyId`,
          `Unknown HITL policy: ${node.hitlPolicyId}`,
          'Define the referenced HITL policy.',
          node.id
        )
      );
    }
    if (
      node.requiresVerification &&
      !body.verification.some(({ nodeId }) => nodeId === node.id)
    ) {
      gaps.push(
        gap(
          'MISSING_VERIFIER',
          'node',
          `topology.nodes[${index}]`,
          `Node ${node.id} requires verification.`,
          'Add a verifier and evidence schema.',
          node.id
        )
      );
    }
  });

  body.topology.edges.forEach((edge, index) => {
    if (!nodeById.has(edge.fromNodeId) || !nodeById.has(edge.toNodeId)) {
      gaps.push(
        gap(
          'MISSING_REFERENCE',
          'edge',
          `topology.edges[${index}]`,
          'Edge endpoint does not exist.',
          'Reference existing topology nodes.'
        )
      );
    } else if (edge.fromNodeId === edge.toNodeId) {
      gaps.push(
        gap(
          'SELF_DEPENDENCY',
          'edge',
          `topology.edges[${index}]`,
          'A node cannot depend on itself.',
          'Remove the self dependency.',
          edge.fromNodeId
        )
      );
    }
  });
  if (hasCycle(nodeIds, body.topology.edges)) {
    gaps.push(
      gap(
        'CYCLIC_TOPOLOGY',
        'solution',
        'topology.edges',
        'Topology contains a dependency cycle.',
        'Remove the cycle before publishing.'
      )
    );
  }
  if (nodes.length > 1) {
    const connected = new Set(
      body.topology.edges.flatMap(({ fromNodeId, toNodeId }) => [
        fromNodeId,
        toNodeId,
      ])
    );
    nodes
      .filter(({ id }) => !connected.has(id))
      .forEach(({ id }) => {
        gaps.push(
          gap(
            'ISOLATED_NODE',
            'node',
            'topology.nodes',
            `Node ${id} is isolated.`,
            'Connect or remove the node.',
            id
          )
        );
      });
  }

  duplicates(body.verification.map(({ id }) => id)).forEach((id) =>
    gaps.push(
      gap(
        'DUPLICATE_ID',
        'policy',
        'verification',
        `Duplicate verification policy id: ${id}`,
        'Use a unique policy id.',
        id
      )
    )
  );
  body.verification.forEach((policy, index) => {
    if (!nodeById.has(policy.nodeId))
      gaps.push(
        gap(
          'MISSING_REFERENCE',
          'policy',
          `verification[${index}].nodeId`,
          `Unknown node: ${policy.nodeId}`,
          'Reference an existing topology node.'
        )
      );
    if (!policy.verifierRef.trim() || !policy.evidenceSchemaRef.trim())
      gaps.push(
        gap(
          'INCOMPLETE_VERIFIER',
          'policy',
          `verification[${index}]`,
          'Verifier and evidence schema are required.',
          'Provide both verifierRef and evidenceSchemaRef.',
          policy.id
        )
      );
  });
  duplicates(body.hitl.map(({ id }) => id)).forEach((id) =>
    gaps.push(
      gap(
        'DUPLICATE_ID',
        'policy',
        'hitl',
        `Duplicate HITL policy id: ${id}`,
        'Use a unique policy id.',
        id
      )
    )
  );
  body.hitl.forEach((policy, index) => {
    if (!nodeById.has(policy.nodeId))
      gaps.push(
        gap(
          'MISSING_REFERENCE',
          'policy',
          `hitl[${index}].nodeId`,
          `Unknown node: ${policy.nodeId}`,
          'Reference an existing topology node.',
          policy.id
        )
      );
    if (!policy.approverRole.trim())
      gaps.push(
        gap(
          'INCOMPLETE_HITL_POLICY',
          'policy',
          `hitl[${index}].approverRole`,
          'HITL approver role is required.',
          'Provide a reviewed approver role.',
          policy.id
        )
      );
  });

  const allowed = new Set(body.permissions.allowed);
  [...body.agents, ...body.skills].forEach((contract) =>
    contract.permissions.forEach((permission) => {
      if (!allowed.has(permission))
        gaps.push(
          gap(
            'PERMISSION_DENIED',
            'policy',
            'permissions.allowed',
            `Contract permission is not allowed: ${permission}`,
            'Add the permission to the reviewed policy or remove it.'
          )
        );
    })
  );
  if (
    !Number.isSafeInteger(body.budget.maxAttempts) ||
    body.budget.maxAttempts < 1 ||
    !Number.isSafeInteger(body.budget.maxDurationMs) ||
    body.budget.maxDurationMs < 1 ||
    !Number.isSafeInteger(body.budget.maxTokens) ||
    body.budget.maxTokens < 1
  ) {
    gaps.push(
      gap(
        'INVALID_BUDGET',
        'policy',
        'budget',
        'Budget limits must be positive safe integers.',
        'Set positive attempts, duration, and token limits.'
      )
    );
  }
  if (
    body.semanticContext.ontology.ontologyId !== ontology.id ||
    body.semanticContext.ontology.ontologyVersion !== ontology.version
  ) {
    gaps.push(
      gap(
        'ONTOLOGY_VERSION_MISMATCH',
        'contract',
        'semanticContext.ontology',
        'Semantic context does not bind the supplied ontology version.',
        'Bind the exact confirmed ontology id and version.'
      )
    );
  }
  if (!body.semanticContext.sourceRefs.length) {
    gaps.push(
      gap(
        'MISSING_SOURCE_EVIDENCE',
        'contract',
        'semanticContext.sourceRefs',
        'Semantic context requires source evidence.',
        'Add interview, manual, or import source references.'
      )
    );
  }
  const conceptIds = new Set(ontology.concepts.map(({ id }) => id));
  const actionIds = new Set(ontology.actions.map(({ id }) => id));
  body.semanticContext.objectSlots.forEach((slot, index) => {
    if (
      slot.concept.ontologyId !== ontology.id ||
      slot.concept.ontologyVersion !== ontology.version ||
      !conceptIds.has(slot.concept.conceptId)
    ) {
      gaps.push(
        gap(
          'MISSING_REFERENCE',
          'contract',
          `semanticContext.objectSlots[${index}].concept`,
          `Unknown concept binding for slot ${slot.id}.`,
          'Bind the slot to a concept in the exact ontology version.',
          slot.id
        )
      );
    }
  });
  body.semanticContext.allowedActionIds.forEach((actionId, index) => {
    if (!actionIds.has(actionId))
      gaps.push(
        gap(
          'MISSING_REFERENCE',
          'contract',
          `semanticContext.allowedActionIds[${index}]`,
          `Unknown action: ${actionId}`,
          'Reference an action in the bound ontology.',
          actionId
        )
      );
  });
  body.semanticContext.taskTemplates.forEach((template, index) => {
    if (!nodeById.has(template.designNodeId))
      gaps.push(
        gap(
          'MISSING_REFERENCE',
          'contract',
          `semanticContext.taskTemplates[${index}].designNodeId`,
          `Unknown design node: ${template.designNodeId}`,
          'Reference an existing topology node.',
          template.id
        )
      );
    template.candidateAgentIds.forEach((id) => {
      if (!agentSet.has(id))
        gaps.push(
          gap(
            'MISSING_REFERENCE',
            'contract',
            `semanticContext.taskTemplates[${index}].candidateAgentIds`,
            `Unknown agent: ${id}`,
            'Reference a published agent contract.',
            template.id
          )
        );
    });
    template.candidateSkillIds.forEach((id) => {
      if (!skillSet.has(id))
        gaps.push(
          gap(
            'MISSING_REFERENCE',
            'contract',
            `semanticContext.taskTemplates[${index}].candidateSkillIds`,
            `Unknown skill: ${id}`,
            'Reference a published skill contract.',
            template.id
          )
        );
    });
  });

  const flowResolvable =
    duplicates(nodeIds).size === 0 &&
    duplicates(agentIds).size === 0 &&
    duplicates(skillIds).size === 0 &&
    nodes.every((node) =>
      node.kind === 'agent'
        ? agentSet.has(node.contractRef)
        : skillSet.has(node.contractRef)
    );
  if (flowResolvable) {
    gaps.push(
      ...validateCanonicalContractFlow(ontology, contractFlow(body)).issues.map(
        ontologyGap
      )
    );
  }
  return { valid: gaps.every(({ severity }) => severity !== 'error'), gaps };
}

export function compileSolutionExecutionContract(
  ontology: CanonicalOntology,
  solutionStatus: 'draft' | 'reviewing' | 'confirmed',
  body: SolutionExecutionContractBody
): SolutionContractCompilationResult {
  if (solutionStatus !== 'confirmed') {
    return {
      ok: false,
      gaps: [
        gap(
          'SOLUTION_NOT_CONFIRMED',
          'solution',
          'status',
          'Only a confirmed solution can be published.',
          'Confirm the solution version before publishing.'
        ),
      ],
    };
  }
  const validation = validateSolutionExecutionContract(ontology, body);
  if (!validation.valid) return { ok: false, gaps: validation.gaps };
  const copy = JSON.parse(stableJson(body)) as SolutionExecutionContractBody;
  return {
    ok: true,
    contract: freeze({
      ...copy,
      contractHash: hashSolutionExecutionContract(copy),
    }),
  };
}

export function verifySolutionExecutionContractIntegrity(
  contract: SolutionExecutionContract
): ContractIntegrityResult {
  if (contract.schemaVersion !== SOLUTION_EXECUTION_CONTRACT_SCHEMA_VERSION) {
    return {
      valid: false,
      code: 'SCHEMA_MISMATCH',
      message: `Unsupported schema version: ${contract.schemaVersion}`,
    };
  }
  const { contractHash, ...body } = contract;
  const expected = hashSolutionExecutionContract(body);
  const actualBytes = Buffer.from(contractHash);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
    ? { valid: true }
    : {
        valid: false,
        code: 'HASH_MISMATCH',
        message: 'Execution contract content does not match contractHash.',
      };
}
