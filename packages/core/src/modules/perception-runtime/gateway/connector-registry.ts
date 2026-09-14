import type { PerceptionConnector } from '../protocol/types';
import { assertSafePerceptionId } from '../protocol/validation';
import { WebhookGatewayError } from './errors';

interface ConnectorRegistration {
  connector: PerceptionConnector;
  enabled: boolean;
}

export class ConnectorRegistry {
  private readonly registrations = new Map<string, ConnectorRegistration>();

  register(connectorId: string, connector: PerceptionConnector, enabled = true): void {
    assertSafePerceptionId(connectorId, 'connector id');
    this.registrations.set(connectorId, { connector, enabled });
  }

  setEnabled(connectorId: string, enabled: boolean): void {
    const registration = this.registrations.get(connectorId);
    if (!registration) throw new WebhookGatewayError('CONNECTOR_NOT_FOUND', 'Connector is not registered');
    registration.enabled = enabled;
  }

  resolve(connectorId: string): PerceptionConnector {
    assertSafePerceptionId(connectorId, 'connector id');
    const registration = this.registrations.get(connectorId);
    if (!registration) throw new WebhookGatewayError('CONNECTOR_NOT_FOUND', 'Connector is not registered');
    if (!registration.enabled) throw new WebhookGatewayError('CONNECTOR_DISABLED', 'Connector is disabled');
    return registration.connector;
  }

  size(): number {
    return this.registrations.size;
  }
}

