import type {
  JevDecisionReceipt,
  PerceptionDecisionPort,
  PerceptionEventV1,
  PerceptionTriggerRule,
} from '../../../types/perception';
import { evaluateDecisionPolicy } from './policy';
import { DecisionReceiptStore } from './receipt-store';
import { buildDecisionRequest, type AuthorizedDecisionCandidate, type DecisionConversationContext } from './state-builder';

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

  async decide(event: PerceptionEventV1, rule: JevRule, candidates: readonly AuthorizedDecisionCandidate[], context?: DecisionConversationContext): Promise<DecisionOutcome> {
    const id = this.receipts.stableId(event.id, rule.id, rule.decision.catalogVersion);
    const now = new Date().toISOString();
    const request = buildDecisionRequest(event, candidates, this.hashSalt, context, rule.decision.cognitiveGuidance);
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

    return this.request(event, rule, candidates, id, context);
  }

  async retry(event: PerceptionEventV1, rule: JevRule, candidates: readonly AuthorizedDecisionCandidate[]): Promise<DecisionOutcome> {
    const id = this.receipts.stableId(event.id, rule.id, rule.decision.catalogVersion);
    const receipt = this.receipts.get(id);
    if (!receipt) throw new Error('DECISION_NOT_FOUND');
    if (receipt.status === 'ignored' || receipt.status === 'auto-executed' || receipt.status === 'user-executed') {
      return recover(receipt, candidates);
    }
    return this.request(event, rule, candidates, id);
  }

  async requestUserTargetSelection(event: PerceptionEventV1, rule: JevRule, candidates: readonly AuthorizedDecisionCandidate[]): Promise<DecisionOutcome> {
    const id = this.receipts.stableId(event.id, rule.id, rule.decision.catalogVersion);
    const now = new Date().toISOString();
    const request = buildDecisionRequest(event, candidates, this.hashSalt, undefined, rule.decision.cognitiveGuidance);
    const reserved = await this.receipts.reserve({
      id,
      eventId: event.id,
      ruleId: rule.id,
      catalogVersion: rule.decision.catalogVersion,
      policyVersion: rule.decision.policyVersion,
      candidateKeys: request.candidateKeys,
      threshold: 0.8,
      status: 'pending',
      reason: 'USER_TARGET_SELECTION_REQUIRED',
      createdAt: now,
      updatedAt: now,
    });
    if (!reserved.created) return recover(reserved.receipt, candidates);
    if (!candidates.some(({ candidate }) => candidate.action === 'dispatch')) {
      return { action: 'pending', receipt: await this.defer(id, 'NO_AUTHORIZED_CANDIDATE'), requested: false };
    }
    return { action: 'pending', receipt: reserved.receipt, requested: false };
  }

  async selectTargetForEvent(
    event: PerceptionEventV1,
    rule: JevRule,
    candidates: readonly AuthorizedDecisionCandidate[],
    selectedKey: string,
  ): Promise<DecisionOutcome> {
    const pending = await this.requestUserTargetSelection(event, rule, candidates);
    if (pending.action !== 'pending') return pending;
    const candidate = candidates.find((item) => item.candidate.key === selectedKey)?.candidate;
    if (candidate?.action !== 'dispatch') return pending;
    const receipt = await this.select(pending.receipt.id, selectedKey);
    return { action: 'dispatch', receipt, target: candidate.target, requested: false };
  }

  async reconsider(id: string, event: PerceptionEventV1, rule: JevRule, candidates: readonly AuthorizedDecisionCandidate[], context: DecisionConversationContext): Promise<DecisionOutcome> {
    const receipt = this.receipts.get(id);
    if (!receipt) throw new Error('DECISION_NOT_FOUND');
    if (receipt.status === 'ignored' || receipt.status === 'auto-executed' || receipt.status === 'user-executed') return recover(receipt, candidates);
    return this.request(event, rule, candidates, id, context);
  }

  async isPendingChoiceFeedback(event: PerceptionEventV1, candidates: readonly AuthorizedDecisionCandidate[], context: DecisionConversationContext): Promise<boolean> {
    if (!candidates.some(({ candidate }) => candidate.action === 'dispatch')) return false;
    const request = buildDecisionRequest(event, candidates, this.hashSalt, { ...context, pendingChoiceFeedback: true });
    if (this.decisions.classifyPendingChoiceFeedback) {
      return (await this.decisions.classifyPendingChoiceFeedback(request)) >= 0.5;
    }
    const answer = await this.decisions.decide(request);
    return (answer.isChoiceFeedback ?? 0) >= 0.5;
  }

  get(id: string): JevDecisionReceipt | null { return this.receipts.get(id) }
  listPending(): JevDecisionReceipt[] { return this.receipts.listPending() }

  ignore(id: string): Promise<JevDecisionReceipt> {
    return this.receipts.update(id, (current) => ({
      ...current, status: 'ignored', reason: undefined, selectedKey: 'ignore', updatedAt: new Date().toISOString(),
    }));
  }

  select(id: string, selectedKey: string): Promise<JevDecisionReceipt> {
    return this.receipts.update(id, (current) => ({
      ...current, selectedKey, reason: 'USER_DISPATCH_READY', updatedAt: new Date().toISOString(),
    }));
  }

  private async request(event: PerceptionEventV1, rule: JevRule, candidates: readonly AuthorizedDecisionCandidate[], id: string, context?: DecisionConversationContext): Promise<DecisionOutcome> {
    if (!candidates.some(({ candidate }) => candidate.action === 'dispatch')) {
      return { action: 'pending', receipt: await this.defer(id, 'NO_AUTHORIZED_CANDIDATE'), requested: false };
    }

    const request = buildDecisionRequest(event, candidates, this.hashSalt, context, rule.decision.cognitiveGuidance);
    let answer;
    try {
      answer = await this.decisions.decide(request);
    } catch (error) {
      return { action: 'pending', receipt: await this.defer(id, safeErrorCode(error), 'failed'), requested: true };
    }
    const policy = evaluateDecisionPolicy(answer, candidates.map(({ candidate }) => candidate), rule.execution.requireHitl, isImMessage(event));
    if (policy.action === 'pending') {
      const receipt = await this.receipts.update(id, (current) => ({
        ...current, answers: answer, providerModel: answer.providerModel, status: 'pending', reason: policy.reason, updatedAt: new Date().toISOString(),
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
      ...current, answers: answer, providerModel: answer.providerModel, status: 'pending', reason: 'AUTO_DISPATCH_READY',
      selectedKey: policy.selectedKey, updatedAt: new Date().toISOString(),
    }));
    return { action: 'dispatch', receipt, target: policy.candidate.target, requested: true };
  }

  complete(id: string, leaseId: string, resultRef: string, status: 'auto-executed' | 'user-executed' = 'auto-executed'): Promise<JevDecisionReceipt> {
    return this.receipts.update(id, (current) => ({
      ...current, status, reason: undefined, leaseId, resultRef, updatedAt: new Date().toISOString(),
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

function isImMessage(event: PerceptionEventV1): boolean {
  return ['wecom', 'feishu', 'dingtalk'].includes(event.source);
}
