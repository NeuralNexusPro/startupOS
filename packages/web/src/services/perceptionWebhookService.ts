import { getDataRoot } from '@originos/core/lib/paths';
import {
  ConnectorRegistry,
  WebhookGateway,
  WebhookGatewayError,
  type JsonValue,
  type PerceptionConnector,
  type WebhookGatewayResult,
  type ConnectorAck,
} from '@originos/core/modules/perception-runtime';

const registry = new ConnectorRegistry();
let gateway: WebhookGateway | null = null;

export function registerPerceptionConnector(connectorId: string, connector: PerceptionConnector, enabled = true): void {
  registry.register(connectorId, connector, enabled);
  gateway = null;
}

export function setPerceptionConnectorEnabled(connectorId: string, enabled: boolean): void {
  registry.setEnabled(connectorId, enabled);
}

export async function handlePerceptionWebhook(input: {
  connectorId: string;
  payload: JsonValue;
  headers: Record<string, string>;
  query: Record<string, string>;
  rawBody?: string;
}): Promise<WebhookGatewayResult> {
  if (registry.size() === 0) {
    throw new WebhookGatewayError('CONNECTOR_DISABLED', 'Perception webhook service is not configured');
  }
  gateway ??= new WebhookGateway(registry, getDataRoot());
  return gateway.handle(input);
}

export async function handlePerceptionHandshake(input: {
  connectorId: string;
  query: Record<string, string>;
}): Promise<ConnectorAck> {
  if (registry.size() === 0) {
    throw new WebhookGatewayError('CONNECTOR_DISABLED', 'Perception webhook service is not configured');
  }
  gateway ??= new WebhookGateway(registry, getDataRoot());
  return gateway.handshake(input.connectorId, input.query);
}
