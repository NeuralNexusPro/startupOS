import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type {
  JsonValue,
  PerceptionPluginRuntimeContext,
  PluginCapabilityAuthorization,
  PluginCapabilityCatalog,
  PluginCapabilityInvocation,
  PluginCapabilityProvider,
} from '@originos/core/modules/perception-runtime/plugins';

const SERVICES = ['calendar', 'todo'] as const;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const FORBIDDEN_ARGUMENT_KEYS = new Set([
  'connectorId', 'credentials', 'secret', 'token', 'url', 'method', 'sdkPath', 'command', 'executable',
]);

export interface WeComOfficeCli {
  run(args: readonly string[], signal: AbortSignal, configDir?: string): Promise<string>;
}

interface ServiceSchema {
  methods: Array<{ name: string; description: string }>;
}

interface MethodSchema {
  method: string;
  description: string;
  request: Record<string, JsonValue>;
  response: Record<string, JsonValue>;
  schemas: Record<string, Record<string, JsonValue>>;
}

function resolveCliBinary(): string {
  const packageName = ({
    'darwin-arm64': '@wecom/cli-darwin-arm64', 'darwin-x64': '@wecom/cli-darwin-x64',
    'linux-arm64': '@wecom/cli-linux-arm64', 'linux-x64': '@wecom/cli-linux-x64',
    'win32-x64': '@wecom/cli-win32-x64',
  } as Record<string, string>)[`${process.platform}-${process.arch}`];
  if (!packageName) throw new Error('WECOM_OFFICE_CLI_UNSUPPORTED_PLATFORM');
  const cliPackage = require.resolve('@wecom/cli/package.json');
  const platformPackage = createRequire(cliPackage).resolve(`${packageName}/package.json`);
  const binary = path.join(path.dirname(platformPackage), 'bin', process.platform === 'win32' ? 'wecom-cli.exe' : 'wecom-cli');
  return binary.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2');
}

class DefaultWeComOfficeCli implements WeComOfficeCli {
  async run(args: readonly string[], signal: AbortSignal, configDir?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      if (configDir) {
        mkdirSync(configDir, { recursive: true, mode: 0o700 });
        // The CLI's token override takes precedence over its credential file.
        // A parent-shell token or injected headers must not cross bot boundaries.
        for (const key of Object.keys(env)) {
          if (key === 'WECOM_CLI_ACCESS_TOKEN' || key === 'WECOM_CLI_LOG_DIR' || key === 'WECOM_CLI_LOG_LEVEL' ||
            key.startsWith('WECOM_CLI_ADDITIONAL_HEADERS')) delete env[key];
        }
        env.WECOM_CLI_CONFIG_DIR = configDir;
      }
      execFile(resolveCliBinary(), [...args], {
        encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES,
        timeout: args[0] === 'auth' && args[1] === 'init' ? 5 * 60_000 : 30_000,
        windowsHide: true, signal,
        env,
      }, (error, stdout) => {
        if (error) {
          // The CLI can exit nonzero with a structured platform rejection on stdout.
          // Only inspect the numeric error code; never expose the response body.
          const platformCode = parsePlatformErrorCode(stdout);
          reject(new Error(platformCode === 850003 ? 'IM_CAPABILITY_SERVICE_AUTHORIZATION_REQUIRED'
            : platformCode !== undefined ? 'IM_CAPABILITY_PLATFORM_REJECTED' : 'WECOM_OFFICE_CLI_FAILED'));
        } else resolve(stdout);
      });
    });
  }
}

function parsePlatformErrorCode(output: string): number | undefined {
  if (Buffer.byteLength(output) > MAX_OUTPUT_BYTES) return undefined;
  try {
    const response: unknown = JSON.parse(output);
    if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined;
    const code = (response as Record<string, unknown>).errcode;
    return typeof code === 'number' && Number.isInteger(code) && code !== 0 ? code : undefined;
  } catch { return undefined; }
}

function parseObject(text: string): Record<string, JsonValue> {
  if (Buffer.byteLength(text) > MAX_OUTPUT_BYTES) throw new Error('WECOM_OFFICE_CLI_INVALID_OUTPUT');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('WECOM_OFFICE_CLI_INVALID_OUTPUT');
  }
  return value as Record<string, JsonValue>;
}

function methodArgs(name: string): string[] {
  if (!/^(calendar|todo)(?:\.[a-z][a-z0-9_-]*)+$/.test(name)) throw new Error('WECOM_OFFICE_METHOD_UNSUPPORTED');
  return name.split('.');
}

function inlineSchema(
  value: JsonValue,
  definitions: MethodSchema['schemas'],
  seen = new Set<string>(),
  depth = 0
): JsonValue {
  if (depth > 32) throw new Error('WECOM_OFFICE_SCHEMA_INVALID');
  if (Array.isArray(value)) return value.map((item) => inlineSchema(item, definitions, new Set(seen), depth + 1));
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, JsonValue>;
  const reference = source.$ref;
  let base: Record<string, JsonValue> = source;
  if (typeof reference === 'string') {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(reference) || seen.has(reference) || !definitions[reference]) {
      throw new Error('WECOM_OFFICE_SCHEMA_INVALID');
    }
    const nextSeen = new Set(seen).add(reference);
    base = {
      ...definitions[reference],
      ...Object.fromEntries(Object.entries(source).filter(([key]) => key !== '$ref')),
    };
    seen = nextSeen;
  }
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(base)) {
    if (key !== 'format') result[key] = inlineSchema(child, definitions, new Set(seen), depth + 1);
  }
  return result;
}

function effect(name: string): 'read' | 'write' | 'destructive' | 'unknown' {
  if (/\.(delete|cancel)$/.test(name)) return 'destructive';
  if (/\.(create|update|finish)$/.test(name)) return 'write';
  if (/\.(get|list|search)$/.test(name)) return 'read';
  return 'unknown';
}

function containsForbiddenKey(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_ARGUMENT_KEYS.has(key) || containsForbiddenKey(child));
}

function validateSchema(schema: Record<string, JsonValue>, value: JsonValue, depth = 0): boolean {
  if (depth > 32) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) return false;
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  if (Array.isArray(schema.allOf) && !schema.allOf.every((item) => item && typeof item === 'object' && !Array.isArray(item)
    && validateSchema(item as Record<string, JsonValue>, value, depth + 1))) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((item) => item && typeof item === 'object' && !Array.isArray(item)
    && validateSchema(item as Record<string, JsonValue>, value, depth + 1))) return false;
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((item) => item && typeof item === 'object' && !Array.isArray(item)
    && validateSchema(item as Record<string, JsonValue>, value, depth + 1)).length !== 1) return false;
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const object = value as Record<string, JsonValue>;
      const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
        ? schema.properties as Record<string, JsonValue> : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      if (required.some((key) => typeof key !== 'string' || !(key in object))) return false;
      if (schema.additionalProperties === false && Object.keys(object).some((key) => !(key in properties))) return false;
      return Object.entries(object).every(([key, child]) => {
        const childSchema = properties[key];
        return childSchema === undefined || Boolean(childSchema && typeof childSchema === 'object' && !Array.isArray(childSchema)
          && validateSchema(childSchema as Record<string, JsonValue>, child, depth + 1));
      });
    }
    case 'array': {
      if (!Array.isArray(value)) return false;
      if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false;
      if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false;
      const itemSchema = schema.items;
      return itemSchema === undefined || Boolean(itemSchema && typeof itemSchema === 'object' && !Array.isArray(itemSchema)
        && value.every((item) => validateSchema(itemSchema as Record<string, JsonValue>, item, depth + 1)));
    }
    case 'string':
      return typeof value === 'string'
        && (typeof schema.minLength !== 'number' || value.length >= schema.minLength)
        && (typeof schema.maxLength !== 'number' || value.length <= schema.maxLength);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
        && (typeof schema.minimum !== 'number' || value >= schema.minimum)
        && (typeof schema.maximum !== 'number' || value <= schema.maximum);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        && (typeof schema.minimum !== 'number' || value >= schema.minimum)
        && (typeof schema.maximum !== 'number' || value <= schema.maximum);
    case 'boolean': return typeof value === 'boolean';
    case undefined: return true;
    default: return false;
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function catalogKey(context: PerceptionPluginRuntimeContext): string {
  return JSON.stringify([context.connectorId, context.settings.botId, context.officeAuthDir]);
}

export class WeComOfficeCapabilityProvider implements PluginCapabilityProvider {
  private readonly cli: WeComOfficeCli;
  private readonly catalogPromises = new Map<string, Promise<PluginCapabilityCatalog>>();
  private readonly schemas = new Map<string, Map<string, Record<string, JsonValue>>>();

  constructor(cli: WeComOfficeCli = new DefaultWeComOfficeCli()) {
    this.cli = cli;
  }

  list(context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityCatalog> {
    const key = catalogKey(context);
    const cached = this.catalogPromises.get(key);
    if (cached) return cached;
    const loading = this.loadCatalog(context, signal).catch((error) => {
      this.catalogPromises.delete(key);
      throw error;
    });
    this.catalogPromises.set(key, loading);
    return loading;
  }

  private async loadCatalog(context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityCatalog> {
    const configDir = context.officeAuthDir;
    const versionOutput = await this.cli.run(['--version'], signal, configDir);
    const providerVersion = /\b(\d+\.\d+\.\d+)\b/.exec(versionOutput)?.[1];
    if (!providerVersion) throw new Error('WECOM_OFFICE_CLI_INVALID_VERSION');
    const capabilities: PluginCapabilityCatalog['capabilities'] = [];
    const schemas = new Map<string, Record<string, JsonValue>>();
    for (const service of SERVICES) {
      const serviceSchema = parseObject(await this.cli.run([service, '--schema'], signal, configDir)) as unknown as ServiceSchema;
      if (!Array.isArray(serviceSchema.methods)) throw new Error('WECOM_OFFICE_SCHEMA_INVALID');
      for (const summary of serviceSchema.methods) {
        if (!summary || typeof summary.name !== 'string' || typeof summary.description !== 'string') throw new Error('WECOM_OFFICE_SCHEMA_INVALID');
        const operation = parseObject(await this.cli.run([...methodArgs(summary.name), '--schema'], signal, configDir)) as unknown as MethodSchema;
        if (operation.method !== summary.name || !operation.request || !operation.schemas) throw new Error('WECOM_OFFICE_SCHEMA_INVALID');
        const inputSchema = inlineSchema(operation.request, operation.schemas) as Record<string, JsonValue>;
        inputSchema.additionalProperties = false;
        schemas.set(operation.method, inputSchema);
        capabilities.push({
          name: operation.method,
          description: operation.description || summary.description,
          inputSchema,
          resultDescription: '企业微信官方 CLI JSON 响应',
          requiredScopes: [`wecom.${service}`],
          identityModes: ['user'],
          effect: effect(operation.method),
        });
      }
    }
    capabilities.sort((left, right) => left.name.localeCompare(right.name));
    this.schemas.set(catalogKey(context), schemas);
    return {
      revision: digest(JSON.stringify(capabilities)),
      provider: 'wecom-cli',
      providerVersion,
      capabilities,
    };
  }

  async authorization(context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityAuthorization> {
    let status: PluginCapabilityAuthorization['status'] = 'unknown';
    let identity = '';
    try {
      const rawStatus = (await this.cli.run(['auth', 'show', '--status'], signal, context.officeAuthDir)).trim();
      status = rawStatus === 'authorized' ? 'authorized' : rawStatus === 'unauthorized' ? 'needs_authorization' : 'unknown';
      const configuredBotId = typeof context.settings.botId === 'string' ? context.settings.botId.trim() : '';
      if (status === 'authorized' && configuredBotId) {
        const authDetails = await this.cli.run(['auth', 'show'], signal, context.officeAuthDir);
        const authorizedBotId = /^Bot ID:\s*([^\s]+)\s*$/m.exec(authDetails)?.[1];
        if (!authorizedBotId) status = 'unknown';
        else if (authorizedBotId !== configuredBotId) status = 'needs_authorization';
      }
      if (status === 'authorized') identity = (await this.cli.run(['identity', 'whoami'], signal, context.officeAuthDir)).trim();
    } catch {
      status = 'unknown';
    }
    if (!identity) status = status === 'needs_authorization' ? status : 'unknown';
    const identityRef = identity ? `identity-${digest(identity)}` : 'identity-unavailable';
    const catalog = await this.catalogPromises.get(catalogKey(context))?.catch(() => undefined);
    const scopes = status === 'authorized'
      ? [...new Set(catalog?.capabilities.flatMap((item) => item.requiredScopes) ?? [])].sort()
      : [];
    return {
      principalId: identityRef,
      tenantId: identityRef,
      revision: digest(JSON.stringify([context.connectorId, status, identityRef, scopes])),
      identityMode: 'user',
      status,
      scopes,
    };
  }

  async requestAuthorization(
    context: PerceptionPluginRuntimeContext,
    signal: AbortSignal
  ): Promise<PluginCapabilityAuthorization> {
    const current = await this.authorization(context, signal);
    if (current.status === 'authorized') return current;
    if (!context.officeAuthDir) throw new Error('IM_CAPABILITY_AUTHORIZATION_UNAVAILABLE');

    // The CLI opens its browser-based QR flow. Its credential file is isolated
    // by WECOM_CLI_CONFIG_DIR, so multiple WeCom connectors never share tokens.
    try {
      await this.cli.run(['auth', 'init', '--noninteractive'], signal, context.officeAuthDir);
    } catch {
      throw new Error('IM_CAPABILITY_AUTHORIZATION_REQUIRED');
    }
    const authorized = await this.authorization(context, signal);
    if (authorized.status !== 'authorized') throw new Error('IM_CAPABILITY_AUTHORIZATION_REQUIRED');
    return authorized;
  }

  validate(name: string, arguments_: Record<string, JsonValue>, context?: PerceptionPluginRuntimeContext): boolean {
    const schema = context ? this.schemas.get(catalogKey(context))?.get(name) : undefined;
    if (!schema || containsForbiddenKey(arguments_)) return false;
    return validateSchema(schema, arguments_);
  }

  async invoke(
    _context: PerceptionPluginRuntimeContext,
    input: PluginCapabilityInvocation,
    authorization: PluginCapabilityAuthorization,
    signal: AbortSignal
  ): Promise<JsonValue> {
    if (authorization.status !== 'authorized' || !this.validate(input.name, input.arguments, _context)) {
      throw new Error('WECOM_OFFICE_CAPABILITY_DENIED');
    }
    const output = await this.cli.run([...methodArgs(input.name), '--json', JSON.stringify(input.arguments)], signal, _context.officeAuthDir);
    const platformCode = parsePlatformErrorCode(output);
    if (platformCode !== undefined) throw new Error(platformCode === 850003
      ? 'IM_CAPABILITY_SERVICE_AUTHORIZATION_REQUIRED' : 'IM_CAPABILITY_PLATFORM_REJECTED');
    return parseObject(output);
  }
}
