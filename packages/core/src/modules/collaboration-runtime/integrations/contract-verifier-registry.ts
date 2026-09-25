import { createHash } from 'node:crypto';

import type {
  VerifierExecutionInput,
  VerifierResult,
  WorkItemVerifierPort,
} from '../facade/contract-execution';

export type ContractVerifierFailureCode =
  | 'VERIFICATION_POLICY_MISSING'
  | 'VERIFICATION_POLICY_AMBIGUOUS'
  | 'VERIFIER_UNKNOWN'
  | 'EVIDENCE_SCHEMA_UNKNOWN'
  | 'VERIFIER_PLACEHOLDER'
  | 'VERIFIER_RESULT_INVALID'
  | 'EVIDENCE_SCHEMA_MISMATCH';

export class ContractVerifierError extends Error {
  constructor(
    readonly code: ContractVerifierFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'ContractVerifierError';
  }
}

export interface ContractVerifierCandidate {
  readonly status: 'passed' | 'failed' | 'placeholder';
  readonly artifactRefs: readonly string[];
  readonly resultRef: string;
  readonly evidence: Record<string, unknown>;
  readonly reason?: string;
}

export interface VersionedContractVerifier {
  /** Exact immutable reference, for example `artifact-exists@1.0.0`. */
  readonly ref: string;
  verify(input: VerifierExecutionInput): Promise<ContractVerifierCandidate>;
}

export interface EvidenceSchemaValidationInput {
  readonly execution: VerifierExecutionInput;
  readonly candidate: ContractVerifierCandidate;
}

export interface VersionedEvidenceSchema {
  /** Exact immutable reference, for example `artifact-evidence@1.0.0`. */
  readonly ref: string;
  validate(input: EvidenceSchemaValidationInput):
    | { readonly valid: true }
    | { readonly valid: false; readonly reason: string };
}

function versionedRef(value: string, field: string): void {
  if (!value.trim()) {
    throw new TypeError(`${field} must not be empty`);
  }
  if (!/(?:@|[-:/]v?)(?:0|[1-9]\d*)(?:\.\d+){0,2}$/.test(value)) {
    throw new TypeError(`${field} must contain an immutable numeric version: ${value}`);
  }
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

function contentHash(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')}`;
}

function exactArtifactRefs(
  candidate: ContractVerifierCandidate,
  input: VerifierExecutionInput,
): boolean {
  if (!candidate.artifactRefs.length) {
    return false;
  }
  const outputs = new Set(input.workerReceipt.outputRefs);
  return candidate.artifactRefs.every((ref) => outputs.has(ref));
}

/**
 * Strict registry for frozen execution contracts.
 *
 * There is deliberately no default verifier and no heuristic fallback. Both
 * references are resolved by exact string equality against immutable entries.
 */
export class VersionedContractVerifierRegistry implements WorkItemVerifierPort {
  private readonly verifiers = new Map<string, VersionedContractVerifier>();
  private readonly schemas = new Map<string, VersionedEvidenceSchema>();

  constructor(
    verifiers: readonly VersionedContractVerifier[],
    schemas: readonly VersionedEvidenceSchema[],
  ) {
    for (const verifier of verifiers) {
      versionedRef(verifier.ref, 'verifier ref');
      if (this.verifiers.has(verifier.ref)) {
        throw new TypeError(`Duplicate verifier ref: ${verifier.ref}`);
      }
      this.verifiers.set(verifier.ref, verifier);
    }
    for (const schema of schemas) {
      versionedRef(schema.ref, 'evidence schema ref');
      if (this.schemas.has(schema.ref)) {
        throw new TypeError(`Duplicate evidence schema ref: ${schema.ref}`);
      }
      this.schemas.set(schema.ref, schema);
    }
  }

  async verify(input: VerifierExecutionInput): Promise<VerifierResult> {
    const policies = input.run.contract.verification.filter(
      ({ nodeId }) => nodeId === input.workItem.designNodeId,
    );
    if (!policies.length) {
      throw new ContractVerifierError(
        'VERIFICATION_POLICY_MISSING',
        `No frozen verification policy for ${input.workItem.designNodeId}`,
      );
    }
    if (policies.length !== 1) {
      throw new ContractVerifierError(
        'VERIFICATION_POLICY_AMBIGUOUS',
        `Multiple frozen verification policies for ${input.workItem.designNodeId}`,
      );
    }
    const policy = policies[0]!;
    const verifier = this.verifiers.get(policy.verifierRef);
    if (!verifier) {
      throw new ContractVerifierError(
        'VERIFIER_UNKNOWN',
        `Unknown verifier: ${policy.verifierRef}`,
      );
    }
    const schema = this.schemas.get(policy.evidenceSchemaRef);
    if (!schema) {
      throw new ContractVerifierError(
        'EVIDENCE_SCHEMA_UNKNOWN',
        `Unknown evidence schema: ${policy.evidenceSchemaRef}`,
      );
    }

    const candidate = await verifier.verify(input);
    if (candidate.status === 'placeholder') {
      throw new ContractVerifierError(
        'VERIFIER_PLACEHOLDER',
        `Verifier ${policy.verifierRef} returned a placeholder`,
      );
    }
    if (
      !candidate.resultRef?.trim()
      || !candidate.artifactRefs?.length
      || !candidate.evidence
      || !exactArtifactRefs(candidate, input)
    ) {
      throw new ContractVerifierError(
        'VERIFIER_RESULT_INVALID',
        `Verifier ${policy.verifierRef} returned an incomplete or unbound result`,
      );
    }
    const validation = schema.validate({ execution: input, candidate });
    if (validation.valid === false) {
      throw new ContractVerifierError(
        'EVIDENCE_SCHEMA_MISMATCH',
        validation.reason,
      );
    }

    return {
      status: candidate.status,
      verificationMethod: policy.verifierRef,
      artifactRefs: [...candidate.artifactRefs],
      resultRef: candidate.resultRef,
      contentHash: contentHash({
        verifierRef: policy.verifierRef,
        evidenceSchemaRef: policy.evidenceSchemaRef,
        status: candidate.status,
        artifactRefs: [...candidate.artifactRefs],
        resultRef: candidate.resultRef,
        evidence: candidate.evidence,
      }),
      contractHash: input.run.contract.contractHash,
      reason: candidate.reason,
    };
  }
}
