import { randomUUID } from 'node:crypto';
import type {
  PerceptionEventV1,
  PerceptionTriggerExecutionContext,
  PerceptionTriggerRule,
  TargetAuthorizationPort,
  TriggerExecutionPort,
} from '../../../types/perception';
import { matchesTriggerRule } from '../rules/rule-matcher';
import { PerceptionAuditStore } from '../storage/audit-store';
import { ExecutionLeaseStore } from '../storage/lease-store';

const MAX_MATCHED_RULES = 20;

export type PerceptionRouteStatus = 'denied' | 'duplicate' | 'dispatched' | 'failed';
export interface PerceptionRouteResult {
  ruleId: string;
  status: PerceptionRouteStatus;
  leaseId?: string;
  resultRef?: string;
  reason?: string;
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
    const authorization = await this.authorization.authorize({ event, rule, target: rule.target });
    if (!authorization.authorized) {
      this.appendAudit('target.denied', event, rule.id, { reason: authorization.reason ?? 'not-authorized' });
      return { ruleId: rule.id, status: 'denied', reason: authorization.reason };
    }

    const acquired = this.leases.acquire(event.id, rule.id, attemptKey);
    if (!acquired.acquired) {
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
      cognitionOwner: cognitionOwner(rule),
    };
    try {
      const dispatched = await this.execution.dispatch({ event, target: rule.target, context });
      this.leases.complete(acquired.lease.id, dispatched.resultRef);
      this.appendAudit('trigger.dispatched', event, rule.id, { leaseId: acquired.lease.id, resultRef: dispatched.resultRef });
      this.appendAudit('lease.completed', event, rule.id, { leaseId: acquired.lease.id });
      return { ruleId: rule.id, status: 'dispatched', leaseId: acquired.lease.id, resultRef: dispatched.resultRef };
    } catch {
      this.leases.fail(acquired.lease.id);
      this.appendAudit('lease.failed', event, rule.id, { leaseId: acquired.lease.id });
      return { ruleId: rule.id, status: 'failed', leaseId: acquired.lease.id };
    }
  }

  private appendAudit(action: Parameters<PerceptionAuditStore['append']>[0]['action'], event: PerceptionEventV1, ruleId: string, detail?: Parameters<PerceptionAuditStore['append']>[0]['detail']): void {
    this.audit.append({ id: randomUUID(), action, occurredAt: new Date().toISOString(), connectorId: event.connectorId, eventId: event.id, detail: { ruleId, ...(detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {}) } });
  }
}

function cognitionOwner(rule: PerceptionTriggerRule): PerceptionTriggerExecutionContext['cognitionOwner'] {
  if (rule.target.kind === 'project') return { kind: 'project', id: rule.target.id };
  if (rule.target.kind === 'role-agent') return { kind: 'role-agent', id: rule.target.id };
  const ownership = rule.target.skillOwnership;
  if (!ownership || ownership.mode === 'ephemeral') return { kind: 'ephemeral' };
  return { kind: ownership.ownerKind, id: ownership.ownerId };
}
