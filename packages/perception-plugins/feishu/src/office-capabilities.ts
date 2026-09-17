import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  JsonValue, PerceptionPluginRuntimeContext, PluginCapabilityAuthorization,
  PluginCapabilityCatalog, PluginCapabilityInvocation, PluginCapabilityProvider,
} from '@originos/core/modules/perception-runtime/plugins';

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DOMAINS = ['calendar', 'task'] as const;
const FORBIDDEN_ARGUMENT_KEYS = new Set(['profile', 'token', 'access_token', 'app_id', 'app_secret', 'as', 'yes']);

export interface FeishuOfficeCli {
  run(args: readonly string[], signal: AbortSignal): Promise<string>;
}

interface Operation {
  command: string[];
  schema: Record<string, JsonValue>;
}

function resolveCliBinary(): string {
  const configured = process.env.ORIGINOS_LARK_CLI_PATH?.trim();
  if (configured) return configured;
  const executable = process.platform === 'win32' ? 'lark-cli.exe' : 'lark-cli';
  const candidates = process.platform === 'win32'
    ? [path.join(process.env.LOCALAPPDATA ?? '', 'lark-cli', executable)]
    : [path.join(os.homedir(), '.local', 'bin', executable), '/opt/homebrew/bin/lark-cli', '/usr/local/bin/lark-cli'];
  return candidates.find(candidate => candidate && fs.existsSync(candidate)) ?? executable;
}

class DefaultFeishuOfficeCli implements FeishuOfficeCli {
  run(args: readonly string[], signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(resolveCliBinary(), [...args], {
        encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: 30_000, windowsHide: true, signal,
      }, (error, stdout) => error ? reject(new Error('FEISHU_OFFICE_CLI_FAILED')) : resolve(stdout));
    });
  }
}

function parseJson(text: string): JsonValue {
  if (Buffer.byteLength(text) > MAX_OUTPUT_BYTES) throw new Error('FEISHU_OFFICE_CLI_INVALID_OUTPUT');
  const value: unknown = JSON.parse(text);
  if (value === undefined) throw new Error('FEISHU_OFFICE_CLI_INVALID_OUTPUT');
  return value as JsonValue;
}

function object(value: JsonValue): Record<string, JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('FEISHU_OFFICE_CLI_INVALID_OUTPUT');
  return value as Record<string, JsonValue>;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function commandNames(help: string): string[] {
  const section = help.match(/Available Commands:\s*\n([\s\S]*?)\n\s*Flags:/)?.[1] ?? '';
  return section.split('\n').map(line => /^\s{2}([a-z][a-z0-9._-]*)\s/.exec(line)?.[1])
    .filter((value): value is string => Boolean(value));
}

function effect(value: JsonValue): 'read' | 'write' | 'destructive' | 'unknown' {
  return value === 'read' ? 'read' : value === 'write' ? 'write'
    : value === 'high-risk-write' ? 'destructive' : 'unknown';
}

function containsForbiddenKey(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_ARGUMENT_KEYS.has(key) || containsForbiddenKey(child));
}

function valid(schema: Record<string, JsonValue>, value: JsonValue, depth = 0): boolean {
  if (depth > 32) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) return false;
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const record = value as Record<string, JsonValue>;
      const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
        ? schema.properties as Record<string, JsonValue> : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      if (required.some(key => typeof key !== 'string' || !(key in record))) return false;
      if (schema.additionalProperties === false && Object.keys(record).some(key => !(key in properties))) return false;
      return Object.entries(record).every(([key, child]) => {
        const childSchema = properties[key];
        return childSchema === undefined || Boolean(childSchema && typeof childSchema === 'object' && !Array.isArray(childSchema)
          && valid(childSchema as Record<string, JsonValue>, child, depth + 1));
      });
    }
    case 'array': {
      if (!Array.isArray(value)) return false;
      const itemSchema = schema.items;
      return !itemSchema || Boolean(typeof itemSchema === 'object' && !Array.isArray(itemSchema)
        && value.every(item => valid(itemSchema as Record<string, JsonValue>, item, depth + 1)));
    }
    case 'string': return typeof value === 'string';
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case undefined: return true;
    default: return false;
  }
}

function profileFrom(value: Record<string, JsonValue>): string {
  for (const key of ['profile', 'profile_name', 'current_profile']) {
    if (typeof value[key] === 'string' && value[key]) return value[key];
  }
  const profiles = value.profiles;
  if (!Array.isArray(profiles)) return '';
  for (const item of profiles) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const candidate = item as Record<string, JsonValue>;
    if ((candidate.current === true || candidate.active === true) && typeof candidate.name === 'string') return candidate.name;
  }
  return '';
}

function invocationArgs(operation: Operation, arguments_: Record<string, JsonValue>): string[] {
  const args = [...operation.command];
  for (const [key, value] of Object.entries(arguments_)) {
    if (!['params', 'data'].includes(key)) throw new Error('FEISHU_OFFICE_CAPABILITY_DENIED');
    args.push(`--${key}`, JSON.stringify(value));
  }
  return args;
}

export class FeishuOfficeCapabilityProvider implements PluginCapabilityProvider {
  private catalogPromise?: Promise<PluginCapabilityCatalog>;
  private readonly operations = new Map<string, Operation>();
  private readonly profiles = new Map<string, string>();

  constructor(private readonly cli: FeishuOfficeCli = new DefaultFeishuOfficeCli()) {}

  list(_context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityCatalog> {
    return this.catalogPromise ??= this.loadCatalog(signal).catch(error => {
      this.catalogPromise = undefined;
      throw error;
    });
  }

  private async loadCatalog(signal: AbortSignal): Promise<PluginCapabilityCatalog> {
    const version = /\b(\d+\.\d+\.\d+)\b/.exec(await this.cli.run(['--version'], signal))?.[1];
    if (!version) throw new Error('FEISHU_OFFICE_CLI_INVALID_VERSION');
    const capabilities: PluginCapabilityCatalog['capabilities'] = [];
    for (const domain of DOMAINS) {
      for (const resource of commandNames(await this.cli.run([domain, '--help'], signal))) {
        for (const method of commandNames(await this.cli.run([domain, resource, '--help'], signal))) {
          const name = `${domain}.${resource}.${method}`;
          const source = object(parseJson(await this.cli.run(['schema', name], signal)));
          const inputSchema = object(source.inputSchema ?? {});
          if (source.name !== `${domain} ${resource} ${method}` || inputSchema.type !== 'object') throw new Error('FEISHU_OFFICE_SCHEMA_INVALID');
          inputSchema.additionalProperties = false;
          const meta = object(source._meta ?? {});
          const requiredScopes = Array.isArray(meta.required_scopes)
            ? meta.required_scopes.filter((scope): scope is string => typeof scope === 'string') : [];
          const accessTokens = Array.isArray(meta.access_tokens) ? meta.access_tokens : [];
          if (!accessTokens.includes('user')) continue;
          this.operations.set(name, { command: [domain, resource, method], schema: inputSchema });
          capabilities.push({
            name,
            description: typeof source.description === 'string' && source.description ? source.description : name,
            inputSchema,
            resultDescription: '飞书官方 lark-cli JSON 响应',
            requiredScopes,
            identityModes: ['user'],
            effect: effect(meta.risk),
          });
        }
      }
    }
    capabilities.sort((left, right) => left.name.localeCompare(right.name));
    return { revision: digest(JSON.stringify(capabilities)), provider: 'lark-cli', providerVersion: version, capabilities };
  }

  async authorization(context: PerceptionPluginRuntimeContext, signal: AbortSignal): Promise<PluginCapabilityAuthorization> {
    let status: PluginCapabilityAuthorization['status'] = 'needs_authorization';
    let profile = '';
    let identity = '';
    let scopes: string[] = [];
    try {
      const auth = object(parseJson(await this.cli.run(['auth', 'status', '--json'], signal)));
      if (auth.ok !== false && auth.authenticated !== false) {
        const whoami = object(parseJson(await this.cli.run(['whoami', '--as', 'user'], signal)));
        if (whoami.ok !== false) {
          profile = profileFrom(whoami) || profileFrom(object(parseJson(await this.cli.run(['profile', 'list'], signal))));
          identity = JSON.stringify(whoami);
          const collect = (value: JsonValue): void => {
            if (Array.isArray(value)) {
              for (const item of value) if (typeof item === 'string' && /^[a-z][a-z0-9._:-]{1,191}$/.test(item)) scopes.push(item);
            } else if (value && typeof value === 'object') {
              for (const [key, child] of Object.entries(value)) {
                if (key === 'scope' || key === 'scopes' || key === 'data') collect(child);
              }
            }
          };
          collect(parseJson(await this.cli.run(['auth', 'scopes', '--json'], signal)));
          scopes = [...new Set(scopes)].sort();
          status = profile ? 'authorized' : 'unknown';
        }
      }
    } catch { status = 'needs_authorization'; }
    if (profile) this.profiles.set(context.connectorId, profile); else this.profiles.delete(context.connectorId);
    const identityRef = identity ? `identity-${digest(identity)}` : 'identity-unavailable';
    return {
      principalId: identityRef, tenantId: identityRef,
      revision: digest(JSON.stringify([context.connectorId, status, identityRef, scopes])),
      identityMode: 'user', status, scopes,
    };
  }

  validate(name: string, arguments_: Record<string, JsonValue>): boolean {
    const operation = this.operations.get(name);
    return Boolean(operation && Object.getPrototypeOf(arguments_) === Object.prototype
      && !containsForbiddenKey(arguments_) && valid(operation.schema, arguments_));
  }

  async invoke(context: PerceptionPluginRuntimeContext, input: PluginCapabilityInvocation,
    authorization: PluginCapabilityAuthorization, signal: AbortSignal): Promise<JsonValue> {
    const operation = this.operations.get(input.name);
    const profile = this.profiles.get(context.connectorId);
    if (!operation || !profile || authorization.status !== 'authorized' || !this.validate(input.name, input.arguments)) {
      throw new Error('FEISHU_OFFICE_CAPABILITY_DENIED');
    }
    return parseJson(await this.cli.run([
      '--profile', profile, ...invocationArgs(operation, input.arguments), '--as', 'user', '--json',
    ], signal));
  }
}
