// contract-bound 执行端口适配器——Readiness/Verifier/Outcome/HITL 的 canonical ontology 与 artifact 实现。

import { promises as fs } from 'node:fs';

import {
  extractJsonObject,
  parseArtifactRef,
  resolveTargetDirectory,
  sha256,
} from './contract-artifact-runtime';
import {
  ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF,
  ORIGINOS_ARTIFACT_VERIFIER_REF,
  type ContractArtifactEnvelope,
  type ProjectContractSessionPort,
} from './contract-runtime-types';
import {
  CanonicalOntologyOSDK,
  type CanonicalActionOutputDraft,
  type CanonicalFactReference,
} from '../../ontology';

import type {
  HitlOpenInput,
  WorkItemHitlPort,
  WorkItemReadinessInput,
  WorkItemReadinessPort,
  WorkItemReadinessResult,
} from '../../../../modules/collaboration-runtime/facade';
import type {
  ContractVerifierCandidate,
  FrozenOutcomeDraft,
  FrozenOutcomeDraftPort,
  VersionedContractVerifier,
  VersionedEvidenceSchema,
} from '../../../../modules/collaboration-runtime/integrations';

export function parseOntologyFactRef(ref: string): CanonicalFactReference | null {
  if (!ref.startsWith('ontology-fact:')) {return null;}
  const segments = ref.split(':');
  if (segments.length !== 7) {return null;}
  const [, ontologyId, ontologyVersion, conceptId, factTypeId, factId, factVersion] = segments;
  if (![ontologyId, ontologyVersion, conceptId, factTypeId, factId, factVersion]
    .every((value) => Boolean(value?.trim()))) {
    return null;
  }
  return {
    ontologyId: ontologyId!,
    ontologyVersion: ontologyVersion!,
    conceptId: conceptId!,
    factTypeId: factTypeId!,
    factId: factId!,
    factVersion: factVersion!,
  };
}

export class CanonicalReadiness implements WorkItemReadinessPort {
  constructor(
    private readonly dataRoot: string,
    private readonly osdk: Pick<CanonicalOntologyOSDK, 'queryFacts'>,
  ) {}

  async check(input: WorkItemReadinessInput): Promise<WorkItemReadinessResult> {
    try {
      const node = input.run.contract.topology.nodes.find(
        ({ id }) => id === input.workItem.designNodeId,
      );
      if (!node) {throw new Error('CONTRACT_NODE_NOT_FOUND');}
      const target = node.kind === 'agent'
        ? input.run.contract.agents.find(({ agentId }) => agentId === node.contractRef)
        : input.run.contract.skills.find(({ skillId }) => skillId === node.contractRef);
      if (!target) {throw new Error('CONTRACT_TARGET_NOT_FOUND');}
      if (target.permissions.some(
        (permission) => !input.run.contract.permissions.allowed.includes(permission),
      )) {
        throw new Error('TARGET_PERMISSION_NOT_ALLOWED');
      }
      if (node.kind === 'agent') {
        const agent = input.run.contract.agents.find(
          ({ agentId }) => agentId === node.contractRef,
        );
        if (!agent) {throw new Error('CONTRACT_TARGET_NOT_FOUND');}
        await resolveTargetDirectory(this.dataRoot, {
          projectId: input.run.projectId,
          target: { kind: 'agent', targetId: node.contractRef, contract: agent },
        });
      } else {
        const skill = input.run.contract.skills.find(
          ({ skillId }) => skillId === node.contractRef,
        );
        if (!skill) {throw new Error('CONTRACT_TARGET_NOT_FOUND');}
        await resolveTargetDirectory(this.dataRoot, {
          projectId: input.run.projectId,
          target: { kind: 'skill', targetId: node.contractRef, contract: skill },
        });
      }

      const incomingBindings = input.run.contract.topology.edges
        .filter(({ toNodeId }) => toNodeId === node.id)
        .map(({ factType }) => factType);
      const bindings = incomingBindings.length
        ? incomingBindings
        : input.run.contract.topology.externalInputs;
      for (const ref of input.requiredInputRefs) {
        if (ref.startsWith('artifact://')) {
          await fs.access(parseArtifactRef(this.dataRoot, ref));
          continue;
        }
        const exact = parseOntologyFactRef(ref);
        const binding = exact ?? bindings.find(({ factTypeId }) => factTypeId === ref);
        if (!binding) {throw new Error(`INPUT_REFERENCE_UNRESOLVED:${ref}`);}
        const facts = await this.osdk.queryFacts({
          projectId: input.run.projectId,
          ontologyId: binding.ontologyId,
          ontologyVersion: binding.ontologyVersion,
          conceptId: binding.conceptId,
          factTypeId: binding.factTypeId,
          latestOnly: exact === null,
        });
        if (facts.ok === false) {
          throw new Error('INPUT_FACT_QUERY_REJECTED');
        }
        const exists = exact
          ? facts.facts.some(({ ref: stored }) =>
              stored.ontologyId === exact.ontologyId
              && stored.ontologyVersion === exact.ontologyVersion
              && stored.conceptId === exact.conceptId
              && stored.factTypeId === exact.factTypeId
              && stored.factId === exact.factId
              && stored.factVersion === exact.factVersion
            )
          : facts.facts.length > 0;
        if (!exists) {throw new Error(`INPUT_FACT_NOT_FOUND:${ref}`);}
      }
      return {
        status: 'ready',
        receiptId: `${input.attempt.attemptId}:readiness`,
        inputRefs: [...input.requiredInputRefs],
        grantedPermissions: [...input.requiredPermissions],
        targetAvailable: true,
        stateRef: `${input.run.contract.semanticContext.ontology.ontologyId}@${input.run.contract.semanticContext.ontology.ontologyVersion}`,
      };
    } catch (error) {
      return {
        status: 'blocked',
        receiptId: `${input.attempt.attemptId}:readiness`,
        inputRefs: [],
        grantedPermissions: [],
        targetAvailable: false,
        reason: error instanceof Error ? error.message : 'READINESS_FAILED',
      };
    }
  }
}

export class ArtifactVerifier implements VersionedContractVerifier {
  readonly ref = ORIGINOS_ARTIFACT_VERIFIER_REF;

  constructor(private readonly dataRoot: string) {}

  async verify(input: Parameters<VersionedContractVerifier['verify']>[0]): Promise<ContractVerifierCandidate> {
    const refs = input.workerReceipt.outputRefs.filter((ref) => ref.startsWith('artifact://'));
    if (!refs.length) {
      return {
        status: 'failed',
        artifactRefs: [],
        resultRef: `${input.idempotencyKey}:verification`,
        evidence: {},
        reason: 'WORKER_ARTIFACT_MISSING',
      };
    }
    const artifacts = await Promise.all(refs.map(async (ref) => {
      const raw = await fs.readFile(parseArtifactRef(this.dataRoot, ref), 'utf8');
      const envelope = JSON.parse(raw) as ContractArtifactEnvelope;
      if (
        envelope.schemaVersion !== '1.0.0'
        || envelope.runId !== input.run.runId
        || envelope.workItemId !== input.workItem.id
        || envelope.attemptId !== input.attempt.attemptId
      ) {
        throw new Error('ARTIFACT_SCOPE_MISMATCH');
      }
      extractJsonObject(envelope.content);
      return { ref, contentHash: sha256(raw) };
    }));
    return {
      status: 'passed',
      artifactRefs: refs,
      resultRef: `${input.idempotencyKey}:verification`,
      evidence: { artifacts },
    };
  }
}

export const artifactEvidenceSchema: VersionedEvidenceSchema = {
  ref: ORIGINOS_ARTIFACT_EVIDENCE_SCHEMA_REF,
  validate({ candidate }) {
    const artifacts = candidate.evidence['artifacts'];
    return Array.isArray(artifacts) && artifacts.length > 0
      ? { valid: true }
      : { valid: false, reason: 'Artifact evidence is empty' };
  },
};

export function factReference(value: unknown): CanonicalFactReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid input fact reference');
  }
  const record = value as Record<string, unknown>;
  const required = [
    'ontologyId',
    'ontologyVersion',
    'conceptId',
    'factTypeId',
    'factId',
    'factVersion',
  ] as const;
  for (const field of required) {
    if (typeof record[field] !== 'string' || !(record[field] as string).trim()) {
      throw new TypeError(`Invalid input fact reference ${field}`);
    }
  }
  return record as unknown as CanonicalFactReference;
}

export function outputDraft(value: unknown): CanonicalActionOutputDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid action output');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record['factId'] !== 'string'
    || typeof record['factTypeId'] !== 'string'
    || !record['value']
    || typeof record['value'] !== 'object'
    || Array.isArray(record['value'])
    || !record['source']
    || typeof record['source'] !== 'object'
    || Array.isArray(record['source'])
  ) {
    throw new TypeError('Invalid action output');
  }
  const source = record['source'] as Record<string, unknown>;
  if (
    !['interview', 'manual', 'import', 'runtime'].includes(String(source['sourceType']))
    || typeof source['sourceId'] !== 'string'
  ) {
    throw new TypeError('Invalid action output source');
  }
  return record as unknown as CanonicalActionOutputDraft;
}

export class ArtifactOutcomeDrafts implements FrozenOutcomeDraftPort {
  constructor(private readonly dataRoot: string) {}

  async resolve(input: Parameters<FrozenOutcomeDraftPort['resolve']>[0]): Promise<FrozenOutcomeDraft> {
    const ref = input.workerReceipt.outputRefs.find((candidate) => candidate.startsWith('artifact://'));
    if (!ref) {throw new Error('OUTCOME_ARTIFACT_MISSING');}
    const raw = await fs.readFile(parseArtifactRef(this.dataRoot, ref), 'utf8');
    const envelope = JSON.parse(raw) as ContractArtifactEnvelope;
    const result = extractJsonObject(envelope.content);
    const outcome = result['outcome'];
    if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
      throw new Error('OUTCOME_DRAFT_MISSING');
    }
    const draft = outcome as Record<string, unknown>;
    if (
      typeof draft['actionId'] !== 'string'
      || !Array.isArray(draft['inputFactRefs'])
      || !Array.isArray(draft['outputs'])
      || !Number.isSafeInteger(draft['expectedRevision'])
      || (draft['expectedRevision'] as number) < 0
      || (draft['currentStateId'] !== undefined && typeof draft['currentStateId'] !== 'string')
    ) {
      throw new Error('OUTCOME_DRAFT_INVALID');
    }
    return {
      actionId: draft['actionId'],
      ...(typeof draft['currentStateId'] === 'string'
        ? { currentStateId: draft['currentStateId'] }
        : {}),
      inputFactRefs: draft['inputFactRefs'].map(factReference),
      outputs: draft['outputs'].map(outputDraft),
      expectedRevision: draft['expectedRevision'] as number,
    };
  }
}

export class ParentSessionHitl implements WorkItemHitlPort {
  constructor(private readonly sessions: ProjectContractSessionPort) {}

  async open(input: HitlOpenInput): Promise<void> {
    const sessionId = input.request.parentSessionId;
    if (!sessionId) {throw new Error('PARENT_SESSION_REQUIRED');}
    const updated = await this.sessions.addMessage(
      sessionId,
      {
        role: 'assistant',
        content: JSON.stringify({
          type: 'work_item_hitl',
          requestId: input.request.requestId,
          runId: input.run.runId,
          workItemId: input.request.workItemId,
          question: input.request.question,
          options: input.request.options,
        }),
        metadata: {
          collaborationRunId: input.run.runId,
          hitlRequestId: input.request.requestId,
        },
      },
      input.run.projectId,
    );
    if (!updated) {throw new Error('PARENT_SESSION_UNAVAILABLE');}
  }
}
