import { getDataRoot } from '@originos/core/lib/paths';
import { PerceptionManagementFacade } from '@originos/core/lib/features/perception';
import {
  PerceptionDeadLetterStore,
  PerceptionRetryService,
  PerceptionRetryStore,
} from '@originos/core/modules/perception-runtime';
import type {
  ExternalTriggerGrant,
  PerceptionConnectorConfig,
  PerceptionTriggerRule,
} from '@originos/core/types';

let facade: PerceptionManagementFacade | undefined;

function management(): PerceptionManagementFacade {
  if (facade) return facade;
  const dataRoot = getDataRoot();
  facade = new PerceptionManagementFacade(
    dataRoot,
    new PerceptionRetryService(new PerceptionRetryStore(dataRoot), new PerceptionDeadLetterStore(dataRoot)),
  );
  return facade;
}

export function getPerceptionDashboard() {
  const service = management();
  return {
    connectors: service.listConnectors(),
    grants: service.listGrants(),
    rules: service.listRules(),
    health: service.listHealth(),
    audit: service.listAudit({ limit: 100 }),
    deadLetters: service.listDeadLetters(),
  };
}

export function savePerceptionConnector(config: PerceptionConnectorConfig) {
  return management().saveConnector(config);
}

export function savePerceptionRule(rule: PerceptionTriggerRule) {
  return management().saveRule(rule);
}

export function savePerceptionGrant(grant: ExternalTriggerGrant) {
  return management().saveGrant(grant);
}

export function setPerceptionConnectorEnabled(id: string, enabled: boolean) {
  return management().setConnectorEnabled(id, enabled);
}

export function replayPerceptionDeadLetter(connectorId: string, deadLetterId: string) {
  return management().replayDeadLetter(connectorId, deadLetterId);
}
