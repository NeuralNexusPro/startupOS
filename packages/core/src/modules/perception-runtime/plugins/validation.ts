import { assertSafePerceptionId, validatePerceptionEvent } from '../protocol/validation';
import type {
  PerceptionPluginCapability,
  PerceptionPluginManifest,
  PerceptionPluginPermission,
  PluginConfigurationField,
} from './types';
import { PERCEPTION_PLUGIN_HOST_API_VERSION } from './types';

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ENTRY_PATTERN = /^[A-Za-z0-9@][A-Za-z0-9@/._-]{0,191}$/;
const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const SOURCES = new Set(['email', 'wecom', 'feishu', 'dingtalk']);
const TRANSPORTS = new Set(['poll', 'webhook', 'stream']);
const CAPABILITIES = new Set<PerceptionPluginCapability>([
  'inbound-events', 'outbound-reply', 'callback-handshake', 'encrypted-payload', 'attachments',
]);
const PERMISSIONS = new Set<PerceptionPluginPermission>([
  'credentials', 'events', 'network', 'schedule', 'state', 'health', 'audit', 'replies',
]);
const FIELD_TYPES = new Set(['text', 'password', 'number', 'boolean', 'select']);

function assertExactKeys(value: object, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) throw new Error(`Invalid ${label} field`);
}

function assertConfigurationField(field: PluginConfigurationField): void {
  assertExactKeys(field, ['key', 'type', 'label', 'required', 'sensitive', 'help', 'defaultValue', 'options', 'min', 'max'], 'configuration schema');
  if (!FIELD_KEY_PATTERN.test(field.key) || !FIELD_TYPES.has(field.type) || !field.label.trim()) {
    throw new Error('Invalid configuration schema field');
  }
  if (field.type === 'password' && field.sensitive !== true) throw new Error('Password fields must be sensitive');
  if (field.sensitive && field.type !== 'password') throw new Error('Sensitive fields must use password type');
  if (field.type === 'select' && (!field.options?.length || field.options.some((option) => !option.value || !option.label))) {
    throw new Error('Select fields require options');
  }
  if (field.type !== 'select' && field.options !== undefined) throw new Error('Options require select field');
  if ((field.min !== undefined || field.max !== undefined) && field.type !== 'number') throw new Error('Bounds require number field');
  if (field.min !== undefined && field.max !== undefined && field.min > field.max) throw new Error('Invalid number bounds');
}

export function validatePerceptionPluginManifest(manifest: PerceptionPluginManifest): void {
  assertExactKeys(manifest, ['id', 'name', 'version', 'hostApi', 'entry', 'source', 'transport', 'capabilities', 'permissions', 'configurationSchema'], 'plugin manifest');
  assertSafePerceptionId(manifest.id, 'plugin id');
  if (!manifest.name.trim() || !VERSION_PATTERN.test(manifest.version)) throw new Error('Invalid plugin identity');
  if (manifest.hostApi !== PERCEPTION_PLUGIN_HOST_API_VERSION) throw new Error('Incompatible plugin host API');
  if (!ENTRY_PATTERN.test(manifest.entry) || manifest.entry.includes('..') || manifest.entry.includes('://') || manifest.entry.includes('\\')) {
    throw new Error('Invalid plugin entry');
  }
  if (!SOURCES.has(manifest.source) || !TRANSPORTS.has(manifest.transport)) throw new Error('Invalid plugin source or transport');
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length || manifest.capabilities.some((value) => !CAPABILITIES.has(value))) {
    throw new Error('Invalid plugin capability');
  }
  if (new Set(manifest.permissions).size !== manifest.permissions.length || manifest.permissions.some((value) => !PERMISSIONS.has(value))) {
    throw new Error('Invalid plugin permission');
  }
  const schema = manifest.configurationSchema;
  assertExactKeys(schema, ['version', 'fields'], 'configuration schema');
  if (schema.version !== '1.0' || !Array.isArray(schema.fields)) throw new Error('Invalid configuration schema');
  schema.fields.forEach(assertConfigurationField);
  if (new Set(schema.fields.map((field) => field.key)).size !== schema.fields.length) throw new Error('Duplicate configuration field');
}

export function assertPluginEvent(event: Parameters<typeof validatePerceptionEvent>[0], manifest: PerceptionPluginManifest, connectorId: string): void {
  validatePerceptionEvent(event);
  if (event.source !== manifest.source || event.connectorId !== connectorId) throw new Error('Plugin event scope mismatch');
  if (!manifest.capabilities.includes('inbound-events')) throw new Error('Plugin lacks inbound event capability');
}
