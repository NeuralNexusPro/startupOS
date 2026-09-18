import { createHash } from 'node:crypto';

import { CanonicalOntologyStore } from './canonical-ontology-store';
import type {
  CanonicalActionSubmission,
  CanonicalActionSubmissionResult,
  CanonicalFactQuery,
  CanonicalFactQueryResult,
  CanonicalFactRecord,
  CanonicalFactReference,
  CanonicalOperationRecord,
  CanonicalValidationIssue,
} from './types';
import { validateCanonicalAction, validateCanonicalOntology } from './validator';

function issue(code: string, path: string, message: string): CanonicalValidationIssue {
  return { code, path, message, severity: 'error' };
}

function sameFactRef(left: CanonicalFactReference, right: CanonicalFactReference): boolean {
  return left.ontologyId === right.ontologyId
    && left.ontologyVersion === right.ontologyVersion
    && left.conceptId === right.conceptId
    && left.factTypeId === right.factTypeId
    && left.factId === right.factId
    && left.factVersion === right.factVersion;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function requestFingerprint(request: CanonicalActionSubmission): string {
  return createHash('sha256').update(JSON.stringify(stableValue(request))).digest('hex');
}

function operationFingerprint(record: CanonicalOperationRecord): string | undefined {
  const value = record.metadata?.requestFingerprint;
  return typeof value === 'string' ? value : undefined;
}

export class CanonicalOntologyOSDK {
  private submissionTail: Promise<void> = Promise.resolve();

  constructor(private readonly store = new CanonicalOntologyStore()) {}

  async queryFacts(query: CanonicalFactQuery): Promise<CanonicalFactQueryResult> {
    const stored = await this.store.readOntology(query.projectId);
    if (!stored) return { ok: false, issues: [issue('ONTOLOGY_NOT_FOUND', 'projectId', `No ontology for project ${query.projectId}`)] };

    const ontology = stored.data;
    const validation = validateCanonicalOntology(ontology);
    if (!validation.valid) return { ok: false, issues: validation.issues };

    const issues: CanonicalValidationIssue[] = [];
    if (ontology.projectId !== query.projectId) {
      issues.push(issue('PROJECT_ID_MISMATCH', 'projectId', `Expected project ${ontology.projectId}`));
    }
    if (ontology.id !== query.ontologyId) {
      issues.push(issue('ONTOLOGY_ID_MISMATCH', 'ontologyId', `Expected ontology ${ontology.id}`));
    }
    if (ontology.version !== query.ontologyVersion) {
      issues.push(issue('ONTOLOGY_VERSION_MISMATCH', 'ontologyVersion', `Expected ontology version ${ontology.version}`));
    }
    const concept = query.conceptId
      ? ontology.concepts.find(({ id }) => id === query.conceptId)
      : undefined;
    if (query.conceptId && !concept) {
      issues.push(issue('MISSING_REFERENCE', 'conceptId', `Unknown concept: ${query.conceptId}`));
    }
    const factType = query.factTypeId
      ? ontology.factTypes.find(({ id }) => id === query.factTypeId)
      : undefined;
    if (query.factTypeId && !factType) {
      issues.push(issue('MISSING_REFERENCE', 'factTypeId', `Unknown fact type: ${query.factTypeId}`));
    } else if (factType && concept && factType.conceptId !== concept.id) {
      issues.push(issue('INVALID_CONCEPT_BINDING', 'factTypeId', `Fact type ${factType.id} belongs to concept ${factType.conceptId}`));
    }
    if (issues.length) return { ok: false, issues };

    const facts = (await this.store.readFacts(query.projectId)).filter(({ ref }) => (
      ref.ontologyId === ontology.id
      && ref.ontologyVersion === ontology.version
      && (!query.conceptId || ref.conceptId === query.conceptId)
      && (!query.factTypeId || ref.factTypeId === query.factTypeId)
      && (!factType || ref.conceptId === factType.conceptId)
    ));
    if (!query.latestOnly) return { ok: true, facts };

    const latest = new Map<string, { fact: CanonicalFactRecord; index: number }>();
    facts.forEach((fact, index) => {
      const current = latest.get(fact.ref.factId);
      if (!current || fact.revision >= current.fact.revision) latest.set(fact.ref.factId, { fact, index });
    });
    return {
      ok: true,
      facts: [...latest.values()]
        .sort((left, right) => left.fact.acceptedAt.getTime() - right.fact.acceptedAt.getTime() || left.index - right.index)
        .map(({ fact }) => fact),
    };
  }

  submitAction(request: CanonicalActionSubmission): Promise<CanonicalActionSubmissionResult> {
    const result = this.submissionTail.then(() => this.submitActionExclusive(request));
    this.submissionTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async submitActionExclusive(request: CanonicalActionSubmission): Promise<CanonicalActionSubmissionResult> {
    const fingerprint = requestFingerprint(request);
    const previous = await this.store.getLatestOperation(request.projectId, request.operationId);
    if (previous) {
      if (operationFingerprint(previous) !== fingerprint) {
        return { ok: false, issues: [issue('OPERATION_CONFLICT', 'operationId', `Operation ${request.operationId} has a different request`)] };
      }
      if (previous.status === 'accepted') {
        return { ok: true, receipt: previous as CanonicalOperationRecord & { status: 'accepted' } };
      }
      if (previous.status !== 'intent') {
        return { ok: false, issues: [issue('OPERATION_CONFLICT', 'operationId', `Operation ${request.operationId} cannot be resumed`)] };
      }
    }

    const stored = await this.store.readOntology(request.projectId);
    if (!stored) return { ok: false, issues: [issue('ONTOLOGY_NOT_FOUND', 'projectId', `No ontology for project ${request.projectId}`)] };
    const ontology = stored.data;
    const gate = validateCanonicalAction({
      ontology,
      ontologyId: request.ontologyId,
      ontologyVersion: request.ontologyVersion,
      actionId: request.actionId,
      conceptId: request.conceptId,
      currentStateId: request.currentStateId,
      permissions: request.permissions,
    });
    if (!gate.valid) return { ok: false, issues: gate.issues };

    const action = ontology.actions.find(({ id }) => id === request.actionId)!;
    const issues: CanonicalValidationIssue[] = [];
    if (ontology.projectId !== request.projectId) {
      issues.push(issue('PROJECT_ID_MISMATCH', 'projectId', `Expected project ${ontology.projectId}`));
    }
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
      issues.push(issue('INVALID_REVISION', 'expectedRevision', 'Expected revision must be a non-negative safe integer'));
    }
    if (action.ruleIds?.length) {
      issues.push(issue('RULE_EVALUATION_UNAVAILABLE', 'actionId', `Action ${action.id} requires Rule evaluation`));
    }

    const facts = await this.store.readFacts(request.projectId);
    const currentFacts = facts.filter(({ ref }) => (
      ref.ontologyId === ontology.id && ref.ontologyVersion === ontology.version
    ));
    const declaredInputs = new Set(action.inputFactTypeIds);
    const providedInputs = new Set(request.inputFactRefs.map(({ factTypeId }) => factTypeId));
    action.inputFactTypeIds.forEach((factTypeId, index) => {
      if (!providedInputs.has(factTypeId)) {
        issues.push(issue('INPUT_FACT_REQUIRED', `inputFactRefs[${index}]`, `Missing input fact type: ${factTypeId}`));
      }
    });
    request.inputFactRefs.forEach((ref, index) => {
      const factType = ontology.factTypes.find(({ id }) => id === ref.factTypeId);
      if (!declaredInputs.has(ref.factTypeId)) {
        issues.push(issue('INPUT_FACT_TYPE_NOT_ALLOWED', `inputFactRefs[${index}].factTypeId`, `Input fact type ${ref.factTypeId} is not declared by action ${action.id}`));
      } else if (factType && factType.conceptId !== ref.conceptId) {
        issues.push(issue('INVALID_CONCEPT_BINDING', `inputFactRefs[${index}].conceptId`, `Fact type ${factType.id} belongs to concept ${factType.conceptId}`));
      } else if (!currentFacts.some(({ ref: existing }) => sameFactRef(existing, ref))) {
        issues.push(issue('INPUT_FACT_NOT_FOUND', `inputFactRefs[${index}]`, `Input fact ${ref.factId} was not found`));
      }
    });

    const declaredOutputs = new Set(action.outputFactTypeIds);
    const outputIds = new Set<string>();
    const outputFacts: CanonicalFactRecord[] = [];
    request.outputs.forEach((output, index) => {
      const factType = ontology.factTypes.find(({ id }) => id === output.factTypeId);
      if (!declaredOutputs.has(output.factTypeId)) {
        issues.push(issue('OUTPUT_FACT_TYPE_NOT_ALLOWED', `outputs[${index}].factTypeId`, `Output fact type ${output.factTypeId} is not declared by action ${action.id}`));
      } else if (!factType) {
        issues.push(issue('MISSING_REFERENCE', `outputs[${index}].factTypeId`, `Unknown fact type: ${output.factTypeId}`));
      }
      if (outputIds.has(output.factId)) {
        issues.push(issue('DUPLICATE_OUTPUT_FACT', `outputs[${index}].factId`, `Duplicate output factId: ${output.factId}`));
      }
      outputIds.add(output.factId);

      const currentRevision = currentFacts.reduce(
        (latest, fact) => fact.operationId !== request.operationId && fact.ref.factId === output.factId
          ? Math.max(latest, fact.revision)
          : latest,
        0,
      );
      if (currentRevision !== request.expectedRevision) {
        issues.push(issue('REVISION_CONFLICT', `outputs[${index}].factId`, `Expected revision ${request.expectedRevision}, found ${currentRevision}`));
      }
      if (factType) {
        const revision = request.expectedRevision + 1;
        outputFacts.push({
          ref: {
            ontologyId: ontology.id,
            ontologyVersion: ontology.version,
            conceptId: factType.conceptId,
            factTypeId: factType.id,
            factId: output.factId,
            factVersion: String(revision),
          },
          value: output.value,
          source: output.source,
          operationId: request.operationId,
          revision,
          acceptedAt: new Date(),
        });
      }
    });
    if (issues.length) return { ok: false, issues };

    const metadata = { ...request.audit, requestFingerprint: fingerprint };
    if (!previous) {
      await this.store.appendOperation(request.projectId, {
        operationId: request.operationId,
        actionId: request.actionId,
        status: 'intent',
        expectedRevision: request.expectedRevision,
        factRefs: outputFacts.map(({ ref }) => ref),
        recordedAt: new Date(),
        metadata,
      });
    }

    const persisted = facts.filter(({ operationId }) => operationId === request.operationId);
    for (const fact of outputFacts) {
      if (!persisted.some(({ ref }) => sameFactRef(ref, fact.ref))) {
        await this.store.appendFact(request.projectId, fact);
      }
    }
    const receipt: CanonicalOperationRecord & { status: 'accepted' } = {
      operationId: request.operationId,
      actionId: request.actionId,
      status: 'accepted',
      expectedRevision: request.expectedRevision,
      factRefs: outputFacts.map(({ ref }) => ref),
      recordedAt: new Date(),
      metadata,
    };
    await this.store.appendOperation(request.projectId, receipt);
    return { ok: true, receipt };
  }
}
