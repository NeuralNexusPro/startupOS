import type { JsonValue, PerceptionEventV1, PerceptionSource } from '../protocol/types';

export const PERCEPTION_PLUGIN_HOST_API_VERSION = '1.0' as const;

export type PerceptionPluginTransport = 'poll' | 'webhook' | 'stream';
export type PerceptionPluginCapability =
  | 'inbound-events'
  | 'outbound-reply'
  | 'callback-handshake'
  | 'encrypted-payload'
  | 'attachments';
export type PerceptionPluginPermission =
  | 'credentials'
  | 'events'
  | 'network'
  | 'schedule'
  | 'health'
  | 'audit';

export type PluginConfigurationFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select';

export interface PluginConfigurationOption {
  value: string;
  label: string;
}

export interface PluginConfigurationField {
  key: string;
  type: PluginConfigurationFieldType;
  label: string;
  required?: boolean;
  sensitive?: boolean;
  help?: string;
  defaultValue?: JsonValue;
  options?: readonly PluginConfigurationOption[];
  min?: number;
  max?: number;
}

export interface PluginConfigurationSchema {
  version: '1.0';
  fields: readonly PluginConfigurationField[];
}

export interface PerceptionPluginManifest {
  id: string;
  name: string;
  version: string;
  hostApi: typeof PERCEPTION_PLUGIN_HOST_API_VERSION;
  entry: string;
  source: PerceptionSource;
  transport: PerceptionPluginTransport;
  capabilities: readonly PerceptionPluginCapability[];
  permissions: readonly PerceptionPluginPermission[];
  configurationSchema: PluginConfigurationSchema;
}

export interface PluginCredentialPort {
  bind(connectorId: string, name: string, secret: string): Promise<string>;
  resolve(connectorId: string, secretRef: string): Promise<string>;
  remove(connectorId: string, secretRef: string): Promise<void>;
}

export interface PluginEventPort {
  submit(event: PerceptionEventV1): Promise<PluginEventDispatchResult[]>;
}

export interface PluginEventDispatchResult {
  status: 'denied' | 'duplicate' | 'dispatched' | 'failed';
  responseText?: string;
  responseTexts?: string[];
}

export interface PluginNetworkRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Readonly<Record<string, string>>;
  body?: string;
}

export interface PluginNetworkResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}

export interface PluginNetworkPort {
  request(input: PluginNetworkRequest): Promise<PluginNetworkResponse>;
}

export interface PluginSchedulePort {
  every(key: string, intervalMs: number, task: () => Promise<void>): void;
  cancel(key: string): void;
}

export type PluginHealthStatus = 'healthy' | 'degraded' | 'disconnected' | 'disabled';

export interface PluginHealthReport {
  pluginId?: string;
  connectorId?: string;
  status: PluginHealthStatus;
  safeCode?: string;
  detail?: JsonValue;
}

export interface PluginHealthPort {
  report(health: PluginHealthReport): Promise<void>;
}

export interface PluginAuditPort {
  record(action: string, detail?: JsonValue): Promise<void>;
}

export interface PerceptionPluginHostPorts {
  credentials: PluginCredentialPort;
  events: PluginEventPort;
  network: PluginNetworkPort;
  schedule: PluginSchedulePort;
  health: PluginHealthPort;
  audit: PluginAuditPort;
}

export type PerceptionPluginRuntimePorts = Partial<PerceptionPluginHostPorts>;

export interface PerceptionPluginRuntimeContext {
  pluginId: string;
  connectorId: string;
  settings: Readonly<Record<string, JsonValue>>;
  ports: Readonly<PerceptionPluginRuntimePorts>;
}

export interface PerceptionPluginProvisionContext extends PerceptionPluginRuntimeContext {
  secrets: Readonly<Record<string, string>>;
}

export interface PerceptionPluginProvisionResult {
  settings?: Readonly<Record<string, JsonValue>>;
  secretRefs?: Readonly<Record<string, string>>;
}

/** Input delivered by the webhook gateway to a webhook-capable plugin. */
export interface PerceptionPluginWebhookRequest {
  payload: JsonValue;
  headers: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  receivedAt: string;
  rawBody?: string;
}

export interface PerceptionPluginWebhookResult {
  status: number;
  headers?: Readonly<Record<string, string>>;
  body?: JsonValue | string;
}

export interface PerceptionPlugin {
  readonly manifest: PerceptionPluginManifest;
  provision?(context: PerceptionPluginProvisionContext): Promise<PerceptionPluginProvisionResult>;
  handleWebhook?(context: PerceptionPluginRuntimeContext, request: PerceptionPluginWebhookRequest): Promise<PerceptionPluginWebhookResult>;
  start(context: PerceptionPluginRuntimeContext): Promise<void>;
  stop(context: PerceptionPluginRuntimeContext): Promise<void>;
  health?(context: PerceptionPluginRuntimeContext): Promise<PluginHealthReport>;
}

export interface PerceptionPluginCatalogEntry {
  plugin: PerceptionPlugin;
  approvedPermissions: readonly PerceptionPluginPermission[];
}

export type PerceptionPluginLifecycleState = 'registered' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

export interface PerceptionPluginInstanceStatus {
  pluginId: string;
  connectorId: string;
  state: PerceptionPluginLifecycleState;
  safeCode?: string;
}
