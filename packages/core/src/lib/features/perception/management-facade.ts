import type {
  ConnectorHealth,
  ExternalTriggerGrant,
  PerceptionAuditEntry,
  PerceptionConnectorConfig,
  PerceptionDeadLetter,
  PerceptionRetryRecord,
  PerceptionTargetKind,
  PerceptionTriggerRule,
} from '../../../types/perception';
import {
  ConnectorHealthStore,
  ExternalTriggerGrantStore,
  PerceptionAuditStore,
  PerceptionConnectorConfigStore,
  PerceptionDeadLetterStore,
  PerceptionRetryService,
  TriggerRuleStore,
} from '../../../modules/perception-runtime';

export interface PerceptionConnectorSummary extends Omit<PerceptionConnectorConfig, 'secretRef'> { secretConfigured: boolean }

export class PerceptionManagementFacade {
  private readonly connectors: PerceptionConnectorConfigStore;
  private readonly rules: TriggerRuleStore;
  private readonly grants: ExternalTriggerGrantStore;
  private readonly health: ConnectorHealthStore;
  private readonly audit: PerceptionAuditStore;
  private readonly deadLetters: PerceptionDeadLetterStore;

  constructor(dataRoot: string, private readonly retry: PerceptionRetryService) {
    this.connectors = new PerceptionConnectorConfigStore(dataRoot);
    this.rules = new TriggerRuleStore(dataRoot);
    this.grants = new ExternalTriggerGrantStore(dataRoot);
    this.health = new ConnectorHealthStore(dataRoot);
    this.audit = new PerceptionAuditStore(dataRoot);
    this.deadLetters = new PerceptionDeadLetterStore(dataRoot);
  }

  saveConnector(config: PerceptionConnectorConfig): PerceptionConnectorSummary { return connectorSummary(this.connectors.save(config)) }
  listConnectors(): PerceptionConnectorSummary[] { return this.connectors.list().map(connectorSummary) }
  setConnectorEnabled(id: string, enabled: boolean): PerceptionConnectorSummary { return connectorSummary(this.connectors.setEnabled(id, enabled)) }
  saveRule(rule: PerceptionTriggerRule): PerceptionTriggerRule {
    const grant = this.grants.list().find((item) => item.target.kind === rule.target.kind && item.target.id === rule.target.id && item.enabled);
    if (!grant) throw new Error('Perception rule target is not authorized for external triggers');
    return this.rules.save(rule);
  }
  listRules(): PerceptionTriggerRule[] { return this.rules.list() }
  deleteRule(id: string): boolean { return this.rules.delete(id) }
  saveGrant(grant: ExternalTriggerGrant): ExternalTriggerGrant { return this.grants.save(grant) }
  listGrants(): ExternalTriggerGrant[] { return this.grants.list() }
  deleteGrant(kind: PerceptionTargetKind, id: string): boolean { return this.grants.delete(kind, id) }
  saveHealth(value: ConnectorHealth): ConnectorHealth { return this.health.save(value) }
  listHealth(): ConnectorHealth[] { return this.health.list() }
  listAudit(options?: { connectorId?: string; eventId?: string; offset?: number; limit?: number }): PerceptionAuditEntry[] { return this.audit.list(options) }
  listDeadLetters(connectorId?: string): PerceptionDeadLetter[] { return this.deadLetters.list(connectorId) }
  replayDeadLetter(connectorId: string, deadLetterId: string): PerceptionRetryRecord {
    const deadLetter = this.deadLetters.get(connectorId, deadLetterId);
    if (!deadLetter) throw new Error('Dead letter not found');
    return this.retry.replay(deadLetter);
  }
}

function connectorSummary(config: PerceptionConnectorConfig): PerceptionConnectorSummary {
  const { secretRef, ...summary } = config;
  return { ...summary, secretConfigured: Boolean(secretRef) };
}
