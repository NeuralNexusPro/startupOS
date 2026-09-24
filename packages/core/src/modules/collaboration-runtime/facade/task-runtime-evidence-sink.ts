import type { AgentTaskEvidencePort } from '../../../lib/integrations/pi-agent/task-runtime';

import type {
  EvidenceReceipt,
  EvidenceSubmissionInput,
  WorkItemEvidenceSink,
} from './contract-execution';

/**
 * Adapts the only controlled pi-tasks mutation API to the collaboration ledger.
 * The AgentTaskRuntimeCoordinator owns Session scope, cursor, and bridge epoch;
 * this adapter never accesses pi-tasks internals or synthesizes those values.
 */
export function createAgentTaskEvidenceSink(
  evidencePort: AgentTaskEvidencePort
): WorkItemEvidenceSink {
  return {
    async record(input: EvidenceSubmissionInput): Promise<EvidenceReceipt> {
      const verification = input.verifierResult;
      if (
        !verification.verificationMethod ||
        !verification.resultRef ||
        !verification.contentHash ||
        !verification.artifactRefs?.length
      ) {
        throw new Error(
          'Verified evidence is missing required verification references'
        );
      }
      const receipt = await evidencePort.recordVerifiedEvidence({
        version: 1,
        requestId: input.idempotencyKey,
        taskId: input.workItem.binding.parentTaskId,
        stepId: input.workItem.binding.parentStepId,
        summary: `WorkItem ${input.workItem.id} passed ${verification.verificationMethod}`,
        references: [verification.resultRef],
        artifactRefs: [...verification.artifactRefs],
        verifier: verification.verificationMethod,
        contentHash: verification.contentHash,
      });
      return {
        receiptId: receipt.eventId,
        status: 'accepted',
        evidenceRef: `pi-task-event:${receipt.eventId}`,
      };
    },
  };
}
