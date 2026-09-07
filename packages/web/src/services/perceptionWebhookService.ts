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
import { WeComAppConnector } from '@originos/core/lib/integrations/perception/wecom';
import { PerceptionConnectorConfigStore } from '@originos/core/modules/perception-runtime';

const registry = new ConnectorRegistry();
let gateway: WebhookGateway | null = null;
const loadedVersions = new Map<string, string>();
const explicitlyRegistered = new Set<string>();

export function registerPerceptionConnector(connectorId: string, connector: PerceptionConnector, enabled = true): void {
  registry.register(connectorId, connector, enabled);
  explicitlyRegistered.add(connectorId);
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
  hydrateConfiguredConnector(input.connectorId);
  gateway ??= new WebhookGateway(registry, getDataRoot());
  return gateway.handle(input);
}

export async function handlePerceptionHandshake(input: {
  connectorId: string;
  query: Record<string, string>;
}): Promise<ConnectorAck> {
  hydrateConfiguredConnector(input.connectorId);
  gateway ??= new WebhookGateway(registry, getDataRoot());
  return gateway.handshake(input.connectorId, input.query);
}

function hydrateConfiguredConnector(connectorId: string): void {
  if (explicitlyRegistered.has(connectorId)) return;
  const config = new PerceptionConnectorConfigStore(getDataRoot()).get(connectorId);
  if (!config) throw new WebhookGatewayError('CONNECTOR_NOT_FOUND', 'Connector is not configured');
  if (!config.enabled) throw new WebhookGatewayError('CONNECTOR_DISABLED', 'Connector is disabled');
  if (loadedVersions.get(connectorId) === config.updatedAt) return;
  if (config.source !== 'wecom' || config.mode !== 'webhook') {
    if (registry.size() === 0) throw new WebhookGatewayError('CONNECTOR_DISABLED', 'Webhook connector is not available');
    return;
  }
  try {
    const legacy = config.settings as { receiveId?: unknown; envPrefix?: unknown };
    if (typeof legacy.receiveId !== 'string' || typeof legacy.envPrefix !== 'string') throw new Error('Invalid legacy WeCom callback');
    const prefix = legacy.envPrefix;
    const token = process.env[`${prefix}_TOKEN`];
    const encodingAesKey = process.env[`${prefix}_ENCODING_AES_KEY`];
    if (!token || !encodingAesKey) throw new Error('Legacy callback secret unavailable');
    registry.register(connectorId, new WeComAppConnector({ token, encodingAesKey, receiveId: legacy.receiveId }), true);
    loadedVersions.set(connectorId, config.updatedAt);
    gateway = null;
  } catch {
    throw new WebhookGatewayError('CONNECTOR_DISABLED', 'Connector secret is unavailable');
  }
}
