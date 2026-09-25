import fs from 'node:fs';
import path from 'node:path';
import type {
  ConnectorHealth,
  ExternalTriggerGrant,
  PerceptionAuditEntry,
  PerceptionConnectorConfig,
  PerceptionDeadLetter,
  PerceptionRetryRecord,
  PerceptionTargetKind,
  PerceptionTriggerRule,
  PerceptionEventTrace,
  PerceptionAuditEntry as AuditEntry,
  JsonValue,
  JevDecisionReceipt,
  PerceptionTriggerTarget,
  PerceptionTargetExistencePort,
} from '../../../types/perception';
import { FileSystemPerceptionTargetRegistry } from '../services/perception-target-registry';
import {
  ConnectorHealthStore,
  ExternalTriggerGrantStore,
  PerceptionAuditStore,
  PerceptionConnectorConfigStore,
  PerceptionDeadLetterStore,
  PerceptionRetryService,
  TriggerRuleStore,
  PerceptionEventStore,
  ExecutionLeaseStore,
  DecisionReceiptStore,
} from '../../../modules/perception-runtime';

export interface PerceptionConnectorSummary extends Omit<PerceptionConnectorConfig, 'secretRef'> { secretConfigured: boolean }

export class PerceptionManagementFacade {
  private readonly connectors: PerceptionConnectorConfigStore;
  private readonly rules: TriggerRuleStore;
  private readonly grants: ExternalTriggerGrantStore;
  private readonly health: ConnectorHealthStore;
  private readonly audit: PerceptionAuditStore;
  private readonly deadLetters: PerceptionDeadLetterStore;
  private readonly events: PerceptionEventStore;
  private readonly leases: ExecutionLeaseStore;
  private readonly decisions: DecisionReceiptStore;

  constructor(
    private readonly dataRoot: string,
    private readonly retry: PerceptionRetryService,
    private readonly targets: PerceptionTargetExistencePort = new FileSystemPerceptionTargetRegistry(dataRoot),
  ) {
    this.connectors = new PerceptionConnectorConfigStore(dataRoot);
    this.rules = new TriggerRuleStore(dataRoot);
    this.grants = new ExternalTriggerGrantStore(dataRoot);
    this.health = new ConnectorHealthStore(dataRoot);
    this.audit = new PerceptionAuditStore(dataRoot);
    this.deadLetters = new PerceptionDeadLetterStore(dataRoot);
    this.events = new PerceptionEventStore(dataRoot);
    this.leases = new ExecutionLeaseStore(dataRoot);
    this.decisions = new DecisionReceiptStore(dataRoot);
  }

  saveConnector(config: PerceptionConnectorConfig): PerceptionConnectorSummary { return connectorSummary(this.connectors.save(config)) }
  listConnectors(): PerceptionConnectorSummary[] { return this.connectors.list().map(connectorSummary) }
  setConnectorEnabled(id: string, enabled: boolean): PerceptionConnectorSummary { return connectorSummary(this.connectors.setEnabled(id, enabled)) }
  async saveRule(rule: PerceptionTriggerRule): Promise<PerceptionTriggerRule> {
    const targets = rule.routingMode === 'jev'
      ? rule.decision.candidates.flatMap((candidate) => candidate.action === 'dispatch' ? [candidate.target] : [])
      : [rule.target];
    for (const target of targets) await this.requireAuthorizedTarget(rule, target);
    return this.rules.save(rule);
  }
  listRules(): PerceptionTriggerRule[] { return this.rules.list() }
  deleteRule(id: string): boolean { return this.rules.delete(id) }
  saveGrant(grant: ExternalTriggerGrant): ExternalTriggerGrant { return this.grants.save(grant) }
  listGrants(): ExternalTriggerGrant[] { return this.grants.list() }
  async listDecisionCandidateGrants(): Promise<ExternalTriggerGrant[]> {
    const grants = this.grants.list().filter((grant) => grant.enabled);
    const existing = await Promise.all(grants.map(async (grant) => await this.targets.exists(grant.target)));
    return grants.filter((_grant, index) => existing[index]);
  }
  deleteGrant(kind: PerceptionTargetKind, id: string): boolean { return this.grants.delete(kind, id) }
  saveHealth(value: ConnectorHealth): ConnectorHealth { return this.health.save(value) }
  listHealth(): ConnectorHealth[] { return this.health.list() }
  listAudit(options?: { connectorId?: string; eventId?: string; offset?: number; limit?: number }): PerceptionAuditEntry[] { return this.audit.list(options) }
  listPendingDecisions(): JevDecisionReceipt[] { return this.decisions.listPending() }
  listEventTraces(limit = 100): PerceptionEventTrace[] {
    const rules = new Map(this.rules.list().map((rule) => [rule.id, rule]));
    const leases = this.leases.list();
    return this.events.list(limit).map((event) => {
      const audit = this.audit.list({ eventId: event.id, limit: 200 }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const ruleIds = new Set<string>();
      for (const entry of audit) {
        const ruleId = detailString(entry.detail, 'ruleId');
        if (ruleId) ruleIds.add(ruleId);
      }
      for (const lease of leases) if (lease.eventId === event.id) ruleIds.add(lease.ruleId);
      return {
        event,
        audit,
        ruleTriggers: [...ruleIds].map((ruleId) => {
          const lease = leases.find((item) => item.eventId === event.id && item.ruleId === ruleId);
          const feedback = audit.find((item) => (item.action === 'decision.feedback' || item.action === 'decision.feedback.rejected') && detailMatchesRule(item, ruleId));
          const feedbackDecisionId = detailString(feedback?.detail, 'decisionId');
          const feedbackOriginalEventId = detailString(feedback?.detail, 'originalEventId');
          const feedbackStatus = detailString(feedback?.detail, 'status');
          const feedbackReason = detailString(feedback?.detail, 'reason');
          const matchedAt = auditTime(audit, 'rule.matched', ruleId)
            ?? (feedback?.action === 'decision.feedback' ? feedback.occurredAt : undefined);
          const resultRef = lease?.resultRef;
          const sessionId = resultRef?.startsWith('perception://session/') ? resultRef.slice('perception://session/'.length) : undefined;
          const rule = rules.get(ruleId);
          return {
            ruleId,
            rule,
            lease,
            matchedAt,
            dispatchedAt: auditTime(audit, 'trigger.dispatched', ruleId),
            finishedAt: audit.find((item) => (item.action === 'lease.completed' || item.action === 'lease.failed') && detailMatchesRule(item, ruleId))?.occurredAt,
            result: lease ? { status: lease.status, resultRef, sessionId, summary: sessionId && rule && rule.routingMode !== 'jev' ? this.readResultSummary(rule.target.kind, rule.target.id, sessionId) : undefined } : undefined,
            ...(feedbackDecisionId && feedbackOriginalEventId && feedbackStatus ? { decisionContinuation: {
              decisionId: feedbackDecisionId,
              originalEventId: feedbackOriginalEventId,
              status: feedbackStatus,
              ...(feedbackReason ? { reason: feedbackReason } : {}),
            } } : {}),
          };
        }),
      };
    });
  }
  listDeadLetters(connectorId?: string): PerceptionDeadLetter[] { return this.deadLetters.list(connectorId) }
  replayDeadLetter(connectorId: string, deadLetterId: string): PerceptionRetryRecord {
    const deadLetter = this.deadLetters.get(connectorId, deadLetterId);
    if (!deadLetter) throw new Error('Dead letter not found');
    return this.retry.replay(deadLetter);
  }

  private async requireAuthorizedTarget(rule: PerceptionTriggerRule, target: PerceptionTriggerTarget): Promise<void> {
    if (!await this.targets.exists(target)) throw new Error('Perception rule target is not authorized for external triggers');
    const grant = this.grants.list().find((item) => item.target.kind === target.kind && item.target.id === target.id && item.enabled);
    if (!grant) throw new Error('Perception rule target is not authorized for external triggers');
    if (grant.allowedRuleIds && !grant.allowedRuleIds.includes(rule.id)) throw new Error('Perception rule target is not authorized for external triggers');
    if (grant.allowedConnectorIds) {
      const hasAuthorizedSource = this.connectors.list().some((connector) =>
        rule.sources.includes(connector.source) && grant.allowedConnectorIds?.includes(connector.id));
      if (!hasAuthorizedSource) throw new Error('Perception rule target is not authorized for external triggers');
    }
    if (target.kind === 'skill' && target.skillOwnership?.mode === 'inherited') {
      const owner = { kind: target.skillOwnership.ownerKind, id: target.skillOwnership.ownerId } as const;
      if (!await this.targets.exists(owner) || !this.grants.get(owner.kind, owner.id)?.enabled) {
        throw new Error('Perception rule target is not authorized for external triggers');
      }
    }
  }

  private readResultSummary(kind: PerceptionTargetKind, targetId: string, sessionId: string): string | undefined {
    if (!/^[A-Za-z0-9._:-]+$/.test(targetId) || !/^[A-Za-z0-9._:-]+$/.test(sessionId)) return undefined;
    const base = kind === 'skill' ? 'skills' : kind === 'role-agent' ? 'agents' : 'projects';
    const filePath = path.join(this.dataRoot, base, targetId, 'memory', 'history', `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).reverse();
      for (const line of lines) {
        const parsed = JSON.parse(line) as { assistantMessage?: unknown };
        if (typeof parsed.assistantMessage === 'string' && parsed.assistantMessage.trim()) return parsed.assistantMessage.trim().slice(0, 2_000);
      }
    } catch { return undefined; }
    return undefined;
  }
}

function detailString(detail: JsonValue | undefined, key: string): string | undefined {
  if (!detail || Array.isArray(detail) || typeof detail !== 'object') return undefined;
  const value = detail[key];
  return typeof value === 'string' ? value : undefined;
}

function detailMatchesRule(entry: AuditEntry, ruleId: string): boolean {
  const value = detailString(entry.detail, 'ruleId');
  return value === undefined || value === ruleId;
}

function auditTime(audit: AuditEntry[], action: AuditEntry['action'], ruleId: string): string | undefined {
  return audit.find((entry) => entry.action === action && detailMatchesRule(entry, ruleId))?.occurredAt;
}

function connectorSummary(config: PerceptionConnectorConfig): PerceptionConnectorSummary {
  const { secretRef, ...summary } = config;
  return { ...summary, secretConfigured: Boolean(secretRef) };
}
