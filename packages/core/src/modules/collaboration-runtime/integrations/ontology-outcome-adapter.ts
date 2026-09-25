import { createHash } from 'node:crypto';

import type {
  CanonicalActionOutputDraft,
  CanonicalActionSubmission,
  CanonicalActionSubmissionResult,
  CanonicalContract,
  CanonicalFactReference,
  CanonicalOntologyReference,
} from '../../../lib/features/ontology';
import type {
  OutcomeCommitInput,
  OutcomeReceipt,
  WorkItemOutcomePort,
} from '../facade/contract-execution';

export interface CanonicalActionSubmissionPort {
  submitAction(
    request: CanonicalActionSubmission,
  ): Promise<CanonicalActionSubmissionResult>;
}

export interface FrozenOutcomeDraft {
  readonly actionId: string;
  readonly currentStateId?: string;
  readonly inputFactRefs: readonly CanonicalFactReference[];
  readonly outputs: readonly CanonicalActionOutputDraft[];
  readonly expectedRevision: number;
}

export interface FrozenOutcomeDraftPort {
  resolve(input: OutcomeCommitInput): Promise<FrozenOutcomeDraft>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')}`;
}

function operationId(input: OutcomeCommitInput): string {
  return `outcome-${createHash('sha256')
    .update(input.idempotencyKey)
    .digest('hex')}`;
}

function factRef(ref: CanonicalFactReference): string {
  return [
    `${ref.ontologyId}@${ref.ontologyVersion}`,
    ref.conceptId,
    ref.factTypeId,
    `${ref.factId}@${ref.factVersion}`,
  ].join('/');
}

function acceptedVerification(input: OutcomeCommitInput): boolean {
  const policies = input.run.contract.verification.filter(
    ({ nodeId }) => nodeId === input.workItem.designNodeId,
  );
  const policy = policies.length === 1 ? policies[0] : undefined;
  const workerRefs = new Set(input.workerReceipt.outputRefs);
  return Boolean(
    policy
    && input.verifierResult.status === 'passed'
    && input.verifierResult.verificationMethod === policy.verifierRef
    && input.verifierResult.contractHash === input.run.contract.contractHash
    && input.verifierResult.contentHash
    && input.verifierResult.resultRef
    && input.verifierResult.artifactRefs?.length
    && input.verifierResult.artifactRefs.every((ref) => workerRefs.has(ref)),
  );
}

function ontologyBindingMatches(
  target: CanonicalContract,
  binding: CanonicalContract['actions'][number],
  ontology: CanonicalOntologyReference,
): boolean {
  return target.ontology.ontologyId === ontology.ontologyId
    && target.ontology.ontologyVersion === ontology.ontologyVersion
    && binding.concept.ontologyId === ontology.ontologyId
    && binding.concept.ontologyVersion === ontology.ontologyVersion;
}

function rejection(reason: string, id: string): OutcomeReceipt {
  return {
    receiptId: `${id}:rejected`,
    status: 'rejected',
    reason,
  };
}

/**
 * Maps a verified frozen WorkItem outcome to the canonical Ontology OSDK.
 * The adapter fixes identity, permissions and operation ID from the contract;
 * the draft resolver may only supply Action facts and revision data.
 */
export class CanonicalOntologyOutcomeAdapter implements WorkItemOutcomePort {
  constructor(
    private readonly actionPort: CanonicalActionSubmissionPort,
    private readonly drafts: FrozenOutcomeDraftPort,
  ) {}

  async commit(input: OutcomeCommitInput): Promise<OutcomeReceipt> {
    const id = operationId(input);
    const node = input.run.contract.topology.nodes.find(
      ({ id: nodeId }) => nodeId === input.workItem.designNodeId,
    );
    if (!node) {
      return rejection('CONTRACT_NODE_NOT_FOUND', id);
    }
    const target = node.kind === 'agent'
      ? input.run.contract.agents.find(({ agentId }) => agentId === node.contractRef)
      : input.run.contract.skills.find(({ skillId }) => skillId === node.contractRef);
    if (!target) {
      return rejection('CONTRACT_TARGET_NOT_FOUND', id);
    }
    if (!acceptedVerification(input)) {
      return rejection('VERIFICATION_NOT_ACCEPTED', id);
    }

    const draft = await this.drafts.resolve(input);
    const binding = target.actions.find(({ actionId }) => actionId === draft.actionId);
    if (!binding) {
      return rejection('ACTION_NOT_BOUND_TO_TARGET', id);
    }
    if (!input.run.contract.semanticContext.allowedActionIds.includes(draft.actionId)) {
      return rejection('ACTION_NOT_ALLOWED_BY_CONTRACT', id);
    }
    const ontology = input.run.contract.semanticContext.ontology;
    if (!ontologyBindingMatches(target, binding, ontology)) {
      return rejection('ONTOLOGY_BINDING_MISMATCH', id);
    }

    const allowed = new Set(input.run.contract.permissions.allowed);
    const permissions = target.permissions.filter((permission) => allowed.has(permission));
    const request: CanonicalActionSubmission = {
      projectId: input.run.projectId,
      ontologyId: ontology.ontologyId,
      ontologyVersion: ontology.ontologyVersion,
      operationId: id,
      actionId: draft.actionId,
      conceptId: binding.concept.conceptId,
      currentStateId: draft.currentStateId,
      permissions,
      inputFactRefs: draft.inputFactRefs,
      outputs: draft.outputs,
      expectedRevision: draft.expectedRevision,
      audit: {
        runId: input.run.runId,
        workItemId: input.workItem.id,
        attemptId: input.attempt.attemptId,
        contractId: input.run.contract.contractId,
        contractHash: input.run.contract.contractHash,
        verifierRef: input.verifierResult.verificationMethod,
        verifierHash: input.verifierResult.contentHash,
        workerReceiptId: input.workerReceipt.receiptId,
      },
    };
    const result = await this.actionPort.submitAction(request);
    if (result.ok === false) {
      return rejection(
        result.issues.map(({ code }) => code).sort().join(',') || 'ONTOLOGY_ACTION_REJECTED',
        id,
      );
    }
    const refs = result.receipt.factRefs.map(factRef).sort();
    return {
      receiptId: `${id}:accepted`,
      status: 'accepted',
      operationRef: `ontology-operation:${result.receipt.operationId}`,
      factRefs: refs,
      contentHash: hash({
        operationId: result.receipt.operationId,
        actionId: result.receipt.actionId,
        expectedRevision: result.receipt.expectedRevision,
        factRefs: refs,
      }),
    };
  }
}
