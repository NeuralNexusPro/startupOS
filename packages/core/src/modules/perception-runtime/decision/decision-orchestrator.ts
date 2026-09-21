import type {
  JevDecisionReceipt,
  PerceptionDecisionPort,
  PerceptionEventV1,
  PerceptionTriggerRule,
} from '../../../types/perception';
import { evaluateDecisionPolicy } from './policy';
import { DecisionReceiptStore } from './receipt-store';
import { buildDecisionRequest, type AuthorizedDecisionCandidate } from './state-builder';

type JevRule = Extract<PerceptionTriggerRule, { routingMode: 'jev' }>;

export type DecisionOutcome =
  | { action: 'pending'; receipt: JevDecisionReceipt; requested: boolean }
  | { action: 'ignored'; receipt: JevDecisionReceipt; requested: boolean }
  | { action: 'duplicate'; receipt: JevDecisionReceipt; requested: boolean }
  | { action: 'dispatch'; receipt: JevDecisionReceipt; target: Extract<AuthorizedDecisionCandidate['candidate'], { action: 'dispatch' }>['target']; requested: boolean };

export class DecisionOrchestrator {
  constructor(
    private readonly decisions: PerceptionDecisionPort,
    private readonly receipts: DecisionReceiptStore,
    private readonly hashSalt: string,
  ) {}

  async decide(event: PerceptionEventV1, rule: JevRule, candidates: readonly AuthorizedDecisionCandidate[]): Promise<DecisionOutcome> {
    const id = this.receipts.stableId(event.id, rule.id, rule.decision.catalogVersion);
    const now = new Date().toISOString();
    const request = buildDecisionRequest(event, candidates, this.hashSalt);
    const reserved = await this.receipts.reserve({
      id,
      eventId: event.id,
      ruleId: rule.id,
      catalogVersion: rule.decision.catalogVersion,
      policyVersion: rule.decision.policyVersion,
      candidateKeys: request.candidateKeys,
      threshold: 0.8,
      status: 'pending',
      reason: 'DECISION_REQUESTED',
      createdAt: now,
      updatedAt: now,
    });
    if (!reserved.created) return recover(reserved.receipt, candidates);

    if (!candidates.some(({ candidate }) => candidate.action === 'dispatch')) {
      return { action: 'pending', receipt: await this.defer(id, 'NO_AUTHORIZED_CANDIDATE'), requested: false };
    }

    let answer;
    try {
      answer = await this.decisions.decide(request);
    } catch (error) {
      return { action: 'pending', receipt: await this.defer(id, safeErrorCode(error), 'failed'), requested: true };
    }
    const policy = evaluateDecisionPolicy(answer, candidates.map(({ candidate }) => candidate), rule.execution.requireHitl);
    if (policy.action === 'pending') {
      const receipt = await this.receipts.update(id, (current) => ({
        ...current, answers: answer, providerModel: answer.providerModel, reason: policy.reason, updatedAt: new Date().toISOString(),
      }));
      return { action: 'pending', receipt, requested: true };
    }
    if (policy.action === 'ignore') {
      const receipt = await this.receipts.update(id, (current) => ({
        ...current, answers: answer, providerModel: answer.providerModel, status: 'ignored', reason: undefined,
        selectedKey: policy.selectedKey, updatedAt: new Date().toISOString(),
      }));
      return { action: 'ignored', receipt, requested: true };
    }
    const receipt = await this.receipts.update(id, (current) => ({
      ...current, answers: answer, providerModel: answer.providerModel, reason: 'AUTO_DISPATCH_READY',
      selectedKey: policy.selectedKey, updatedAt: new Date().toISOString(),
    }));
    return { action: 'dispatch', receipt, target: policy.candidate.target, requested: true };
  }

  complete(id: string, leaseId: string, resultRef: string): Promise<JevDecisionReceipt> {
    return this.receipts.update(id, (current) => ({
      ...current, status: 'auto-executed', reason: undefined, leaseId, resultRef, updatedAt: new Date().toISOString(),
    }));
  }

  fail(id: string, leaseId: string): Promise<JevDecisionReceipt> {
    return this.receipts.update(id, (current) => ({
      ...current, status: 'failed', reason: 'DISPATCH_FAILED', leaseId, updatedAt: new Date().toISOString(),
    }));
  }

  defer(id: string, reason: string, status: 'pending' | 'failed' = 'pending'): Promise<JevDecisionReceipt> {
    return this.receipts.update(id, (current) => ({ ...current, status, reason, updatedAt: new Date().toISOString() }));
  }
}

function recover(receipt: JevDecisionReceipt, candidates: readonly AuthorizedDecisionCandidate[]): DecisionOutcome {
  if (receipt.status === 'ignored') return { action: 'ignored', receipt, requested: false };
  if (receipt.status === 'auto-executed' || receipt.status === 'user-executed') return { action: 'duplicate', receipt, requested: false };
  if (receipt.reason === 'AUTO_DISPATCH_READY' && receipt.selectedKey) {
    const candidate = candidates.find((item) => item.candidate.key === receipt.selectedKey)?.candidate;
    if (candidate?.action === 'dispatch') return { action: 'dispatch', receipt, target: candidate.target, requested: false };
  }
  return { action: 'pending', receipt, requested: false };
}

function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return 'JEV_FAILED';
  const code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return typeof code === 'string' && /^JEV_[A-Z_]{1,64}$/.test(code) ? code : 'JEV_FAILED';
}
