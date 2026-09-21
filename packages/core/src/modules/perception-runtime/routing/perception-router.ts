import { randomUUID } from 'node:crypto';
import type {
  PerceptionEventV1,
  PerceptionTriggerTarget,
  PerceptionTriggerExecutionContext,
  PerceptionTriggerRule,
  TargetAuthorizationPort,
  TriggerExecutionPort,
} from '../../../types/perception';
import { DecisionOrchestrator } from '../decision/decision-orchestrator';
import type { AuthorizedDecisionCandidate } from '../decision/state-builder';
import { matchesTriggerRule } from '../rules/rule-matcher';
import { PerceptionAuditStore } from '../storage/audit-store';
import { ExecutionLeaseStore } from '../storage/lease-store';

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

export class PerceptionRouter {
  private readonly leases: LeasePort;
  private readonly audit: AuditPort;

  constructor(
    dataRoot: string,
    private readonly rules: RuleSource,
    private readonly authorization: TargetAuthorizationPort,
    private readonly execution: TriggerExecutionPort,
    stores?: { leases?: LeasePort; audit?: AuditPort },
    private readonly decisions?: DecisionOrchestrator,
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
    const candidates: AuthorizedDecisionCandidate[] = [];
    for (const candidate of rule.decision.candidates) {
      if (candidate.action !== 'dispatch') { candidates.push({ candidate }); continue; }
      const authorization = await this.authorization.authorize({ event, rule, target: candidate.target });
      if (authorization.authorized) candidates.push({ candidate, authorization });
      else this.appendAudit('target.denied', event, rule.id, { candidateKey: candidate.key, reason: authorization.reason ?? 'not-authorized' });
    }
    const outcome = await this.decisions.decide(event, rule, candidates);
    if (outcome.requested) this.appendAudit('decision.requested', event, rule.id, { decisionId: outcome.receipt.id });
    if (outcome.action === 'pending') {
      this.appendAudit(outcome.receipt.status === 'failed' ? 'decision.failed' : 'decision.pending', event, rule.id, { decisionId: outcome.receipt.id, reason: outcome.receipt.reason });
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

  private async routeTarget(
    event: PerceptionEventV1,
    rule: PerceptionTriggerRule,
    target: PerceptionTriggerTarget,
    attemptKey?: string,
    decisionId?: string,
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

    const acquired = this.leases.acquire(event.id, rule.id, attemptKey);
    if (!acquired.acquired) {
      if (decisionId && acquired.lease.status === 'completed' && acquired.lease.resultRef) {
        await this.decisions?.complete(decisionId, acquired.lease.id, acquired.lease.resultRef);
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
      cognitionOwner: cognitionOwner(target),
    };
    try {
      const dispatched = await this.execution.dispatch({ event, target, context });
      this.leases.complete(acquired.lease.id, dispatched.resultRef);
      if (decisionId) await this.decisions?.complete(decisionId, acquired.lease.id, dispatched.resultRef);
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
      if (decisionId) await this.decisions?.fail(decisionId, acquired.lease.id);
      const detail: Record<string, string> = { leaseId: acquired.lease.id };
      for (const key of ['diagnosticId', 'safeCode', 'sessionId'] as const) {
        const value: unknown = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined;
        if (typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value)) detail[key] = value;
      }
      this.appendAudit('lease.failed', event, rule.id, detail);
      return { ruleId: rule.id, status: 'failed', leaseId: acquired.lease.id };
    }
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
