import { createHash } from 'node:crypto';

import type { CanonicalFactReference } from '../ontology';
import {
  CollaborationReconciliationError,
  type CollaborationExecutionPort,
} from '../../../modules/collaboration-runtime/facade';
import type {
  OntologyCrossPackageWorkItemRecoveryInput,
  OntologyCrossPackageWorkItemRecoveryPort,
  OntologyCrossPackageWorkItemRecoveryResult,
} from './ontology-cross-package-contract';

type RecoveryExecutionPort = Pick<
  CollaborationExecutionPort,
  'inspect' | 'reconcileAcceptedOutput'
>;

function factRef(ref: CanonicalFactReference): string {
  return [
    'ontology-fact',
    ref.ontologyId,
    ref.ontologyVersion,
    ref.conceptId,
    ref.factTypeId,
    ref.factId,
    ref.factVersion,
  ].join(':');
}

function contentHash(input: OntologyCrossPackageWorkItemRecoveryInput): string {
  return `sha256:${createHash('sha256').update(JSON.stringify({
    operationId: input.operationId,
    actionId: input.receipt.actionId,
    factRefs: input.receipt.factRefs,
  })).digest('hex')}`;
}

/**
 * Reconciles an accepted ontology Action into the authoritative Run/WorkItem
 * ledger and the injected Task Evidence sink. It owns no persistence itself.
 */
export class OntologyWorkItemRecovery implements OntologyCrossPackageWorkItemRecoveryPort {
  constructor(private readonly execution: RecoveryExecutionPort) {}

  async reconcile(
    input: OntologyCrossPackageWorkItemRecoveryInput,
  ): Promise<OntologyCrossPackageWorkItemRecoveryResult> {
    try {
      const run = await this.execution.inspect(input.runId);
      if (run.projectId !== input.projectId) {
        return {
          ok: false,
          code: 'WORK_ITEM_SCOPE_MISMATCH',
          message: 'The run does not belong to the requested project',
        };
      }
      const hash = contentHash(input);
      const result = await this.execution.reconcileAcceptedOutput({
        projectId: input.projectId,
        runId: input.runId,
        workItemId: input.workItemId,
        attemptId: input.attemptId,
        leaseEpoch: input.leaseEpoch,
        expectedWorkItemRevision: input.expectedWorkItemRevision,
        requestId: input.requestId,
        payloadHash: hash,
        workerReceipt: {
          receiptId: input.operationId,
          outputRefs: input.receipt.factRefs.map(factRef),
          outputHash: hash,
        },
        verifierResult: {
          status: 'passed',
          verificationMethod: 'ontology-action-gate',
          artifactRefs: input.receipt.factRefs.map(factRef),
          resultRef: `ontology-operation:${input.operationId}`,
          contentHash: hash,
          contractHash: run.contract.contractHash,
        },
      });
      return {
        ok: true,
        status: result.status,
        workItemRevision: result.workItemRevision,
        evidenceRevision: result.evidenceRevision,
      };
    } catch (error) {
      if (error instanceof CollaborationReconciliationError) {
        return { ok: false, code: error.code, message: error.message };
      }
      return {
        ok: false,
        code: 'UNKNOWN_EXTERNAL_RECEIPT',
        message: 'The accepted output could not be reconciled safely',
      };
    }
  }
}
