import { randomUUID } from 'node:crypto';
import type {
  JevDecisionReceipt,
  PerceptionEventV1,
  PerceptionTriggerTarget,
  PerceptionTriggerExecutionContext,
  PerceptionTriggerRule,
  TargetAuthorizationPort,
  PerceptionTargetProfilePort,
  TriggerExecutionPort,
} from '../../../types/perception';
import { DecisionOrchestrator } from '../decision/decision-orchestrator';
import type { AuthorizedDecisionCandidate } from '../decision/state-builder';
import { matchesTriggerRule } from '../rules/rule-matcher';
import { PerceptionAuditStore } from '../storage/audit-store';
import { ExecutionLeaseStore } from '../storage/lease-store';
import { PerceptionEventStore } from '../storage/event-store';

const MAX_MATCHED_RULES = 20;

export type PerceptionRouteStatus = 'denied' | 'duplicate' | 'dispatched' | 'failed' | 'pending' | 'ignored';
export interface PerceptionRouteResult {
  ruleId: string;
  status: PerceptionRouteStatus;
  leaseId?: string;
  resultRef?: string;
  reason?: string;
  responseText?: string;
  responseTexts?: string[];
}

interface RuleSource { list(): PerceptionTriggerRule[] }
interface LeasePort {
  acquire(eventId: string, ruleId: string, attemptKey?: string): { lease: { id: string; status: string; resultRef?: string }; acquired: boolean };
  complete(leaseId: string, resultRef: string): unknown;
  fail(leaseId: string): unknown;
}
interface AuditPort { append(entry: Parameters<PerceptionAuditStore['append']>[0]): void }
export interface DecisionPendingNotificationPort {
  notify(input: { receipt: JevDecisionReceipt; event: PerceptionEventV1; rule: Extract<PerceptionTriggerRule, { routingMode: 'jev' }> }): Promise<void>;
  logDecision?(input: {
    phase: 'requested' | 'completed' | 'dispatched' | 'failed';
    event: PerceptionEventV1;
    rule: Extract<PerceptionTriggerRule, { routingMode: 'jev' }>;
    candidateKeys?: string[];
    receipt?: JevDecisionReceipt;
    outcome?: string;
  }): void;
}

export class PerceptionRouter {
  private readonly leases: LeasePort;
  private readonly audit: AuditPort;
  private readonly dispatches = new Map<string, Promise<PerceptionRouteResult>>();
  private readonly resolutions = new Map<string, Promise<PerceptionRouteResult>>();

  constructor(
    private readonly dataRoot: string,
    private readonly rules: RuleSource,
    private readonly authorization: TargetAuthorizationPort,
    private readonly execution: TriggerExecutionPort,
    stores?: { leases?: LeasePort; audit?: AuditPort },
    private readonly decisions?: DecisionOrchestrator,
    private readonly pendingNotifications?: DecisionPendingNotificationPort,
    private readonly profiles?: PerceptionTargetProfilePort,
  ) {
    this.leases = stores?.leases ?? new ExecutionLeaseStore(dataRoot);
    this.audit = stores?.audit ?? new PerceptionAuditStore(dataRoot);
  }

  async route(event: PerceptionEventV1): Promise<PerceptionRouteResult[]> {
    const matched = this.rules.list().filter((rule) => matchesTriggerRule(rule, event));
    if (matched.length > MAX_MATCHED_RULES) throw new Error(`Perception event matched more than ${MAX_MATCHED_RULES} rules`);
    const results: PerceptionRouteResult[] = [];
    for (const rule of matched) results.push(await this.routeRule(event, rule));
    return results;
  }

  async retry(event: PerceptionEventV1, rule: PerceptionTriggerRule, retryId: string): Promise<PerceptionRouteResult> {
    return this.routeRule(event, rule, retryId);
  }

  listPendingDecisions(): JevDecisionReceipt[] { return this.decisions?.listPending() ?? [] }
  getDecision(decisionId: string): JevDecisionReceipt | null { return this.decisions?.get(decisionId) ?? null }

  async resolveDecision(decisionId: string, selectedKey: string): Promise<PerceptionRouteResult> {
    return this.serializeResolution(decisionId, async () => {
      const context = this.decisionContext(decisionId);
      if (context.receipt.status === 'ignored') return { ruleId: context.rule.id, status: 'ignored' };
      if (context.receipt.status === 'auto-executed' || context.receipt.status === 'user-executed') {
        return { ruleId: context.rule.id, status: 'duplicate', leaseId: context.receipt.leaseId, resultRef: context.receipt.resultRef };
      }
      const candidate = context.rule.decision.candidates.find((item) => item.key === selectedKey);
      if (!candidate) throw new Error('DECISION_CANDIDATE_UNAVAILABLE');
      if (candidate.action === 'ignore') {
        await this.decisions?.ignore(decisionId);
        this.appendAudit('decision.resolved', context.event, context.rule.id, { decisionId, action: 'ignore' });
        return { ruleId: context.rule.id, status: 'ignored' };
      }
      if (candidate.action === 'notify_user') {
        const receipt = await this.decisions!.defer(decisionId, 'NOTIFY_USER');
        await this.notifyPending(receipt, context.event, context.rule);
        return { ruleId: context.rule.id, status: 'pending', reason: 'NOTIFY_USER' };
      }
      await this.decisions!.select(decisionId, selectedKey);
      return this.routeTarget(context.event, context.rule, candidate.target, decisionId, decisionId, 'user-executed');
    });
  }

  async retryDecision(decisionId: string): Promise<PerceptionRouteResult> {
    return this.serializeResolution(decisionId, async () => {
      const context = this.decisionContext(decisionId);
      const candidates = await this.authorizedCandidates(context.event, context.rule);
      this.logDecision({ phase: 'requested', event: context.event, rule: context.rule, candidateKeys: candidates.map(({ candidate }) => candidate.key) });
      const outcome = await this.decisions!.retry(context.event, context.rule, candidates);
      return this.handleDecisionOutcome(context.event, context.rule, outcome);
    });
  }

  async reconsiderDecision(decisionId: string, feedback: PerceptionEventV1, history: readonly PerceptionEventV1[]): Promise<PerceptionRouteResult> {
    return this.serializeResolution(decisionId, async () => {
      const context = this.decisionContext(decisionId);
      const candidates = await this.authorizedCandidates(context.event, context.rule);
      this.logDecision({ phase: 'requested', event: context.event, rule: context.rule, candidateKeys: candidates.map(({ candidate }) => candidate.key) });
      const outcome = await this.decisions!.reconsider(decisionId, context.event, context.rule, candidates, { feedback, history });
      return this.handleDecisionOutcome(context.event, context.rule, outcome, feedback);
    });
  }

  async isPendingChoiceFeedback(decisionId: string, feedback: PerceptionEventV1, history: readonly PerceptionEventV1[]): Promise<boolean> {
    const context = this.decisionContext(decisionId);
    const candidates = await this.authorizedCandidates(context.event, context.rule);
    return this.decisions?.isPendingChoiceFeedback(context.event, candidates, { feedback, history }) ?? false;
  }

  private async routeRule(event: PerceptionEventV1, rule: PerceptionTriggerRule, attemptKey?: string): Promise<PerceptionRouteResult> {
    this.appendAudit('rule.matched', event, rule.id);
    if (rule.routingMode === 'jev') return this.routeDecision(event, rule);
    return this.routeTarget(event, rule, rule.target, attemptKey);
  }

  private async routeDecision(event: PerceptionEventV1, rule: Extract<PerceptionTriggerRule, { routingMode: 'jev' }>): Promise<PerceptionRouteResult> {
    if (!this.decisions) {
      this.appendAudit('decision.failed', event, rule.id, { reason: 'JEV_RUNTIME_UNAVAILABLE' });
      return { ruleId: rule.id, status: 'pending', reason: 'JEV_RUNTIME_UNAVAILABLE' };
    }
    const candidates = await this.authorizedCandidates(event, rule);
    this.logDecision({ phase: 'requested', event, rule, candidateKeys: candidates.map(({ candidate }) => candidate.key) });
    const outcome = await this.decisions.decide(event, rule, candidates);
    return this.handleDecisionOutcome(event, rule, outcome);
  }

  private async handleDecisionOutcome(event: PerceptionEventV1, rule: Extract<PerceptionTriggerRule, { routingMode: 'jev' }>, outcome: Awaited<ReturnType<DecisionOrchestrator['decide']>>, notificationEvent = event): Promise<PerceptionRouteResult> {
    this.logDecision({ phase: 'completed', event, rule, receipt: outcome.receipt, outcome: outcome.action });
    if (outcome.requested) this.appendAudit('decision.requested', event, rule.id, { decisionId: outcome.receipt.id });
    if (outcome.action === 'pending') {
      this.appendAudit(outcome.receipt.status === 'failed' ? 'decision.failed' : 'decision.pending', event, rule.id, {
        decisionId: outcome.receipt.id,
        ...(outcome.receipt.reason ? { reason: outcome.receipt.reason } : {}),
      });
      await this.notifyPending(outcome.receipt, notificationEvent, rule);
      return { ruleId: rule.id, status: 'pending', reason: outcome.receipt.reason };
    }
    if (outcome.action === 'ignored') {
      this.appendAudit('decision.resolved', event, rule.id, { decisionId: outcome.receipt.id, action: 'ignore' });
      return { ruleId: rule.id, status: 'ignored' };
    }
    if (outcome.action === 'duplicate') {
      return { ruleId: rule.id, status: 'duplicate', leaseId: outcome.receipt.leaseId, resultRef: outcome.receipt.resultRef };
    }
    return this.routeTarget(event, rule, outcome.target, outcome.receipt.id, outcome.receipt.id);
  }

  private async authorizedCandidates(event: PerceptionEventV1, rule: Extract<PerceptionTriggerRule, { routingMode: 'jev' }>): Promise<AuthorizedDecisionCandidate[]> {
    const candidates: AuthorizedDecisionCandidate[] = [];
    for (const candidate of rule.decision.candidates) {
      if (candidate.action !== 'dispatch') { candidates.push({ candidate }); continue; }
      const authorization = await this.authorization.authorize({ event, rule, target: candidate.target });
      if (authorization.authorized) candidates.push({ candidate, authorization, profile: await this.describeTarget(candidate.target) });
      else this.appendAudit('target.denied', event, rule.id, { candidateKey: candidate.key, reason: authorization.reason ?? 'not-authorized' });
    }
    return candidates;
  }

  private async describeTarget(target: PerceptionTriggerTarget) {
    try { return await this.profiles?.describe(target); }
    catch { return undefined; }
  }

  private async routeTarget(
    event: PerceptionEventV1,
    rule: PerceptionTriggerRule,
    target: PerceptionTriggerTarget,
    attemptKey?: string,
    decisionId?: string,
    decisionStatus: 'auto-executed' | 'user-executed' = 'auto-executed',
  ): Promise<PerceptionRouteResult> {
    const authorization = await this.authorization.authorize({ event, rule, target });
    if (!authorization.authorized) {
      this.appendAudit('target.denied', event, rule.id, { reason: authorization.reason ?? 'not-authorized' });
      if (decisionId) {
        await this.decisions?.defer(decisionId, 'TARGET_NOT_AUTHORIZED');
        this.appendAudit('decision.pending', event, rule.id, { decisionId, reason: 'TARGET_NOT_AUTHORIZED' });
        return { ruleId: rule.id, status: 'pending', reason: 'TARGET_NOT_AUTHORIZED' };
      }
      return { ruleId: rule.id, status: 'denied', reason: authorization.reason };
    }

    const dispatchKey = `${event.id}\0${rule.id}\0${attemptKey ?? 'initial'}`;
    const running = this.dispatches.get(dispatchKey);
    if (running) {
      const result = await running;
      return { ...result, status: 'duplicate' };
    }
    const dispatch = this.dispatchTarget(event, rule, target, attemptKey, decisionId, decisionStatus);
    this.dispatches.set(dispatchKey, dispatch);
    try { return await dispatch; }
    finally { if (this.dispatches.get(dispatchKey) === dispatch) this.dispatches.delete(dispatchKey); }
  }

  private async dispatchTarget(
    event: PerceptionEventV1,
    rule: PerceptionTriggerRule,
    target: PerceptionTriggerTarget,
    attemptKey?: string,
    decisionId?: string,
    decisionStatus: 'auto-executed' | 'user-executed' = 'auto-executed',
  ): Promise<PerceptionRouteResult> {
    const acquired = this.leases.acquire(event.id, rule.id, attemptKey);
    if (!acquired.acquired) {
      if (decisionId && acquired.lease.status === 'completed' && acquired.lease.resultRef) {
        await this.decisions?.complete(decisionId, acquired.lease.id, acquired.lease.resultRef, decisionStatus);
      }
      return { ruleId: rule.id, status: 'duplicate', leaseId: acquired.lease.id, resultRef: acquired.lease.resultRef };
    }
    this.appendAudit('lease.acquired', event, rule.id, { leaseId: acquired.lease.id });
    const context: PerceptionTriggerExecutionContext = {
      connectorId: event.connectorId,
      eventId: event.id,
      ruleId: rule.id,
      leaseId: acquired.lease.id,
      rawPayloadRef: event.provenance.rawPayloadRef,
      requireHitl: rule.execution.requireHitl,
      targetLabel: (await this.describeTarget(target))?.name,
      cognitionOwner: cognitionOwner(target),
    };
    try {
      const dispatched = await this.execution.dispatch({ event, target, context });
      this.leases.complete(acquired.lease.id, dispatched.resultRef);
      const receipt = decisionId ? await this.decisions?.complete(decisionId, acquired.lease.id, dispatched.resultRef, decisionStatus) : undefined;
      if (receipt && rule.routingMode === 'jev') this.logDecision({ phase: 'dispatched', event, rule, receipt, outcome: decisionStatus });
      this.appendAudit('trigger.dispatched', event, rule.id, { leaseId: acquired.lease.id, resultRef: dispatched.resultRef });
      this.appendAudit('lease.completed', event, rule.id, { leaseId: acquired.lease.id });
      return {
        ruleId: rule.id,
        status: 'dispatched',
        leaseId: acquired.lease.id,
        resultRef: dispatched.resultRef,
        ...(dispatched.responseText ? { responseText: dispatched.responseText } : {}),
        ...(dispatched.responseTexts?.length ? { responseTexts: dispatched.responseTexts } : {}),
      };
    } catch (error) {
      this.leases.fail(acquired.lease.id);
      const receipt = decisionId ? await this.decisions?.fail(decisionId, acquired.lease.id) : undefined;
      if (receipt && rule.routingMode === 'jev') this.logDecision({ phase: 'failed', event, rule, receipt, outcome: 'dispatch' });
      const detail: Record<string, string> = { leaseId: acquired.lease.id };
      for (const key of ['diagnosticId', 'safeCode', 'sessionId'] as const) {
        const value: unknown = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined;
        if (typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value)) detail[key] = value;
      }
      this.appendAudit('lease.failed', event, rule.id, detail);
      return { ruleId: rule.id, status: 'failed', leaseId: acquired.lease.id };
    }
  }

  private decisionContext(decisionId: string): { receipt: JevDecisionReceipt; event: PerceptionEventV1; rule: Extract<PerceptionTriggerRule, { routingMode: 'jev' }> } {
    if (!this.decisions) throw new Error('JEV_RUNTIME_UNAVAILABLE');
    const receipt = this.decisions.get(decisionId);
    if (!receipt) throw new Error('DECISION_NOT_FOUND');
    const event = new PerceptionEventStore(this.dataRoot).get(receipt.eventId);
    const rule = this.rules.list().find((item) => item.id === receipt.ruleId);
    if (!rule || rule.routingMode !== 'jev' || rule.decision.catalogVersion !== receipt.catalogVersion) throw new Error('DECISION_CONTEXT_UNAVAILABLE');
    return { receipt, event, rule };
  }

  private async serializeResolution(decisionId: string, action: () => Promise<PerceptionRouteResult>): Promise<PerceptionRouteResult> {
    const running = this.resolutions.get(decisionId);
    if (running) {
      const result = await running;
      return { ...result, status: result.status === 'ignored' ? 'ignored' : 'duplicate' };
    }
    const operation = action();
    this.resolutions.set(decisionId, operation);
    try { return await operation; }
    finally { if (this.resolutions.get(decisionId) === operation) this.resolutions.delete(decisionId); }
  }

  private async notifyPending(receipt: JevDecisionReceipt, event: PerceptionEventV1, rule: Extract<PerceptionTriggerRule, { routingMode: 'jev' }>): Promise<void> {
    try { await this.pendingNotifications?.notify({ receipt, event, rule }); }
    catch { /* Notifications are advisory; the receipt remains the pending fact source. */ }
  }

  private logDecision(input: Parameters<NonNullable<DecisionPendingNotificationPort['logDecision']>>[0]): void {
    try { this.pendingNotifications?.logDecision?.(input); }
    catch { /* Diagnostics must never affect decision routing. */ }
  }

  private appendAudit(action: Parameters<PerceptionAuditStore['append']>[0]['action'], event: PerceptionEventV1, ruleId: string, detail?: Parameters<PerceptionAuditStore['append']>[0]['detail']): void {
    this.audit.append({ id: randomUUID(), action, occurredAt: new Date().toISOString(), connectorId: event.connectorId, eventId: event.id, detail: { ruleId, ...(detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {}) } });
  }
}

function cognitionOwner(target: PerceptionTriggerTarget): PerceptionTriggerExecutionContext['cognitionOwner'] {
  if (target.kind === 'project') return { kind: 'project', id: target.id };
  if (target.kind === 'role-agent') return { kind: 'role-agent', id: target.id };
  const ownership = target.skillOwnership;
  if (!ownership || ownership.mode === 'ephemeral') return { kind: 'ephemeral' };
  return { kind: ownership.ownerKind, id: ownership.ownerId };
}
